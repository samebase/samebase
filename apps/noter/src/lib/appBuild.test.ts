// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_BUILD_VERSION_PREFIX,
  formatAppBuildMarkdownLink,
  formatAppBuildVersionLabel,
  formatAppBuildVersionNumber,
  hasSelectedAppBuildVersion,
  installAppBuildMarkdownCopy,
} from "./appBuild";

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("formatAppBuildVersionLabel", () => {
  it("renders the one-based repo version label from a commit count", () => {
    expect(formatAppBuildVersionLabel(1)).toBe("v 1");
    expect(formatAppBuildVersionLabel(123)).toBe("v 123");
  });

  it("falls back to an unknown label when the commit count is unavailable", () => {
    expect(formatAppBuildVersionLabel(null)).toBe("v ?");
    expect(formatAppBuildVersionLabel(0)).toBe("v ?");
    expect(formatAppBuildVersionLabel(Number.NaN)).toBe("v ?");
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
    expect(formatAppBuildVersionNumber(Number.NaN)).toBe("?");
  });
});

describe("formatAppBuildMarkdownLink", () => {
  it("formats the build label as a Markdown link when a commit URL exists", () => {
    expect(
      formatAppBuildMarkdownLink({
        commitNumberLabel: "123",
        commitUrl: "https://github.com/noter-md/noter/commit/abc123",
      }),
    ).toBe("[123](https://github.com/noter-md/noter/commit/abc123)");
  });

  it("falls back to the plain label without a commit URL", () => {
    expect(
      formatAppBuildMarkdownLink({
        commitNumberLabel: "?",
        commitUrl: "",
      }),
    ).toBe("?");
  });
});

describe("installAppBuildMarkdownCopy", () => {
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

  function createCopyEvent() {
    const clipboardData = {
      setData: vi.fn(),
    };
    const copyEvent = new Event("copy", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(copyEvent, "clipboardData", {
      value: clipboardData,
    });

    return { clipboardData, copyEvent };
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

  it("rewrites selected build text to a Markdown link during copy", () => {
    const buildLabel = document.createElement("span");
    buildLabel.textContent = "123";
    document.body.append(buildLabel);
    selectNodeContents(buildLabel);

    const disposeCopyHandler = installAppBuildMarkdownCopy(buildLabel, {
      commitNumberLabel: "123",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      1,
      "text/plain",
      "[123](https://github.com/noter-md/noter/commit/abc123)",
    );
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      2,
      "text/markdown",
      "[123](https://github.com/noter-md/noter/commit/abc123)",
    );
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      3,
      "text/html",
      '<a href="https://github.com/noter-md/noter/commit/abc123">123</a>',
    );
  });

  it("ignores copy events when the selection is elsewhere", () => {
    const buildLabel = document.createElement("span");
    buildLabel.textContent = "v 123";
    const unrelated = document.createElement("span");
    unrelated.textContent = "other";
    document.body.append(buildLabel, unrelated);
    selectNodeContents(unrelated);

    const disposeCopyHandler = installAppBuildMarkdownCopy(buildLabel, {
      commitNumberLabel: "123",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(copyEvent.defaultPrevented).toBe(false);
    expect(clipboardData.setData).not.toHaveBeenCalled();
  });

  it("keeps the visible prefix outside the copied link payload", () => {
    const wrapper = document.createElement("div");
    const prefix = document.createElement("span");
    prefix.textContent = APP_BUILD_VERSION_PREFIX;
    const spacer = document.createTextNode(" ");
    const buildLabel = document.createElement("a");
    buildLabel.textContent = "123";
    wrapper.append(prefix, spacer, buildLabel);
    document.body.append(wrapper);
    selectNodeContents(wrapper);

    const disposeCopyHandler = installAppBuildMarkdownCopy(buildLabel, {
      commitNumberLabel: "123",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      1,
      "text/plain",
      "[123](https://github.com/noter-md/noter/commit/abc123)",
    );
  });
});
