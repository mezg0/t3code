import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { RuntimeSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import {
  isOrchestrationV2WorkActive,
  isProviderNativeSubagentThread,
  type OrchestrationV2AppThread,
  type OrchestrationV2Subagent,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { DateTime } from "effect";

export interface T3SubagentRow {
  readonly key: string;
  readonly title: string;
  readonly status: RuntimeSubagentStatus;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  /** The record from the parent's recent turns; older subagents only have their thread. */
  readonly agent: OrchestrationV2Subagent | null;
  readonly shell: OrchestrationV2ThreadShell | null;
}

const iso = (value: DateTime.Utc | null | undefined) =>
  value === null || value === undefined ? null : DateTime.formatIso(value);

function shellStatus(shell: OrchestrationV2ThreadShell): RuntimeSubagentStatus {
  const status = shell.activityRunStatus ?? shell.status;
  switch (status) {
    case "preparing":
    case "starting":
    case "queued":
      return "pending";
    case "rolled_back":
      return "interrupted";
    default:
      return status;
  }
}

/**
 * The subagents T3 delegated from a thread, not the provider's own (Claude Task, Codex spawn),
 * running ones first and then the newest. A thread's `subagents` only cover its recent turns, so
 * its child threads are the full list; tasks on a linked environment have no thread here.
 */
export function t3SubagentRows(input: {
  readonly threadId: ThreadId;
  readonly shells: ReadonlyArray<OrchestrationV2ThreadShell>;
  readonly subagents: ReadonlyArray<OrchestrationV2Subagent>;
}): ReadonlyArray<T3SubagentRow> {
  const agents = input.subagents.filter((agent) => agent.origin === "app_owned");
  const children = input.shells.filter(
    (shell) =>
      shell.archivedAt === null &&
      shell.lineage.parentThreadId === input.threadId &&
      shell.lineage.relationshipToParent === "subagent" &&
      !isProviderNativeSubagentThread(shell),
  );
  const agentByChild = new Map(agents.map((agent) => [agent.childThreadId, agent]));
  const childIds = new Set<ThreadId | null>(children.map((shell) => shell.id));

  const fromChildren = children.map((shell): T3SubagentRow => {
    const agent = agentByChild.get(shell.id) ?? null;
    const live = agent !== null && isOrchestrationV2WorkActive(agent.status);
    return {
      key: shell.id,
      title: shell.title,
      status: live ? agent.status : shellStatus(shell),
      startedAt: iso(agent?.startedAt) ?? iso(shell.latestRunStartedAt),
      completedAt: live ? null : iso(shell.latestRunCompletedAt),
      agent,
      shell,
    };
  });
  const withoutChild = agents
    .filter((agent) => !childIds.has(agent.childThreadId))
    .map((agent): T3SubagentRow => ({
      key: agent.id,
      title: agent.title ?? "Subagent",
      status: agent.status,
      startedAt: iso(agent.startedAt),
      completedAt: iso(agent.completedAt),
      agent,
      shell: null,
    }));

  const sortTime = (row: T3SubagentRow) =>
    row.startedAt ?? iso(row.shell?.createdAt) ?? iso(row.agent?.updatedAt) ?? "";
  return [...fromChildren, ...withoutChild].toSorted(
    (left, right) =>
      Number(isOrchestrationV2WorkActive(right.status)) -
        Number(isOrchestrationV2WorkActive(left.status)) ||
      sortTime(right).localeCompare(sortTime(left)),
  );
}

/** The thread that delegated this one, which may live in another environment. */
export function delegatingThreadRef(
  threadRef: ScopedThreadRef,
  thread: Pick<OrchestrationV2AppThread, "lineage" | "creationSource" | "delegatedFrom">,
): ScopedThreadRef | null {
  if (thread.delegatedFrom !== undefined) {
    return scopeThreadRef(thread.delegatedFrom.environmentId, thread.delegatedFrom.threadId);
  }
  const { parentThreadId, relationshipToParent } = thread.lineage;
  if (
    relationshipToParent !== "subagent" ||
    parentThreadId === null ||
    isProviderNativeSubagentThread(thread)
  ) {
    return null;
  }
  return scopeThreadRef(threadRef.environmentId, parentThreadId);
}
