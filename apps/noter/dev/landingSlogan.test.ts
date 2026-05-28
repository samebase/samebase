import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { readBuildLandingSlogan, selectBuildLandingSlogan } from "./landingSlogan";

describe("selectBuildLandingSlogan", () => {
  it("selects a slogan from the build seed", () => {
    const slogans = ["first", "second", "third"] as const;

    expect(selectBuildLandingSlogan({ buildSeed: "", slogans })).toBe("first");
    expect(selectBuildLandingSlogan({ buildSeed: "a", slogans })).toBe("second");
    expect(selectBuildLandingSlogan({ buildSeed: "b", slogans })).toBe("third");
  });
});

describe("readBuildLandingSlogan", () => {
  it("reads slogans from the markdown source", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "noter-slogans-"));
    const slogansPath = join(tempDir, "slogans.md");
    writeFileSync(slogansPath, "- first\n- second\n");

    try {
      expect(readBuildLandingSlogan({ buildSeed: "a", slogansPath })).toBe("second");
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
