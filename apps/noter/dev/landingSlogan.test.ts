import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { readBuildLandingSlogan, selectBuildLandingSlogan } from "./landingSlogan";

const originalBuildSelectedLandingSlogan = globalThis.noterBuildSelectedLandingSlogan;

afterEach(() => {
  globalThis.noterBuildSelectedLandingSlogan = originalBuildSelectedLandingSlogan;
});

describe("selectBuildLandingSlogan", () => {
  it("selects a random slogan for the build artifact", () => {
    const slogans = ["first", "second", "third"] as const;

    expect(selectBuildLandingSlogan({ random: () => 0, slogans })).toBe("first");
    expect(selectBuildLandingSlogan({ random: () => 0.4, slogans })).toBe("second");
    expect(selectBuildLandingSlogan({ random: () => 0.9, slogans })).toBe("third");
  });
});

describe("readBuildLandingSlogan", () => {
  it("reuses the current build selection across config evaluations", () => {
    globalThis.noterBuildSelectedLandingSlogan = "already selected";

    expect(
      readBuildLandingSlogan({
        random: () => 0,
        slogansPath: "/path/that/does/not/need/to/exist",
      }),
    ).toBe("already selected");
  });

  it("fails the build when the source has no slogans", () => {
    globalThis.noterBuildSelectedLandingSlogan = undefined;
    const tempDir = mkdtempSync(join(tmpdir(), "noter-empty-slogans-"));
    const emptySlogansPath = join(tempDir, "slogans.md");
    writeFileSync(emptySlogansPath, "\n");

    try {
      expect(() =>
        readBuildLandingSlogan({
          random: () => 0,
          slogansPath: emptySlogansPath,
        }),
      ).toThrow("No landing slogans found");
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
