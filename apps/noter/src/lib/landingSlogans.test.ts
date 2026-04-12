import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_SLOGAN,
  parseLandingSlogans,
  selectLandingSlogan,
  selectStableLandingSlogan,
} from "./landingSlogans";

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

describe("selectLandingSlogan", () => {
  it("falls back when no slogans are available", () => {
    expect(selectLandingSlogan([])).toBe(DEFAULT_LANDING_SLOGAN);
  });

  it("returns a custom fallback when provided", () => {
    expect(selectLandingSlogan([], "custom fallback")).toBe("custom fallback");
  });

  it("selects a random slogan per call", () => {
    const slogans = ["first", "second", "third"];

    expect(selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0)).toBe(
      "first",
    );
    expect(
      selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0.4),
    ).toBe("second");
    expect(
      selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0.9),
    ).toBe("third");
  });
});

describe("selectStableLandingSlogan", () => {
  it("falls back when no slogans are available", () => {
    expect(selectStableLandingSlogan([], "commit-sha")).toBe(
      DEFAULT_LANDING_SLOGAN,
    );
  });

  it("returns the first slogan when the seed is empty", () => {
    expect(selectStableLandingSlogan(["first", "second"], "")).toBe("first");
  });

  it("returns a deterministic slogan for the same seed", () => {
    const slogans = ["first", "second", "third"];
    const firstPick = selectStableLandingSlogan(slogans, "abcdef123456");
    const secondPick = selectStableLandingSlogan(slogans, "abcdef123456");

    expect(secondPick).toBe(firstPick);
    expect(slogans).toContain(firstPick);
  });
});
