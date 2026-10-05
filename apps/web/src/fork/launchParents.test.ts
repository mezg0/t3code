import { ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  groupLaunchedThreads,
  isLaunchedThreadCandidate,
  launchSenderThreadId,
} from "./launchParents";

const thread = (key: string, createdAt = "2026-10-01T00:00:00.000Z") => ({ key, createdAt });
const keyOf = (item: { key: string }) => item.key;
const keys = (items: ReadonlyArray<{ key: string }> | undefined) => items?.map(keyOf);

describe("groupLaunchedThreads", () => {
  it("nests launched threads under a visible launcher, oldest first", () => {
    const groups = groupLaunchedThreads(
      [
        thread("parent"),
        thread("late", "2026-10-01T00:02:00.000Z"),
        thread("early", "2026-10-01T00:01:00.000Z"),
        thread("unrelated"),
      ],
      keyOf,
      { late: "parent", early: "parent", unrelated: null },
    );
    expect(keys(groups.roots)).toEqual(["parent", "unrelated"]);
    expect(keys(groups.childrenByParentKey.get("parent"))).toEqual(["early", "late"]);
  });

  it("keeps a thread as a root when its launcher is not visible", () => {
    const groups = groupLaunchedThreads([thread("child")], keyOf, { child: "archived" });
    expect(keys(groups.roots)).toEqual(["child"]);
    expect(groups.childrenByParentKey.size).toBe(0);
  });

  it("puts grandchildren in the top-most visible launcher's group", () => {
    const groups = groupLaunchedThreads(
      [thread("root"), thread("child"), thread("grandchild")],
      keyOf,
      { child: "root", grandchild: "child" },
    );
    expect(keys(groups.roots)).toEqual(["root"]);
    expect(keys(groups.childrenByParentKey.get("root"))?.toSorted()).toEqual([
      "child",
      "grandchild",
    ]);
  });

  it("keeps threads in a parent cycle visible as roots", () => {
    const groups = groupLaunchedThreads([thread("a"), thread("b")], keyOf, { a: "b", b: "a" });
    expect(keys(groups.roots)).toEqual(["a", "b"]);
  });
});

describe("launchSenderThreadId", () => {
  const at = (iso: string) => DateTime.makeUnsafe(iso);
  const created = at("2026-10-01T00:00:00.000Z");

  it("reads the sender of the earliest user message", () => {
    expect(
      launchSenderThreadId(
        [
          { role: "assistant", createdAt: at("2026-10-01T00:00:00.000Z") },
          {
            role: "user",
            createdAt: at("2026-10-01T00:00:30.000Z"),
            senderThreadId: ThreadId.make("later"),
          },
          {
            role: "user",
            createdAt: at("2026-10-01T00:00:01.000Z"),
            senderThreadId: ThreadId.make("launcher"),
          },
        ],
        created,
      ),
    ).toBe("launcher");
  });

  it("returns null when the first user message has no sender", () => {
    expect(
      launchSenderThreadId([{ role: "user", createdAt: at("2026-10-01T00:00:00.000Z") }], created),
    ).toBe(null);
  });

  it("ignores a sender on a message long after creation, outside the launch", () => {
    // A long thread's projection window starts mid-history, where a child's
    // report back can be the earliest message it holds.
    expect(
      launchSenderThreadId(
        [
          {
            role: "user",
            createdAt: at("2026-10-02T00:00:00.000Z"),
            senderThreadId: ThreadId.make("child"),
          },
        ],
        created,
      ),
    ).toBe(null);
  });

  it("returns undefined before any user message exists", () => {
    expect(launchSenderThreadId([], created)).toBeUndefined();
  });
});

describe("isLaunchedThreadCandidate", () => {
  const shell = (
    createdBy: "user" | "agent" | "system",
    parentThreadId: string | null,
    historyOrigin?: "native" | "v1_import",
  ) =>
    ({
      lineage: {
        parentThreadId: parentThreadId === null ? null : ThreadId.make(parentThreadId),
        relationshipToParent: parentThreadId === null ? null : "subagent",
        rootThreadId: ThreadId.make("root"),
      },
      source: { createdBy, historyOrigin },
    }) as Parameters<typeof isLaunchedThreadCandidate>[0];

  it("looks up top-level threads an agent or the server created", () => {
    expect(isLaunchedThreadCandidate(shell("agent", null))).toBe(true);
    expect(isLaunchedThreadCandidate(shell("system", null))).toBe(true);
  });

  it("skips user-created threads and threads that already have a parent", () => {
    expect(isLaunchedThreadCandidate(shell("user", null))).toBe(false);
    expect(isLaunchedThreadCandidate(shell("agent", "parent"))).toBe(false);
  });

  it("skips threads imported from V1, which never recorded a sender", () => {
    expect(isLaunchedThreadCandidate(shell("system", null, "v1_import"))).toBe(false);
  });
});
