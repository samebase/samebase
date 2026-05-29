import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parseLandingSlogans, readBuildLandingSlogan } from "./landingSlogan";

describe("parseLandingSlogans", () => {
  it("ignores non-bullet lines", () => {
    expect(parseLandingSlogans("\n  one  \n\n two\n")).toEqual([]);
  });

  it("parses markdown bullet items", () => {
    const raw = `- first
- second`;
    expect(parseLandingSlogans(raw)).toEqual(["first", "second"]);
  });
});

describe("readBuildLandingSlogan", () => {
  it("reads slogans from the markdown source", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "noter-slogans-"));
    const slogansPath = join(tempDir, "slogans.md");
    writeFileSync(slogansPath, "- first\n- second\n");

    try {
      const selectedSlogan = readBuildLandingSlogan({ buildSeed: "a", slogansPath });

      expect(["first", "second"]).toContain(selectedSlogan);
      expect(readBuildLandingSlogan({ buildSeed: "a", slogansPath })).toBe(selectedSlogan);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("fails the build when the source has no slogans", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "noter-empty-slogans-"));
    const emptySlogansPath = join(tempDir, "slogans.md");
    writeFileSync(emptySlogansPath, "\n");

    try {
      expect(() =>
        readBuildLandingSlogan({
          buildSeed: "",
          slogansPath: emptySlogansPath,
        }),
      ).toThrow("No landing slogans found");
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
