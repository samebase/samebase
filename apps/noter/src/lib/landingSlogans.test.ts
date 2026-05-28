import { describe, expect, it } from "vite-plus/test";

import { parseLandingSlogans } from "./landingSlogans";

describe("parseLandingSlogans", () => {
  it("parses non-empty trimmed lines", () => {
    expect(parseLandingSlogans("\n  one  \n\n two\n")).toEqual(["one", "two"]);
  });

  it("parses markdown bullet items", () => {
    const raw = `- first
- second`;
    expect(parseLandingSlogans(raw)).toEqual(["first", "second"]);
  });
});
