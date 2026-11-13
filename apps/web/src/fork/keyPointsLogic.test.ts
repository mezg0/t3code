import { describe, expect, it } from "vite-plus/test";

import { locateKeyPoints, parseKeyPoints } from "./keyPointsLogic";

const REPLY =
  "The build is published. I couldn’t test the browser corner, so please check it. " +
  "Do you want me to widen the column?";

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

describe("locateKeyPoints", () => {
  const span = (kind: string, quote: string) => {
    const start = REPLY.replace("’", "'").indexOf(quote);
    return { kind, start, end: start + quote.length };
  };

  it("matches across quote-mark and punctuation differences", () => {
    const spans = locateKeyPoints(REPLY, {
      ask: ["Do you want me to widen the column"],
      key: ["the build is published."],
      watch: ["I couldn't test the browser corner, so please check it!"],
    });
    expect(spans).toEqual([
      span("key", "The build is published."),
      span("watch", "I couldn't test the browser corner, so please check it"),
      span("ask", "Do you want me to widen the column"),
    ]);
  });

  it("drops reworded quotes and quotes that overlap an earlier one", () => {
    const spans = locateKeyPoints(REPLY, {
      ask: ["Do you want me to widen the column?"],
      key: ["The build was published successfully."],
      watch: ["widen the column?"],
    });
    expect(spans).toEqual([span("ask", "Do you want me to widen the column?")]);
  });
});
