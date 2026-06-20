// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  formatAppBuildVersionNumber,
  hasSelectedAppBuildVersion,
} from "./appBuild";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("formatAppBuildVersionLabel", () => {
  it("renders the one-based repo version label from a commit count", () => {
    expect(formatAppBuildVersionLabel(1)).toBe("v1");
    expect(formatAppBuildVersionLabel(123)).toBe("v123");
  });

  it("falls back to an unknown label when the commit count is unavailable", () => {
    expect(formatAppBuildVersionLabel(null)).toBe("v?");
    expect(formatAppBuildVersionLabel(0)).toBe("v?");
    expect(formatAppBuildVersionLabel(-1)).toBe("v?");
    expect(formatAppBuildVersionLabel(1.5)).toBe("v?");
    expect(formatAppBuildVersionLabel(Number.NaN)).toBe("v?");
    expect(formatAppBuildVersionLabel(Number.POSITIVE_INFINITY)).toBe("v?");
  });
});

describe("formatAppBuildVersionNumber", () => {
  it("returns only the clickable number segment", () => {
    expect(formatAppBuildVersionNumber(1)).toBe("1");
    expect(formatAppBuildVersionNumber(123)).toBe("123");
  });

  it("falls back to a plain unknown marker", () => {
    expect(formatAppBuildVersionNumber(null)).toBe("?");
    expect(formatAppBuildVersionNumber(0)).toBe("?");
    expect(formatAppBuildVersionNumber(-1)).toBe("?");
    expect(formatAppBuildVersionNumber(1.5)).toBe("?");
    expect(formatAppBuildVersionNumber(Number.NaN)).toBe("?");
    expect(formatAppBuildVersionNumber(Number.POSITIVE_INFINITY)).toBe("?");
  });
});

describe("formatAppBuildCommitLabel", () => {
  it("shortens full commit SHAs for display", () => {
    expect(formatAppBuildCommitLabel("1234567890abcdef1234567890abcdef12345678")).toBe("12345678");
  });

  it("falls back to the original marker for non-SHA values", () => {
    expect(formatAppBuildCommitLabel("unknown")).toBe("unknown");
  });
});

describe("hasSelectedAppBuildVersion", () => {
  function selectNodeContents(node: Node) {
    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    if (selection === null) {
      throw new Error("Expected DOM selection support");
    }

    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  it("recognizes wider selections that still cover the build label", () => {
    const wrapper = document.createElement("div");
    const prefix = document.createElement("span");
    prefix.textContent = "prefix";
    const buildLabel = document.createElement("span");
    buildLabel.textContent = "v 123";
    const suffix = document.createElement("span");
    suffix.textContent = "suffix";
    wrapper.append(prefix, buildLabel, suffix);
    document.body.append(wrapper);

    selectNodeContents(wrapper);

    expect(hasSelectedAppBuildVersion(buildLabel)).toBe(true);
  });

  it("returns false when the selection is elsewhere", () => {
    const buildLabel = document.createElement("span");
    buildLabel.textContent = "v 123";
    const unrelated = document.createElement("span");
    unrelated.textContent = "other";
    document.body.append(buildLabel, unrelated);
    selectNodeContents(unrelated);

    expect(hasSelectedAppBuildVersion(buildLabel)).toBe(false);
  });

  it("returns false when there is no selection", () => {
    const buildLabel = document.createElement("span");
    buildLabel.textContent = "v 123";
    document.body.append(buildLabel);

    expect(hasSelectedAppBuildVersion(buildLabel)).toBe(false);
  });
});
