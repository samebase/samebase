import { describe, expect, it, vi } from "vitest";

import {
  parsePositiveInteger,
  resolveAppCommitNumber,
} from "./appBuildMetadata";

describe("parsePositiveInteger", () => {
  it("accepts positive integers", () => {
    expect(parsePositiveInteger("1")).toBe(1);
    expect(parsePositiveInteger("1007")).toBe(1007);
  });

  it("rejects invalid or partial values", () => {
    expect(parsePositiveInteger("")).toBeNull();
    expect(parsePositiveInteger("0")).toBeNull();
    expect(parsePositiveInteger("-1")).toBeNull();
    expect(parsePositiveInteger("1.5")).toBeNull();
    expect(parsePositiveInteger("123abc")).toBeNull();
  });
});

describe("resolveAppCommitNumber", () => {
  it("prefers an explicit environment override", () => {
    const readGitOutput = vi.fn(() => null);
    const runGitCommand = vi.fn(() => false);

    expect(
      resolveAppCommitNumber({
        envCommitNumber: "1007",
        readGitOutput,
        runGitCommand,
      }),
    ).toBe(1007);
    expect(readGitOutput).not.toHaveBeenCalled();
    expect(runGitCommand).not.toHaveBeenCalled();
  });

  it("uses the local git ancestry count when history is complete", () => {
    const readGitOutput = vi.fn((command: string) => {
      if (command === "git rev-parse --is-shallow-repository") {
        return "false";
      }
      if (command === "git rev-list --count HEAD") {
        return "1007";
      }
      return null;
    });

    expect(
      resolveAppCommitNumber({
        envCommitNumber: undefined,
        readGitOutput,
        runGitCommand: () => false,
      }),
    ).toBe(1007);
  });

  it("deepens shallow clones before trusting the git commit count", () => {
    let isShallowRepository = true;
    const readGitOutput = vi.fn((command: string) => {
      if (command === "git rev-parse --is-shallow-repository") {
        return isShallowRepository ? "true" : "false";
      }
      if (command === "git rev-list --count HEAD") {
        return isShallowRepository ? "1" : "1007";
      }
      return null;
    });
    const runGitCommand = vi.fn((command: string) => {
      if (command === "git fetch --quiet --unshallow origin") {
        isShallowRepository = false;
        return true;
      }
      return false;
    });

    expect(
      resolveAppCommitNumber({
        envCommitNumber: undefined,
        readGitOutput,
        runGitCommand,
      }),
    ).toBe(1007);
    expect(runGitCommand).toHaveBeenCalledWith(
      "git fetch --quiet --unshallow origin",
    );
    expect(runGitCommand).toHaveBeenCalledTimes(1);
    expect(readGitOutput).toHaveBeenCalledTimes(3);
  });

  it("returns null instead of trusting a shallow-count fallback", () => {
    const readGitOutput = vi.fn((command: string) => {
      if (command === "git rev-parse --is-shallow-repository") {
        return "true";
      }
      if (command === "git rev-list --count HEAD") {
        return "1";
      }
      return null;
    });
    const runGitCommand = vi.fn(() => false);

    expect(
      resolveAppCommitNumber({
        envCommitNumber: undefined,
        readGitOutput,
        runGitCommand,
      }),
    ).toBeNull();
    expect(runGitCommand).toHaveBeenNthCalledWith(
      1,
      "git fetch --quiet --unshallow origin",
    );
    expect(runGitCommand).toHaveBeenNthCalledWith(
      2,
      "git fetch --quiet --depth=2147483647 origin",
    );
  });
});
