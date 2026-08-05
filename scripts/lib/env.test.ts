import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  readBooleanEnvValue,
  readOptionalEnvValue,
  readPositiveIntegerEnvValue,
  stripWrappingQuotes,
} from "./env.ts";
import { readEnvFile } from "./envFile.ts";

describe("env helpers", () => {
  it("treats blank env values as missing while stripping quotes", () => {
    expect(readOptionalEnvValue("  ")).toBeNull();
    expect(readOptionalEnvValue(' "quoted" ')).toBe("quoted");
    expect(readOptionalEnvValue(" plain ")).toBe("plain");
  });

  it("parses boolean env flags from common truthy values", () => {
    expect(readBooleanEnvValue("1")).toBe(true);
    expect(readBooleanEnvValue(" yes ")).toBe(true);
    expect(readBooleanEnvValue("TRUE")).toBe(true);
    expect(readBooleanEnvValue("false")).toBe(false);
    expect(readBooleanEnvValue("0")).toBe(false);
    expect(readBooleanEnvValue("no")).toBe(false);
    expect(readBooleanEnvValue(undefined)).toBe(false);
  });

  it("parses positive integer env values when present", () => {
    expect(readPositiveIntegerEnvValue(undefined, "PORT", "help")).toBeNull();
    expect(readPositiveIntegerEnvValue("5174", "PORT", "help")).toBe(5174);
  });

  it("strips wrapping quotes without changing bare values", () => {
    expect(stripWrappingQuotes('"value"')).toBe("value");
    expect(stripWrappingQuotes("'value'")).toBe("value");
    expect(stripWrappingQuotes("value")).toBe("value");
  });
});

describe("readEnvFile", () => {
  it("parses env files while preserving empty assignments", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "samebase-env-file-"));
    const envPath = path.join(tempDir, ".env.local");

    try {
      writeFileSync(
        envPath,
        `# comment
FOO=bar
QUOTED="value"
ESCAPED="line one\\nline two"
EMPTY=
SPACED=' spaced value '
`,
        "utf8",
      );

      expect(readEnvFile(envPath)).toEqual({
        path: envPath,
        vars: {
          FOO: "bar",
          QUOTED: "value",
          ESCAPED: "line one\nline two",
          EMPTY: "",
          SPACED: " spaced value ",
        },
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
