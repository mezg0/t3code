import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { OrchestrationV2ConversationMessage, ThreadId } from "@t3tools/contracts";
import type * as DateTime from "effect/DateTime";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

/**
 * Fork: threads an agent started with t3_thread_launch or create_threads nest
 * under the thread that launched them. The server records no parent for
 * these, only `senderThreadId` on the child's first message, so the client
 * reads that once per thread and caches it here.
 */

/**
 * Top-level threads a user did not create: the only ones with a launcher to
 * find. Launches are not reliably stamped `agent`/`mcp` (many arrive as
 * `system`/`server`), so the first message's sender is the real signal.
 * Threads imported from V1 are skipped: V1 never recorded a sender.
 */
export function isLaunchedThreadCandidate(
  thread: Pick<EnvironmentThreadShell, "lineage" | "source">,
): boolean {
  return (
    thread.source.createdBy !== "user" &&
    thread.source.historyOrigin !== "v1_import" &&
    thread.lineage.parentThreadId === null
  );
}

// A launch writes its first message as it creates the thread.
const LAUNCH_MESSAGE_MAX_DELAY_MS = 2 * 60_000;

/**
 * The launching thread, read from the first user message. `null` when that
 * message has no sender, or is not the launch message: thread projections
 * hold a recent window, so on a long thread the earliest message seen can be
 * a later one, such as a child reporting back. `undefined` while there is no
 * user message yet.
 */
export function launchSenderThreadId(
  messages: ReadonlyArray<
    Pick<OrchestrationV2ConversationMessage, "role" | "senderThreadId" | "createdAt">
  >,
  threadCreatedAt: DateTime.Utc,
): ThreadId | null | undefined {
  let first: (typeof messages)[number] | undefined;
  for (const message of messages) {
    if (message.role !== "user") continue;
    if (
      first === undefined ||
      message.createdAt.epochMilliseconds < first.createdAt.epochMilliseconds
    ) {
      first = message;
    }
  }
  if (first === undefined) return undefined;
  const delayMs = first.createdAt.epochMilliseconds - threadCreatedAt.epochMilliseconds;
  return delayMs <= LAUNCH_MESSAGE_MAX_DELAY_MS ? (first.senderThreadId ?? null) : null;
}

export interface LaunchedThreadGroups<T> {
  /** Threads that render as ordinary sidebar rows. */
  readonly roots: T[];
  /** Launched threads by the scoped key of the root they nest under, oldest first. */
  readonly childrenByParentKey: Map<string, T[]>;
}

/**
 * Nests each launched thread under its top-most visible ancestor, so a
 * launcher's grandchildren share one group. A thread whose launcher is not
 * among `threads` (archived, deleted, filtered out) stays a root.
 */
export function groupLaunchedThreads<T extends { readonly createdAt: string }>(
  threads: readonly T[],
  keyOf: (thread: T) => string,
  parentKeyByThreadKey: Readonly<Record<string, string | null>>,
): LaunchedThreadGroups<T> {
  const visibleKeys = new Set(threads.map(keyOf));
  const visibleParent = (key: string) => {
    const parentKey = parentKeyByThreadKey[key];
    return parentKey != null && parentKey !== key && visibleKeys.has(parentKey) ? parentKey : null;
  };
  const rootKeyOf = (key: string) => {
    const seen = new Set([key]);
    let current = key;
    for (let parent = visibleParent(current); parent !== null; parent = visibleParent(current)) {
      // A cycle can only come from corrupt cache data; keep the thread a root.
      if (seen.has(parent)) return key;
      seen.add(parent);
      current = parent;
    }
    return current;
  };

  const roots: T[] = [];
  const childrenByParentKey = new Map<string, T[]>();
  for (const thread of threads) {
    const key = keyOf(thread);
    const rootKey = rootKeyOf(key);
    if (rootKey === key) {
      roots.push(thread);
      continue;
    }
    const children = childrenByParentKey.get(rootKey);
    if (children === undefined) childrenByParentKey.set(rootKey, [thread]);
    else children.push(thread);
  }
  for (const children of childrenByParentKey.values()) {
    children.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }
  return { roots, childrenByParentKey };
}

interface LaunchParentStoreState {
  /** Scoped thread key to the launcher's scoped key, or null for no launcher. */
  readonly parentByThreadKey: Readonly<Record<string, string | null>>;
  /** Parents whose launched threads are shown. */
  readonly expandedParentKeys: Readonly<Record<string, true>>;
  /** Lookups that found nothing yet, by `threadKey:itemCount`. Not persisted. */
  readonly skippedAttempts: Readonly<Record<string, true>>;
  readonly recordParent: (threadKey: string, parentKey: string | null) => void;
  readonly skipAttempt: (attemptKey: string) => void;
  readonly toggleExpanded: (parentKey: string) => void;
}

export const useLaunchParentStore = create<LaunchParentStoreState>()(
  persist(
    (set) => ({
      parentByThreadKey: {},
      expandedParentKeys: {},
      skippedAttempts: {},
      recordParent: (threadKey, parentKey) =>
        set((state) => ({
          parentByThreadKey: { ...state.parentByThreadKey, [threadKey]: parentKey },
        })),
      skipAttempt: (attemptKey) =>
        set((state) => ({ skippedAttempts: { ...state.skippedAttempts, [attemptKey]: true } })),
      toggleExpanded: (parentKey) =>
        set((state) => {
          const { [parentKey]: wasExpanded, ...rest } = state.expandedParentKeys;
          return { expandedParentKeys: wasExpanded ? rest : { ...rest, [parentKey]: true } };
        }),
    }),
    {
      name: "t3code:fork:launch-parents:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        parentByThreadKey: state.parentByThreadKey,
        expandedParentKeys: state.expandedParentKeys,
      }),
    },
  ),
);
