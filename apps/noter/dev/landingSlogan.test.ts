import { afterEach, describe, expect, it } from "vite-plus/test";
import { DEFAULT_LANDING_SLOGAN } from "../src/lib/landingSlogans";
import {
  BUILD_SELECTED_LANDING_SLOGAN_ENV,
  readBuildLandingSlogan,
  selectBuildLandingSlogan,
} from "./landingSlogan";

const originalBuildSelectedLandingSlogan = process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV];

afterEach(() => {
  if (originalBuildSelectedLandingSlogan) {
    process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV] = originalBuildSelectedLandingSlogan;
    return;
  }

  delete process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV];
});

describe("selectBuildLandingSlogan", () => {
  it("falls back when no slogans are available", () => {
    expect(selectBuildLandingSlogan({ random: () => 0, slogans: [] })).toBe(DEFAULT_LANDING_SLOGAN);
  });

  it("selects a random slogan for the build artifact", () => {
    const slogans = ["first", "second", "third"];

    expect(selectBuildLandingSlogan({ random: () => 0, slogans })).toBe("first");
    expect(selectBuildLandingSlogan({ random: () => 0.4, slogans })).toBe("second");
    expect(selectBuildLandingSlogan({ random: () => 0.9, slogans })).toBe("third");
  });
});

describe("readBuildLandingSlogan", () => {
  it("reuses the current build selection across config evaluations", () => {
    process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV] = "already selected";

    expect(
      readBuildLandingSlogan({
        random: () => 0,
        slogansPath: "/path/that/does/not/need/to/exist",
      }),
    ).toBe("already selected");
  });
});
