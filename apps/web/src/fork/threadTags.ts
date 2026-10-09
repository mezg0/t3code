import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

/**
 * Fork: a thread can own a tag, such as "SENTRY". Threads whose titles start
 * with `{{SENTRY}}` belong to it: they're listed in its right panel, their
 * header links back to it, and the sidebar groups them under Tagged. Tags are
 * keyed by scoped thread key and live on this device, like project groups.
 */

const TITLE_TAG = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*(.*)$/s;

/** A tag as typed, braces optional. Null when nothing usable is left. */
export function normalizeThreadTag(input: string): string | null {
  const tag = input
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .trim();
  return tag.length > 0 && !/[{}]/.test(tag) ? tag : null;
}

/** Tags match case-insensitively, so `{{sentry}}` belongs to SENTRY. */
export function threadTagKey(tag: string): string {
  return tag.toUpperCase();
}

/** The `{{TAG}}` a title starts with, and the title without it. */
export function parseTitleTag(
  title: string,
): { readonly tag: string; readonly rest: string } | null {
  const match = TITLE_TAG.exec(title);
  if (!match) return null;
  const rest = match[2]!.trim();
  return { tag: match[1]!, rest: rest.length > 0 ? rest : title.trim() };
}

interface TaggableThread {
  readonly key: string;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
}

/** Threads that belong to `tag`, minus its owner and archived threads. */
export function threadsWithTag<Thread extends TaggableThread>(
  threads: readonly Thread[],
  tag: string,
  ownerKey: string,
): Thread[] {
  const wanted = threadTagKey(tag);
  return threads.filter((thread) => {
    if (thread.key === ownerKey || thread.archivedAt !== null || thread.deletedAt !== null) {
      return false;
    }
    const parsed = parseTitleTag(thread.title);
    return parsed !== null && threadTagKey(parsed.tag) === wanted;
  });
}

/** The thread that owns the tag a title starts with, never the thread itself. */
export function tagOwnerKeyForTitle(
  title: string,
  selfKey: string,
  tagsByThreadKey: Readonly<Record<string, string>>,
): string | null {
  const parsed = parseTitleTag(title);
  if (!parsed) return null;
  const wanted = threadTagKey(parsed.tag);
  for (const [ownerKey, tag] of Object.entries(tagsByThreadKey)) {
    if (ownerKey !== selfKey && threadTagKey(tag) === wanted) return ownerKey;
  }
  return null;
}

/**
 * The tags whose owners still exist. An archived or deleted owner releases its
 * threads back to the rest of the sidebar instead of stranding them.
 */
export function liveThreadTags(
  tagsByThreadKey: Readonly<Record<string, string>>,
  isLiveThread: (threadKey: string) => boolean,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(tagsByThreadKey).filter(([threadKey]) => isLiveThread(threadKey)),
  );
}

/**
 * Whether the sidebar files a thread under Tagged: it starts with a tag some
 * other thread owns. Owners stay put, so the way back to their list stays visible.
 */
export function isTaggedThread(
  thread: Pick<TaggableThread, "key" | "title">,
  tagsByThreadKey: Readonly<Record<string, string>>,
): boolean {
  if (Object.hasOwn(tagsByThreadKey, thread.key)) return false;
  return tagOwnerKeyForTitle(thread.title, thread.key, tagsByThreadKey) !== null;
}

interface ThreadTagsState {
  readonly tagsByThreadKey: Readonly<Record<string, string>>;
  readonly setThreadTag: (threadKey: string, tag: string | null) => void;
}

export const useThreadTagsStore = create<ThreadTagsState>()(
  persist(
    (set) => ({
      tagsByThreadKey: {},
      setThreadTag: (threadKey, tag) =>
        set((state) => {
          const { [threadKey]: _previous, ...rest } = state.tagsByThreadKey;
          return { tagsByThreadKey: tag === null ? rest : { ...rest, [threadKey]: tag } };
        }),
    }),
    {
      name: "t3code:fork:thread-tags:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ tagsByThreadKey: state.tagsByThreadKey }),
    },
  ),
);
