import { describe, expect, it } from "vite-plus/test";

import { buildOverviewGroups, countThreadsByProject } from "./overview";

const thread = (
  projectKey: string,
  state: Partial<Record<"working" | "needsYou" | "settled", boolean>> = {},
) => ({
  projectKey,
  working: state.working ?? false,
  needsYou: state.needsYou ?? false,
  settled: state.settled ?? false,
});

describe("countThreadsByProject", () => {
  it("counts working, waiting and active threads, ignoring settled ones", () => {
    const counts = countThreadsByProject([
      thread("a", { working: true }),
      thread("a", { needsYou: true }),
      thread("a"),
      thread("a", { working: true, settled: true }),
      thread("b"),
    ]);
    expect(counts.get("a")).toEqual({ working: 1, needsYou: 1, active: 3 });
    expect(counts.get("b")).toEqual({ working: 0, needsYou: 0, active: 1 });
  });
});

describe("buildOverviewGroups", () => {
  const projects = ["platform", "bugs", "blog", "idle"];
  const counts = countThreadsByProject([
    thread("platform", { working: true }),
    thread("bugs", { working: true }),
    thread("bugs", { needsYou: true }),
    thread("blog"),
  ]);

  it("totals each saved group and lists other projects that have active threads", () => {
    const cards = buildOverviewGroups({
      groups: [{ id: "g", name: "Sprintlaw", memberKeys: ["platform", "bugs"] }],
      projects,
      projectKey: (project) => project,
      counts,
    });
    expect(cards.map((card) => [card.name, card.totals])).toEqual([
      ["Sprintlaw", { working: 2, needsYou: 1, active: 3 }],
      ["Other projects", { working: 0, needsYou: 0, active: 1 }],
    ]);
    expect(cards[1]!.projects.map((row) => row.project)).toEqual(["blog"]);
  });

  it("calls the leftover card Projects when there are no saved groups", () => {
    const cards = buildOverviewGroups({ groups: [], projects, projectKey: (p) => p, counts });
    expect(cards.map((card) => card.name)).toEqual(["Projects"]);
    expect(cards[0]!.projects.map((row) => row.project)).toEqual(["platform", "bugs", "blog"]);
  });
});
