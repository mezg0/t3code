import type { SavedProjectGroup } from "./projectGroups";

/**
 * Fork: the Overview page's numbers. Pure so the page stays a thin renderer.
 */

export interface ThreadCounts {
  /** A run is preparing, starting, running or waiting. */
  readonly working: number;
  /** Waiting on an approval or an answer. */
  readonly needsYou: number;
  /** Not settled: everything still on the sidebar's active shelves. */
  readonly active: number;
}

export const EMPTY_COUNTS: ThreadCounts = { working: 0, needsYou: 0, active: 0 };

export interface OverviewThread {
  readonly projectKey: string;
  readonly working: boolean;
  readonly needsYou: boolean;
  readonly settled: boolean;
}

export function addCounts(left: ThreadCounts, right: ThreadCounts): ThreadCounts {
  return {
    working: left.working + right.working,
    needsYou: left.needsYou + right.needsYou,
    active: left.active + right.active,
  };
}

/** Counts per `environmentId:projectId` key. Settled threads count for nothing. */
export function countThreadsByProject(
  threads: readonly OverviewThread[],
): ReadonlyMap<string, ThreadCounts> {
  const counts = new Map<string, ThreadCounts>();
  for (const thread of threads) {
    if (thread.settled) continue;
    counts.set(
      thread.projectKey,
      addCounts(counts.get(thread.projectKey) ?? EMPTY_COUNTS, {
        working: thread.working ? 1 : 0,
        needsYou: thread.needsYou ? 1 : 0,
        active: 1,
      }),
    );
  }
  return counts;
}

export interface OverviewGroup<TProject> {
  /** A saved group's id, or null for the projects in no group. */
  readonly groupId: string | null;
  readonly name: string;
  readonly icon: SavedProjectGroup["icon"];
  readonly totals: ThreadCounts;
  readonly projects: ReadonlyArray<{ readonly project: TProject; readonly counts: ThreadCounts }>;
}

/**
 * One card per saved group, in the user's order, then "Other projects" for the
 * projects in no group. That last card only lists projects with active
 * threads, so idle side projects don't crowd it.
 */
export function buildOverviewGroups<TProject>(input: {
  readonly groups: readonly SavedProjectGroup[];
  readonly projects: readonly TProject[];
  readonly projectKey: (project: TProject) => string;
  readonly counts: ReadonlyMap<string, ThreadCounts>;
}): OverviewGroup<TProject>[] {
  const countsOf = (project: TProject) =>
    input.counts.get(input.projectKey(project)) ?? EMPTY_COUNTS;
  const summarize = (
    groupId: string | null,
    name: string,
    icon: SavedProjectGroup["icon"],
    projects: readonly TProject[],
  ): OverviewGroup<TProject> => {
    const rows = projects.map((project) => ({ project, counts: countsOf(project) }));
    return {
      groupId,
      name,
      icon,
      totals: rows.reduce((totals, row) => addCounts(totals, row.counts), EMPTY_COUNTS),
      projects: rows,
    };
  };

  const grouped = new Set<string>();
  const cards = input.groups.map((group) => {
    const members = new Set(group.memberKeys);
    for (const key of members) grouped.add(key);
    return summarize(
      group.id,
      group.name,
      group.icon,
      input.projects.filter((project) => members.has(input.projectKey(project))),
    );
  });
  const others = input.projects.filter(
    (project) => !grouped.has(input.projectKey(project)) && countsOf(project).active > 0,
  );
  return others.length > 0
    ? [
        ...cards,
        summarize(null, input.groups.length > 0 ? "Other projects" : "Projects", null, others),
      ]
    : cards;
}
