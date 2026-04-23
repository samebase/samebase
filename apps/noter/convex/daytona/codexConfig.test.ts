import { describe, expect, it } from "vite-plus/test";
import {
  upsertCodexDefaultModelConfig,
  upsertCodexNoAltScreenConfig,
  upsertCodexProjectTrustConfig,
} from "../../../../runtime/codexConfig";

describe("codexConfig", () => {
  it("adds the default model to an empty config", () => {
    expect(upsertCodexDefaultModelConfig("")).toBe('model = "gpt-5.4"\n');
  });

  it("replaces an existing model setting", () => {
    expect(
      upsertCodexDefaultModelConfig(
        `model = "gpt-5.3-codex"\nno_alt_screen = true\n`,
      ),
    ).toBe(`model = "gpt-5.4"\nno_alt_screen = true\n`);
  });

  it("inserts the default model before the first table", () => {
    expect(
      upsertCodexDefaultModelConfig(
        `no_alt_screen = true\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
      ),
    ).toBe(
      `no_alt_screen = true\n\nmodel = "gpt-5.4"\n\n[projects."/repo"]\ntrust_level = "trusted"\n`,
    );
  });

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

  it("adds a trusted project entry when missing", () => {
    expect(
      upsertCodexProjectTrustConfig(
        `no_alt_screen = true\n`,
        "/home/daytona/workspace/noter",
      ),
    ).toBe(
      `no_alt_screen = true\n\n[projects."/home/daytona/workspace/noter"]\ntrust_level = "trusted"\n`,
    );
  });

  it("replaces an existing project trust level", () => {
    expect(
      upsertCodexProjectTrustConfig(
        `[projects."/home/daytona/workspace/noter"]\ntrust_level = "ask"\n`,
        "/home/daytona/workspace/noter",
      ),
    ).toBe(
      `[projects."/home/daytona/workspace/noter"]\ntrust_level = "trusted"\n`,
    );
  });

  it("leaves other project entries intact when trusting the target project", () => {
    expect(
      upsertCodexProjectTrustConfig(
        `[projects."/other"]\ntrust_level = "ask"\n\n[projects."/home/daytona/workspace/noter"]\nmodel = "gpt-5"\n`,
        "/home/daytona/workspace/noter",
      ),
    ).toBe(
      `[projects."/other"]\ntrust_level = "ask"\n\n[projects."/home/daytona/workspace/noter"]\ntrust_level = "trusted"\nmodel = "gpt-5"\n`,
    );
  });
});
