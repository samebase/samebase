import { describe, expect, it } from "vitest";
import { upsertCodexNoAltScreenConfig } from "../../../../runtime/codexConfig.js";

describe("codexConfig", () => {
  it("adds no_alt_screen to an empty config", () => {
    expect(upsertCodexNoAltScreenConfig("")).toBe("no_alt_screen = true\n");
  });

  it("replaces an existing no_alt_screen setting", () => {
    expect(
      upsertCodexNoAltScreenConfig(
        `model = "gpt-5.4"\nno_alt_screen = false\n`,
      ),
    ).toBe(`model = "gpt-5.4"\nno_alt_screen = true\n`);
  });

  it("inserts no_alt_screen before the first table", () => {
    expect(
      upsertCodexNoAltScreenConfig(
        `personality = "pragmatic"\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
      ),
    ).toBe(
      `personality = "pragmatic"\n\nno_alt_screen = true\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
    );
  });

  it("preserves leading comments when inserting before tables", () => {
    expect(
      upsertCodexNoAltScreenConfig(
        `# Shared Daytona Codex config\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
      ),
    ).toBe(
      `# Shared Daytona Codex config\n\nno_alt_screen = true\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
    );
  });
});
