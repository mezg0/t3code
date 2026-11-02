import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  NodeId,
  ThreadId,
  type OrchestrationV2Subagent,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { delegatingThreadRef, filterSubagentRowsByTitle, t3SubagentRows } from "./threadSubagents";

const at = (minute: number) => DateTime.makeUnsafe(minute * 60_000);
const parentThreadId = ThreadId.make("parent");

const child = (
  id: string,
  minute: number,
  overrides: Partial<Record<string, unknown>> = {},
): OrchestrationV2ThreadShell =>
  ({
    id: ThreadId.make(id),
    title: id,
    status: "completed",
    archivedAt: null,
    creationSource: "mcp",
    createdAt: at(minute),
    latestRunStartedAt: at(minute),
    latestRunCompletedAt: at(minute + 1),
    lineage: { parentThreadId, relationshipToParent: "subagent" },
    ...overrides,
  }) as OrchestrationV2ThreadShell;

const agent = (
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): OrchestrationV2Subagent =>
  ({
    id: NodeId.make(id),
    origin: "app_owned",
    status: "completed",
    title: id,
    childThreadId: null,
    startedAt: at(1),
    completedAt: at(2),
    updatedAt: at(2),
    ...overrides,
  }) as OrchestrationV2Subagent;

describe("t3SubagentRows", () => {
  const rows = (
    shells: ReadonlyArray<OrchestrationV2ThreadShell>,
    subagents: ReadonlyArray<OrchestrationV2Subagent> = [],
  ) => t3SubagentRows({ threadId: parentThreadId, shells, subagents });

  it("lists older subagents the parent's recent turns no longer carry", () => {
    expect(rows([child("old", 1), child("new", 5)]).map((row) => row.key)).toEqual(["new", "old"]);
  });

  it("leaves out provider subagents, other threads' children, archived ones and forks", () => {
    expect(
      rows(
        [
          child("mine", 1),
          child("native", 2, { creationSource: "provider" }),
          child("other", 3, {
            lineage: {
              parentThreadId: ThreadId.make("other-parent"),
              relationshipToParent: "subagent",
            },
          }),
          child("archived", 4, { archivedAt: at(9) }),
          child("fork", 5, { lineage: { parentThreadId, relationshipToParent: "fork" } }),
        ],
        [agent("native-agent", { origin: "provider_native" })],
      ).map((row) => row.key),
    ).toEqual(["mine"]);
  });

  it("puts running work first, using the live record over the thread's status", () => {
    const listed = rows(
      [child("newest", 9), child("running", 1)],
      [agent("running-agent", { childThreadId: ThreadId.make("running"), status: "running" })],
    );
    expect(listed.map((row) => [row.key, row.status])).toEqual([
      ["running", "running"],
      ["newest", "completed"],
    ]);
  });

  it("keeps tasks with no thread here, such as those on a linked environment", () => {
    const listed = rows([], [agent("remote", { title: "On Hermes" })]);
    expect(listed.map((row) => [row.key, row.title])).toEqual([["remote", "On Hermes"]]);
  });

  it("normalizes a child's run status", () => {
    expect(
      rows([
        child("queued", 1, { status: "queued" }),
        child("rolled-back", 2, { status: "rolled_back" }),
      ]).map((row) => [row.key, row.status]),
    ).toEqual([
      ["queued", "pending"],
      ["rolled-back", "interrupted"],
    ]);
  });
});

describe("filterSubagentRowsByTitle", () => {
  const rows = t3SubagentRows({
    threadId: parentThreadId,
    shells: [
      child("Adversarial review #1448", 2),
      child("Subagent: Recheck #1463", 1),
      child("Subagent: Delta", 0),
    ],
    subagents: [],
  });
  const titles = (query: string) => filterSubagentRowsByTitle(rows, query).map((row) => row.key);

  it.each([
    ["review", ["Adversarial review #1448"]],
    ["  RECHECK ", ["Subagent: Recheck #1463"]],
    ["1448 ADVERS", ["Adversarial review #1448"]],
    ["review 1463", []],
    ["#14", ["Adversarial review #1448", "Subagent: Recheck #1463"]],
    ["nothing", []],
  ])("matches %j ignoring case and padding", (query, expected) => {
    expect(titles(query)).toEqual(expected);
  });

  it("matches the shown title, not the hidden Subagent: prefix", () => {
    expect(titles("subagent")).toEqual([]);
  });

  it("keeps every row for a blank query", () => {
    expect(titles("   ")).toHaveLength(3);
  });
});

describe("delegatingThreadRef", () => {
  const environmentId = EnvironmentId.make("zeus");
  const threadRef = scopeThreadRef(environmentId, ThreadId.make("child"));
  const lineage = (relationshipToParent: "subagent" | null) =>
    ({ parentThreadId, relationshipToParent }) as never;

  it("resolves a T3 subagent to its parent", () => {
    expect(
      delegatingThreadRef(threadRef, {
        lineage: lineage("subagent"),
        creationSource: "mcp",
      } as never),
    ).toEqual(scopeThreadRef(environmentId, parentThreadId));
  });

  it("resolves a task delegated from a linked environment there", () => {
    const remoteEnvironmentId = EnvironmentId.make("remote");
    expect(
      delegatingThreadRef(threadRef, {
        lineage: lineage(null),
        creationSource: "mcp",
        delegatedFrom: { environmentId: remoteEnvironmentId, threadId: parentThreadId },
      } as never),
    ).toEqual(scopeThreadRef(remoteEnvironmentId, parentThreadId));
  });

  it("leaves forks and provider-native subagents alone", () => {
    expect(
      delegatingThreadRef(threadRef, { lineage: lineage(null), creationSource: "mcp" } as never),
    ).toBeNull();
    expect(
      delegatingThreadRef(threadRef, {
        lineage: lineage("subagent"),
        creationSource: "provider",
      } as never),
    ).toBeNull();
  });
});
