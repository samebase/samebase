// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_ROUTE_TEXT_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildMarkdownLink,
  formatAppBuildRouteLabel,
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

describe("formatAppBuildRouteLabel", () => {
  it("renders the pathname, search, and hash without the domain", () => {
    expect(
      formatAppBuildRouteLabel({
        hash: "#preview",
        pathname: "/terms",
        search: "?source=phone",
      } as Location),
    ).toBe("/terms?source=phone#preview");
  });

  it("supports TanStack Router parsed locations via searchStr", () => {
    expect(
      formatAppBuildRouteLabel({
        hash: "preview",
        pathname: "/terms",
        searchStr: "?source=phone",
      }),
    ).toBe("/terms?source=phone#preview");
  });

  it("falls back to root when every segment is empty", () => {
    expect(
      formatAppBuildRouteLabel({
        hash: "",
        pathname: "",
        search: "",
      } as Location),
    ).toBe("/");
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
    expect(
      formatAppBuildCommitLabel("1234567890abcdef1234567890abcdef12345678"),
    ).toBe("12345678");
  });

  it("falls back to the original marker for non-SHA values", () => {
    expect(formatAppBuildCommitLabel("unknown")).toBe("unknown");
  });
});

describe("formatAppBuildMarkdownLink", () => {
  it("formats the linked build number as a Markdown link when a commit URL exists", () => {
    expect(
      formatAppBuildMarkdownLink({
        appBuildCopyLabel: "12345678",
        commitUrl: "https://github.com/noter-md/noter/commit/abc123",
      }),
    ).toBe("[12345678](https://github.com/noter-md/noter/commit/abc123)");
  });

  it("falls back to the plain copied value without a commit URL", () => {
    expect(
      formatAppBuildMarkdownLink({
        appBuildCopyLabel: "12345678",
        commitUrl: "",
      }),
    ).toBe("12345678");
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
      appBuildCopyLabel: "12345678",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      1,
      "text/plain",
      "[12345678](https://github.com/noter-md/noter/commit/abc123)",
    );
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      2,
      "text/markdown",
      "[12345678](https://github.com/noter-md/noter/commit/abc123)",
    );
    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      3,
      "text/html",
      '<a href="https://github.com/noter-md/noter/commit/abc123">12345678</a>',
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
      appBuildCopyLabel: "12345678",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(copyEvent.defaultPrevented).toBe(false);
    expect(clipboardData.setData).not.toHaveBeenCalled();
  });

  it("keeps the copied link aligned with the linked commit label when the selection includes the version text", () => {
    const wrapper = document.createElement("div");
    const routeLabel = document.createElement("span");
    routeLabel.dataset.testid = APP_BUILD_ROUTE_TEXT_TEST_ID;
    routeLabel.textContent = "/terms";
    const versionLabel = document.createElement("span");
    versionLabel.dataset.testid = APP_BUILD_VERSION_TEST_ID;
    versionLabel.textContent = "v123";
    const commitLabel = document.createElement("a");
    commitLabel.dataset.testid = APP_BUILD_COMMIT_LINK_TEST_ID;
    commitLabel.textContent = "12345678";
    wrapper.append(routeLabel, versionLabel, commitLabel);
    document.body.append(wrapper);
    selectNodeContents(wrapper);

    const disposeCopyHandler = installAppBuildMarkdownCopy(commitLabel, {
      appBuildCopyLabel: "12345678",
      commitUrl: "https://github.com/noter-md/noter/commit/abc123",
    });
    const { clipboardData, copyEvent } = createCopyEvent();

    document.dispatchEvent(copyEvent);
    disposeCopyHandler();

    expect(clipboardData.setData).toHaveBeenNthCalledWith(
      1,
      "text/plain",
      "[12345678](https://github.com/noter-md/noter/commit/abc123)",
    );
  });
});
