import { MessageId, RunId, ScheduledTaskId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";
import {
  BOT_FAILURE_REALERT_MS,
  BOT_LOG_LIMIT,
  type BotMessage,
  botHeadline,
  botMessages,
  botTimelineEntries,
  isRunStartedByUser,
  latestBotReply,
  mergeBotLog,
  shouldAlertBotFailure,
} from "./botLogic";

const SETUP = MessageId.make("setup");
const T0 = "2026-11-19T10:00:00.000Z";
const at = DateTime.makeUnsafe(T0);

function message(
  id: string,
  role: ChatMessage["role"],
  runId: string | null,
  extra: Partial<ChatMessage> = {},
): TimelineEntry {
  return {
    id,
    kind: "message",
    createdAt: T0,
    message: {
      id: MessageId.make(id),
      role,
      text: id,
      runId: runId === null ? null : RunId.make(runId),
      streaming: false,
      createdAt: T0,
      updatedAt: T0,
      ...extra,
    },
  };
}

function sent(id: string, runId: string, createdAt = T0): TimelineEntry {
  return { id, kind: "sent-message", createdAt, runId: RunId.make(runId), text: id };
}

const other = (id: string, kind: string, itemType = "command") =>
  ({
    id,
    kind,
    createdAt: T0,
    projectedItem: { item: { type: itemType } },
  }) as unknown as TimelineEntry;

const logged = (itemId: string, iso: string): BotMessage => ({
  itemId,
  runId: "old",
  text: itemId,
  at: iso,
});

describe("botTimelineEntries", () => {
  it("keeps what the user typed, sent messages, replies to the user's runs and requests", () => {
    const entries = [
      message("setup", "user", "r0"),
      message("intro-narration", "assistant", "r0"),
      sent("intro", "r0"),
      message("wake", "user", "r1", { scheduledTaskId: ScheduledTaskId.make("task") }),
      other("check-ci", "work"),
      other("fork-marker", "event", "fork"),
      message("quiet-reply", "assistant", "r1"),
      message("question", "user", "r2"),
      message("narration", "assistant", "r2"),
      other("token", "event", "secret_request"),
      message("answer", "assistant", "r2"),
      message("wake-2", "user", "r3", { scheduledTaskId: ScheduledTaskId.make("task") }),
      sent("alert", "r3"),
      message("queued", "user", null),
    ];
    expect(botTimelineEntries(entries, SETUP, []).map((entry) => entry.id)).toEqual([
      "intro",
      "question",
      "token",
      "answer",
      "alert",
      "queued",
    ]);
  });

  it("puts logged messages older than the loaded turns first", () => {
    const entries = [
      message("wake", "user", "r9", { scheduledTaskId: ScheduledTaskId.make("task") }),
      sent("recent", "r9", "2026-11-19T12:00:00.000Z"),
    ];
    const log = [
      logged("old", "2026-11-19T09:00:00.000Z"),
      logged("recent", "2026-11-19T12:00:00.000Z"),
    ];
    expect(botTimelineEntries(entries, SETUP, log).map((entry) => entry.id)).toEqual([
      "old",
      "recent",
    ]);
  });
});

describe("mergeBotLog", () => {
  it("adds unseen messages in time order and keeps the newest", () => {
    const log = Array.from({ length: BOT_LOG_LIMIT }, (_, index) =>
      logged(`m${index}`, `2026-11-19T09:${String(index).padStart(2, "0")}:00.000Z`),
    );
    const fresh = logged("new", "2026-11-19T11:00:00.000Z");
    const merged = mergeBotLog(log, [log[BOT_LOG_LIMIT - 1]!, fresh]);
    expect(merged.added).toEqual([fresh]);
    expect(merged.messages).toHaveLength(BOT_LOG_LIMIT);
    expect(merged.messages.at(-1)).toEqual(fresh);
    expect(merged.messages[0]?.itemId).toBe("m1");
  });
});

describe("shouldAlertBotFailure", () => {
  it("alerts the first failure of a streak, then once a day", () => {
    const alertedAt = "2026-11-19T09:00:00.000Z";
    const at = Date.parse(alertedAt);
    expect(shouldAlertBotFailure(undefined, at)).toBe(true);
    expect(shouldAlertBotFailure(alertedAt, at + BOT_FAILURE_REALERT_MS - 1)).toBe(false);
    expect(shouldAlertBotFailure(alertedAt, at + BOT_FAILURE_REALERT_MS)).toBe(true);
    expect(shouldAlertBotFailure("garbage", at)).toBe(true);
  });
});

describe("botMessages", () => {
  const tool = (id: string, output: unknown, status = "completed") => ({
    id,
    type: "dynamic_tool",
    status,
    runId: "r1",
    updatedAt: at,
    toolName: "mcp__t3-code__send_to_user",
    output,
  });
  const payload = (sentMessage: string) => [
    { type: "text", text: JSON.stringify({ sentMessage, message: "Shown to the user." }) },
  ];

  it("returns completed send_to_user messages, oldest first", () => {
    expect(
      botMessages([
        tool("old", payload("first")),
        tool("running", undefined, "in_progress"),
        { ...tool("other", payload("not a message")), toolName: "mcp__t3-code__t3_thread_list" },
        tool("new", payload("second")),
      ]),
    ).toEqual([
      { itemId: "old", runId: "r1", text: "first", at: T0 },
      { itemId: "new", runId: "r1", text: "second", at: T0 },
    ]);
  });
});

const userItem = (runId: string, messageId: string, extra: object = {}) => ({
  id: `item-${messageId}`,
  type: "user_message",
  status: "completed",
  runId,
  messageId: MessageId.make(messageId),
  text: "hi",
  createdBy: "user" as const,
  ...extra,
});

describe("isRunStartedByUser", () => {
  it("is true only for runs the user started by typing", () => {
    const items = [
      userItem("r0", "setup"),
      userItem("r1", "wake", { scheduledTaskId: ScheduledTaskId.make("task") }),
      userItem("r2", "question"),
    ];
    expect(isRunStartedByUser(items, "r0", SETUP)).toBe(false);
    expect(isRunStartedByUser(items, "r1", SETUP)).toBe(false);
    expect(isRunStartedByUser(items, "r2", SETUP)).toBe(true);
  });
});

describe("latestBotReply", () => {
  const reply = (id: string, runId: string, status = "completed") => ({
    id,
    type: "assistant_message",
    status,
    runId,
  });
  const run = (id: string, done = true) => ({ id, completedAt: done ? at : null });

  it("is the final reply of the latest finished run the user started, never a wake-up's", () => {
    const wake = { scheduledTaskId: ScheduledTaskId.make("task") };
    const items = [
      userItem("r0", "setup"),
      reply("intro", "r0"),
      userItem("r1", "question"),
      reply("progress", "r1"),
      reply("answer", "r1"),
      userItem("r2", "wake", wake),
      reply("quiet", "r2"),
      userItem("r3", "follow-up"),
      reply("thinking aloud", "r3"),
    ];
    const runs = [run("r0"), run("r1"), run("r2"), run("r3", false)];
    expect(latestBotReply(items, runs, SETUP)).toEqual({ itemId: "answer", runId: "r1", at: T0 });
    expect(latestBotReply(items.slice(0, 2), runs, SETUP)).toBeNull();
  });
});

describe("botHeadline", () => {
  it("is the first non-empty line without markdown markers", () => {
    expect(botHeadline("\n**5 PRs need attention**\n\n- #2117 failing")).toBe(
      "5 PRs need attention",
    );
    expect(botHeadline("## 2 monitors created\nDetails")).toBe("2 monitors created");
    expect(botHeadline("- `prod-sql` is down")).toBe("prod-sql is down");
    expect(botHeadline("Got it, UK time.")).toBe("Got it, UK time.");
  });
});
