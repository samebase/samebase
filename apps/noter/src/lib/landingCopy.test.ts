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

  it("falls back to the default landing content when markdown is incomplete", () => {
    expect(parseLandingCopyMarkdown("not a heading")).toEqual({
      slogan: landingPageSlogan,
      bullets: [...landingPageBullets],
    });
  });
});
