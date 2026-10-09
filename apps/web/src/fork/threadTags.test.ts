import { describe, expect, it } from "vite-plus/test";

import {
  isTaggedThread,
  liveThreadTags,
  normalizeThreadTag,
  parseTitleTag,
  tagOwnerKeyForTitle,
  threadsWithTag,
} from "./threadTags";

const thread = (key: string, title: string, archivedAt: string | null = null) => ({
  key,
  title,
  archivedAt,
  deletedAt: null,
});

describe("normalizeThreadTag", () => {
  it("accepts a bare tag or one wrapped in braces", () => {
    expect(normalizeThreadTag(" SENTRY ")).toBe("SENTRY");
    expect(normalizeThreadTag("{{ SENTRY }}")).toBe("SENTRY");
  });

  it("rejects empty tags and stray braces", () => {
    expect(normalizeThreadTag("  ")).toBeNull();
    expect(normalizeThreadTag("{{}}")).toBeNull();
    expect(normalizeThreadTag("SEN}TRY")).toBeNull();
  });
});

describe("parseTitleTag", () => {
  it("splits a leading tag from the rest of the title", () => {
    expect(parseTitleTag("{{SENTRY}} TypeError in checkout")).toEqual({
      tag: "SENTRY",
      rest: "TypeError in checkout",
    });
  });

  it("ignores titles without a leading tag", () => {
    expect(parseTitleTag("Fix {{SENTRY}} later")).toBeNull();
    expect(parseTitleTag("SENTRY: TypeError")).toBeNull();
  });

  it("keeps the whole title when the tag is all there is", () => {
    expect(parseTitleTag("{{SENTRY}}")).toEqual({ tag: "SENTRY", rest: "{{SENTRY}}" });
  });
});

describe("threadsWithTag", () => {
  const threads = [
    thread("owner", "{{SENTRY}} HQ"),
    thread("a", "{{sentry}} TypeError"),
    thread("b", "{{PERF}} Slow query"),
    thread("c", "{{SENTRY}} Old issue", "2026-10-01T00:00:00.000Z"),
    thread("d", "Unrelated"),
  ];

  it("matches case-insensitively and skips the owner and archived threads", () => {
    expect(threadsWithTag(threads, "SENTRY", "owner").map((t) => t.key)).toEqual(["a"]);
  });
});

describe("tag owners", () => {
  const tags = { owner: "Sentry" };

  it("finds the owner for a tagged title, never the thread itself", () => {
    expect(tagOwnerKeyForTitle("{{SENTRY}} TypeError", "a", tags)).toBe("owner");
    expect(tagOwnerKeyForTitle("{{SENTRY}} HQ", "owner", tags)).toBeNull();
    expect(tagOwnerKeyForTitle("{{PERF}} Slow", "a", tags)).toBeNull();
  });

  it("files tagged threads under Tagged but keeps owners where they are", () => {
    expect(isTaggedThread({ key: "a", title: "{{SENTRY}} TypeError" }, tags)).toBe(true);
    expect(isTaggedThread({ key: "owner", title: "{{SENTRY}} HQ" }, tags)).toBe(false);
    expect(isTaggedThread({ key: "b", title: "{{PERF}} Slow" }, tags)).toBe(false);
  });

  it("releases a gone owner's threads", () => {
    const live = liveThreadTags(tags, (key) => key !== "owner");
    expect(isTaggedThread({ key: "a", title: "{{SENTRY}} TypeError" }, live)).toBe(false);
  });
});
