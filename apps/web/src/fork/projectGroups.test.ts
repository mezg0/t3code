import { describe, expect, it } from "vite-plus/test";

import { projectEntryMembership, setProjectEntryMembership } from "./projectGroups";

describe("project entry membership", () => {
  const members = new Set(["env:platform", "env:platform-sentry"]);

  it("reports whether every, some, or none of an entry's projects are in the group", () => {
    expect(projectEntryMembership(["env:platform"], members)).toBe("all");
    expect(projectEntryMembership(["env:platform-sentry", "env:platform-perf"], members)).toBe(
      "some",
    );
    expect(projectEntryMembership(["env:blog"], members)).toBe("none");
  });

  it("adds or removes every project behind an entry", () => {
    const entry = ["env:platform-sentry", "env:platform-perf"];
    expect(setProjectEntryMembership([...members], entry, true).toSorted()).toEqual([
      "env:platform",
      "env:platform-perf",
      "env:platform-sentry",
    ]);
    expect(setProjectEntryMembership([...members], entry, false)).toEqual(["env:platform"]);
  });
});
