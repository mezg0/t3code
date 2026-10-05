import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CornerDownRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";

import { cn } from "~/lib/utils";
import { orchestrationEnvironment } from "~/state/orchestration";
import { useEnvironmentQuery } from "~/state/query";

import {
  isLaunchedThreadCandidate,
  launchSenderThreadId,
  useLaunchParentStore,
} from "./launchParents";

// Each lookup fetches a thread's recent history window, so only a few run at once.
const MAX_CONCURRENT_LOOKUPS = 3;

/** Finds the launchers of agent-launched threads in the background. Renders nothing. */
export function LaunchParentResolver(props: { threads: readonly EnvironmentThreadShell[] }) {
  const parentByThreadKey = useLaunchParentStore((state) => state.parentByThreadKey);
  const skippedAttempts = useLaunchParentStore((state) => state.skippedAttempts);
  const pending = useMemo(() => {
    const result: Array<{ thread: EnvironmentThreadShell; threadKey: string; attemptKey: string }> =
      [];
    for (const thread of props.threads) {
      if (result.length === MAX_CONCURRENT_LOOKUPS) break;
      // No items means the first message has not landed yet.
      if (thread.itemCount === 0 || !isLaunchedThreadCandidate(thread)) continue;
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      if (threadKey in parentByThreadKey) continue;
      // A miss retries once the thread has new items.
      const attemptKey = `${threadKey}:${thread.itemCount}`;
      if (skippedAttempts[attemptKey]) continue;
      result.push({ thread, threadKey, attemptKey });
    }
    return result;
  }, [parentByThreadKey, props.threads, skippedAttempts]);

  return pending.map(({ thread, threadKey, attemptKey }) => (
    <LaunchParentLookup
      key={attemptKey}
      environmentId={thread.environmentId}
      threadId={thread.id}
      threadKey={threadKey}
      attemptKey={attemptKey}
    />
  ));
}

function LaunchParentLookup(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  threadKey: string;
  attemptKey: string;
}) {
  const { environmentId, threadId, threadKey, attemptKey } = props;
  const projection = useEnvironmentQuery(
    orchestrationEnvironment.v2.threadProjection({ environmentId, input: { threadId } }),
  );
  const recordParent = useLaunchParentStore((state) => state.recordParent);
  const skipAttempt = useLaunchParentStore((state) => state.skipAttempt);
  useEffect(() => {
    if (projection.error !== null) {
      skipAttempt(attemptKey);
      return;
    }
    if (projection.data === null) return;
    const sender = launchSenderThreadId(projection.data.messages, projection.data.thread.createdAt);
    if (sender === undefined) {
      skipAttempt(attemptKey);
      return;
    }
    recordParent(
      threadKey,
      sender === null ? null : scopedThreadKey(scopeThreadRef(environmentId, sender)),
    );
  }, [
    attemptKey,
    environmentId,
    projection.data,
    projection.error,
    recordParent,
    skipAttempt,
    threadKey,
  ]);
  return null;
}

/**
 * Sits in a launcher's sidebar row and shows or hides the threads it
 * launched. It stays visible while the row's hover actions are showing.
 */
export function LaunchedThreadsChip(props: {
  count: number;
  /** A launched thread is waiting on an approval or an answer. */
  needsAttention: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = `${props.count} launched ${props.count === 1 ? "thread" : "threads"}`;
  return (
    <button
      type="button"
      aria-label={`${props.expanded ? "Hide" : "Show"} ${label}${props.needsAttention ? ", needs you" : ""}`}
      aria-expanded={props.expanded}
      // The row picks up drags, opens on click, and activates on Enter.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onToggle();
      }}
      className={cn(
        "inline-flex h-5 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 text-xs tabular-nums hover:bg-sidebar-row-hover",
        props.needsAttention
          ? "text-warning-foreground"
          : props.expanded
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
      )}
    >
      <CornerDownRightIcon aria-hidden className="size-3" />
      {props.count}
    </button>
  );
}

/** A launcher's expanded children, each behind an arrow. */
export function SidebarLaunchedChildren(props: {
  threads: readonly EnvironmentThreadShell[];
  renderRow: (thread: EnvironmentThreadShell) => ReactNode;
}) {
  return (
    <li className="list-none" data-thread-selection-safe>
      <ul className="flex flex-col gap-px">
        {props.threads.map((thread) => (
          <li
            key={scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))}
            className="relative list-none pl-5"
          >
            <CornerDownRightIcon
              aria-hidden
              className="pointer-events-none absolute top-3 left-1.5 size-3 text-muted-foreground"
            />
            <ul>{props.renderRow(thread)}</ul>
          </li>
        ))}
      </ul>
    </li>
  );
}
