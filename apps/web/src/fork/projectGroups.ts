import type { ProjectIconOverride } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

/**
 * Fork: named sets of projects to filter the sidebar by, such as "Sprintlaw"
 * for the platform repo's clones. Members are `environmentId:projectId` keys,
 * the same keys the sidebar's project filter matches threads with, so a group
 * survives changes to how projects are grouped. A project can be in any number
 * of groups. Groups live on this device.
 */
export interface SavedProjectGroup {
  readonly id: string;
  readonly name: string;
  readonly memberKeys: readonly string[];
  /** Chosen like a project's icon; groups without one show a stack of layers. */
  readonly icon?: ProjectIconOverride | null;
}

const SCOPE_PREFIX = "fork-group:";

/** The sidebar project-scope value that selects a group. */
export function projectGroupScopeKey(groupId: string): string {
  return `${SCOPE_PREFIX}${groupId}`;
}

/**
 * Whether a filter entry is in a group. One entry can stand for several
 * projects (clones grouped by repository), so it can be partly in.
 */
export function projectEntryMembership(
  entryKeys: readonly string[],
  memberKeys: ReadonlySet<string>,
): "all" | "some" | "none" {
  const inGroup = entryKeys.filter((key) => memberKeys.has(key)).length;
  if (inGroup === 0) return "none";
  return inGroup === entryKeys.length ? "all" : "some";
}

/** Adds or removes every project behind a filter entry. */
export function setProjectEntryMembership(
  memberKeys: readonly string[],
  entryKeys: readonly string[],
  included: boolean,
): string[] {
  const entry = new Set(entryKeys);
  const kept = memberKeys.filter((key) => !entry.has(key));
  return included ? [...kept, ...entryKeys] : kept;
}

interface ProjectGroupsState {
  readonly groups: readonly SavedProjectGroup[];
  readonly saveGroup: (group: SavedProjectGroup) => void;
  readonly deleteGroup: (groupId: string) => void;
}

export const useProjectGroupsStore = create<ProjectGroupsState>()(
  persist(
    (set) => ({
      groups: [],
      saveGroup: (group) =>
        set((state) => ({
          groups: state.groups.some((existing) => existing.id === group.id)
            ? state.groups.map((existing) => (existing.id === group.id ? group : existing))
            : [...state.groups, group],
        })),
      deleteGroup: (groupId) =>
        set((state) => ({ groups: state.groups.filter((group) => group.id !== groupId) })),
    }),
    {
      name: "t3code:fork:project-groups:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ groups: state.groups }),
    },
  ),
);
