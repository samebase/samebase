import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANDING_SLOGAN,
  LANDING_SLOGAN_ROTATION_INTERVAL_MS,
  parseLandingSlogans,
  selectLandingSlogan,
} from "./landingSlogans";

describe("parseLandingSlogans", () => {
  it("parses non-empty trimmed lines", () => {
    expect(parseLandingSlogans("\n  one  \n\n two\n")).toEqual(["one", "two"]);
  });
});

describe("selectLandingSlogan", () => {
  it("falls back when no slogans are available", () => {
    expect(selectLandingSlogan([], 0)).toBe(DEFAULT_LANDING_SLOGAN);
  });

  it("rotates slogans every 8 hours", () => {
    const slogans = ["first", "second", "third"];

    expect(selectLandingSlogan(slogans, 0)).toBe("first");
    expect(
      selectLandingSlogan(slogans, LANDING_SLOGAN_ROTATION_INTERVAL_MS - 1),
    ).toBe("first");
    expect(
      selectLandingSlogan(slogans, LANDING_SLOGAN_ROTATION_INTERVAL_MS),
    ).toBe("second");
    expect(
      selectLandingSlogan(slogans, LANDING_SLOGAN_ROTATION_INTERVAL_MS * 2),
    ).toBe("third");
    expect(
      selectLandingSlogan(slogans, LANDING_SLOGAN_ROTATION_INTERVAL_MS * 3),
    ).toBe("first");
  });
});
