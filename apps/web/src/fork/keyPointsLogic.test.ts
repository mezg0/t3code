import { describe, expect, it } from "vite-plus/test";

import { parseKeyPoints } from "./keyPointsLogic";

describe("parseKeyPoints", () => {
  it("reads the JSON object out of surrounding text and caps each list", () => {
    const parsed = parseKeyPoints(
      'Here you go:\n```json\n{"ask":["Do you want me to widen the column?"],"key":["a","The build is published.","second key point here"],"watch":"none"}\n```',
    );
    expect(parsed).toEqual({
      ask: ["Do you want me to widen the column?"],
      key: ["The build is published."],
      watch: [],
    });
  });

  it("returns null when there is no JSON object", () => {
    expect(parseKeyPoints("I cleaned the transcript for you.")).toBeNull();
    expect(parseKeyPoints("{not json}")).toBeNull();
  });
});
