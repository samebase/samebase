import { describe, expect, it } from "vitest";
import {
  landingPageBullets,
  landingPageSlogan,
  parseLandingCopyMarkdown,
} from "./landingCopy";

describe("parseLandingCopyMarkdown", () => {
  it("reads the landing heading and bullets from markdown", () => {
    expect(
      parseLandingCopyMarkdown(`## Edited heading

- edited bullet
- another bullet`),
    ).toEqual({
      slogan: "Edited heading",
      bullets: ["edited bullet", "another bullet"],
    });
  });

  it("trims leading whitespace before parsing the landing heading", () => {
    expect(
      parseLandingCopyMarkdown(`  ## Indented heading

- edited bullet`),
    ).toEqual({
      slogan: "Indented heading",
      bullets: ["edited bullet"],
    });
  });

  it("falls back to the default landing content when markdown is incomplete", () => {
    expect(parseLandingCopyMarkdown("not a heading")).toEqual({
      slogan: landingPageSlogan,
      bullets: [...landingPageBullets],
    });
  });
});
