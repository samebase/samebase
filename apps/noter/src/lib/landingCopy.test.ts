import { describe, expect, it } from "vite-plus/test";
import { parseLandingCopyMarkdown } from "./landingCopy";

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

  it("accepts valid markdown heading levels outside h2", () => {
    expect(
      parseLandingCopyMarkdown(`# Heading one

- edited bullet`),
    ).toEqual({
      slogan: "Heading one",
      bullets: ["edited bullet"],
    });
  });

  it("preserves intentionally empty bullet lists", () => {
    expect(parseLandingCopyMarkdown(`## Heading only`)).toEqual({
      slogan: "Heading only",
      bullets: [],
    });
  });

  it("preserves intentionally missing headings", () => {
    expect(parseLandingCopyMarkdown(`- edited bullet`)).toEqual({
      slogan: "",
      bullets: ["edited bullet"],
    });
  });

  it("preserves wrapped bullet continuation lines", () => {
    expect(
      parseLandingCopyMarkdown(`## Wrapped heading

- edited bullet first line
  continued second line
- another bullet`),
    ).toEqual({
      slogan: "Wrapped heading",
      bullets: [
        "edited bullet first line continued second line",
        "another bullet",
      ],
    });
  });
});
