import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import { type MessageId, RunId } from "@t3tools/contracts";
import { sentMessageFromToolItem } from "@t3tools/shared/toolOutput";
import * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";

export interface BotMessage {
  readonly itemId: string;
  readonly runId: string | null;
  readonly text: string;
  /** ISO time the message was sent. */
  readonly at: string;
}

/** How many sent messages each bot keeps locally; the server sends only recent turns. */
export const BOT_LOG_LIMIT = 50;

type TurnItemLike = {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly runId: string | null;
  readonly updatedAt?: DateTime.Utc;
  readonly toolName?: string | null;
  readonly output?: unknown;
};

/** The messages the bot sent with `send_to_user`, oldest first. */
export function botMessages(turnItems: ReadonlyArray<TurnItemLike>): BotMessage[] {
  const messages: BotMessage[] = [];
  for (const item of turnItems) {
    if (item.type !== "dynamic_tool" || item.status !== "completed") continue;
    if (item.updatedAt === undefined) continue;
    const text = sentMessageFromToolItem({ toolName: item.toolName, output: item.output });
    if (text !== undefined) {
      messages.push({
        itemId: item.id,
        runId: item.runId,
        text,
        at: DateTime.formatIso(item.updatedAt),
      });
    }
  }
  return messages;
}

/** After a bot's wake-up failure alerts, further failures stay quiet this long. */
export const BOT_FAILURE_REALERT_MS = 24 * 60 * 60 * 1000;

/** Whether a failed wake-up alerts: the first since the last success, then at most once a day. */
export function shouldAlertBotFailure(failureAlertedAt: string | undefined, now: number): boolean {
  if (failureAlertedAt === undefined) return true;
  return !(now - Date.parse(failureAlertedAt) < BOT_FAILURE_REALERT_MS);
}

/** Adds newly seen messages to the stored log, keeping the newest `BOT_LOG_LIMIT`. */
export function mergeBotLog(
  log: ReadonlyArray<BotMessage>,
  seen: ReadonlyArray<BotMessage>,
): { readonly messages: ReadonlyArray<BotMessage>; readonly added: ReadonlyArray<BotMessage> } {
  const known = new Set(log.map((message) => message.itemId));
  const added = seen.filter((message) => !known.has(message.itemId));
  if (added.length === 0) return { messages: log, added };
  const messages = [...log, ...added]
    .toSorted((left, right) => left.at.localeCompare(right.at))
    .slice(-BOT_LOG_LIMIT);
  return { messages, added };
}

function isTypedByUser(
  message: Parameters<typeof resolveUserMessagePresentation>[0],
  setupMessageId: MessageId,
): boolean {
  return (
    message.role === "user" &&
    message.id !== setupMessageId &&
    resolveUserMessagePresentation(message).attribution === null
  );
}

/** Whether the user started this run by typing to the bot, rather than a wake-up. */
export function isRunStartedByUser(
  turnItems: ReadonlyArray<
    TurnItemLike & {
      readonly messageId?: MessageId;
      readonly text?: string;
      readonly createdBy?: ChatMessage["createdBy"];
      readonly scheduledTaskId?: ChatMessage["scheduledTaskId"];
    }
  >,
  runId: string,
  setupMessageId: MessageId,
): boolean {
  return turnItems.some(
    (item) =>
      item.type === "user_message" &&
      item.runId === runId &&
      item.messageId !== undefined &&
      isTypedByUser(
        {
          id: item.messageId,
          role: "user",
          text: item.text ?? "",
          ...(item.createdBy === undefined ? {} : { createdBy: item.createdBy }),
          scheduledTaskId: item.scheduledTaskId,
        },
        setupMessageId,
      ),
  );
}

/**
 * The bot's latest reply to a run the user started by typing. The sidebar shows it beside the
 * messages it sent, since a reply is how it answers when the user writes to it.
 */
export function latestBotReply(
  turnItems: ReadonlyArray<Parameters<typeof isRunStartedByUser>[0][number]>,
  setupMessageId: MessageId,
): BotMessage | null {
  const userRuns = new Set<string>();
  for (const item of turnItems) {
    if (item.runId !== null && isRunStartedByUser([item], item.runId, setupMessageId)) {
      userRuns.add(item.runId);
    }
  }
  for (let index = turnItems.length - 1; index >= 0; index -= 1) {
    const item = turnItems[index];
    if (item === undefined || item.type !== "assistant_message" || item.status !== "completed") {
      continue;
    }
    if (item.runId === null || !userRuns.has(item.runId) || item.updatedAt === undefined) continue;
    if (!item.text) continue;
    return {
      itemId: item.id,
      runId: item.runId,
      text: item.text,
      at: DateTime.formatIso(item.updatedAt),
    };
  }
  return null;
}

const REQUEST_ITEM_TYPES = new Set(["secret_request", "link_request"]);

/**
 * The conversation as chat: what the user typed, what the bot sent with `send_to_user`, its final
 * reply to a run the user started, and requests that need the user. Wake-up prompts and work stay
 * out. Logged messages that fell out of the loaded turns come first.
 */
export function botTimelineEntries(
  entries: ReadonlyArray<TimelineEntry>,
  setupMessageId: MessageId,
  log: ReadonlyArray<BotMessage>,
): TimelineEntry[] {
  const userRuns = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "message" || entry.message.runId === null) continue;
    if (isTypedByUser(entry.message, setupMessageId)) userRuns.add(entry.message.runId);
  }
  const replyByRun = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== "message" || entry.message.role !== "assistant") continue;
    const runId = entry.message.runId;
    if (runId !== null && userRuns.has(runId)) replyByRun.set(runId, entry.id);
  }
  const kept = entries.filter((entry) => {
    switch (entry.kind) {
      case "sent-message":
      case "html-render":
        return true;
      case "event":
        return REQUEST_ITEM_TYPES.has(entry.projectedItem.item.type);
      case "message":
        if (entry.message.role === "user") return isTypedByUser(entry.message, setupMessageId);
        return (
          entry.message.role === "assistant" &&
          entry.message.runId !== null &&
          replyByRun.get(entry.message.runId) === entry.id
        );
      default:
        return false;
    }
  });
  const present = new Set(kept.map((entry) => entry.id));
  const earlier = kept[0]?.createdAt;
  const restored: TimelineEntry[] = log
    .filter(
      (message) => !present.has(message.itemId) && (earlier === undefined || message.at < earlier),
    )
    .map((message) => ({
      id: message.itemId,
      kind: "sent-message",
      createdAt: message.at,
      runId: message.runId === null ? null : RunId.make(message.runId),
      text: message.text,
    }));
  return restored.length === 0 ? kept : [...restored, ...kept];
}
