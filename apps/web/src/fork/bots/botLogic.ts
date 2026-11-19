import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import type { MessageId, RunId } from "@t3tools/contracts";
import { sentMessageFromToolItem } from "@t3tools/shared/toolOutput";
import type * as DateTime from "effect/DateTime";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";

export interface BotMessage {
  readonly itemId: string;
  readonly runId: RunId | null;
  readonly text: string;
  readonly at: DateTime.Utc;
}

/** The latest message the bot sent with `send_to_user`; quiet runs leave it unchanged. */
export function latestBotMessage(
  turnItems: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly runId: RunId | null;
    readonly updatedAt?: DateTime.Utc;
    readonly toolName?: string | null;
    readonly output?: unknown;
  }>,
): BotMessage | null {
  for (let index = turnItems.length - 1; index >= 0; index -= 1) {
    const item = turnItems[index]!;
    if (item.type !== "dynamic_tool" || item.status !== "completed") continue;
    const text = sentMessageFromToolItem({ toolName: item.toolName, output: item.output });
    if (text !== undefined && item.updatedAt !== undefined) {
      return { itemId: item.id, runId: item.runId, text, at: item.updatedAt };
    }
  }
  return null;
}

function isTypedByUser(message: ChatMessage, setupMessageId: MessageId): boolean {
  return (
    message.role === "user" &&
    message.id !== setupMessageId &&
    resolveUserMessagePresentation(message).attribution === null
  );
}

/**
 * The conversation as chat: what the user typed, what the bot sent with `send_to_user`, and its
 * final reply to a run the user started. Wake-up prompts and work stay out.
 */
export function botTimelineEntries(
  entries: ReadonlyArray<TimelineEntry>,
  setupMessageId: MessageId,
): TimelineEntry[] {
  const userRuns = new Set<RunId>();
  for (const entry of entries) {
    if (entry.kind !== "message" || entry.message.runId === null) continue;
    if (isTypedByUser(entry.message, setupMessageId)) userRuns.add(entry.message.runId);
  }
  const replyByRun = new Map<RunId, string>();
  for (const entry of entries) {
    if (entry.kind !== "message" || entry.message.role !== "assistant") continue;
    const runId = entry.message.runId;
    if (runId !== null && userRuns.has(runId)) replyByRun.set(runId, entry.id);
  }
  return entries.filter((entry) => {
    switch (entry.kind) {
      case "sent-message":
      case "html-render":
        return true;
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
}
