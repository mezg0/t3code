import { MessageId, RunId, ScheduledTaskId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "../../session-logic";
import type { ChatMessage } from "../../types";
import { botTimelineEntries, latestBotMessage } from "./botLogic";

const SETUP = MessageId.make("setup");
const at = DateTime.makeUnsafe("2026-11-19T10:00:00Z");

function message(
  id: string,
  role: ChatMessage["role"],
  runId: string | null,
  extra: Partial<ChatMessage> = {},
): TimelineEntry {
  return {
    id,
    kind: "message",
    createdAt: "2026-11-19T10:00:00Z",
    message: {
      id: MessageId.make(id),
      role,
      text: id,
      runId: runId === null ? null : RunId.make(runId),
      streaming: false,
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:00:00Z",
      ...extra,
    },
  };
}

function sent(id: string, runId: string): TimelineEntry {
  return {
    id,
    kind: "sent-message",
    createdAt: "2026-11-19T10:00:00Z",
    runId: RunId.make(runId),
    text: id,
  };
}

const work = (id: string) => ({ id, kind: "work" }) as unknown as TimelineEntry;

describe("botTimelineEntries", () => {
  it("keeps what the user typed, sent messages and replies to the user's runs", () => {
    const entries = [
      message("setup", "user", "r0"),
      message("intro-narration", "assistant", "r0"),
      sent("intro", "r0"),
      message("wake", "user", "r1", { scheduledTaskId: ScheduledTaskId.make("task") }),
      work("check-ci"),
      message("quiet-reply", "assistant", "r1"),
      message("question", "user", "r2"),
      message("narration", "assistant", "r2"),
      work("look"),
      message("answer", "assistant", "r2"),
      message("wake-2", "user", "r3", { scheduledTaskId: ScheduledTaskId.make("task") }),
      sent("alert", "r3"),
      message("queued", "user", null),
    ];
    expect(botTimelineEntries(entries, SETUP).map((entry) => entry.id)).toEqual([
      "intro",
      "question",
      "answer",
      "alert",
      "queued",
    ]);
  });
});

describe("latestBotMessage", () => {
  const tool = (id: string, output: unknown, status = "completed") => ({
    id,
    type: "dynamic_tool",
    status,
    runId: RunId.make("r1"),
    updatedAt: at,
    toolName: "mcp__t3-code__send_to_user",
    output,
  });
  const payload = (sentMessage: string) => [
    { type: "text", text: JSON.stringify({ sentMessage, message: "Shown to the user." }) },
  ];

  it("returns the newest completed send_to_user message", () => {
    expect(
      latestBotMessage([
        tool("old", payload("first")),
        tool("new", payload("second")),
        tool("running", undefined, "in_progress"),
        { ...tool("other", payload("not a message")), toolName: "mcp__t3-code__t3_thread_list" },
      ]),
    ).toEqual({ itemId: "new", runId: RunId.make("r1"), text: "second", at });
  });

  it("is null when the bot never messaged", () => {
    expect(latestBotMessage([])).toBeNull();
  });
});
