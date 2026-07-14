// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { FileTree } from "@/components/FileTree";
import { getFileTreeTooltipText, getRestoreDeletionLabel } from "@/lib/fileTreeLabels";
import { buildEffectiveFolderExpansionStates, getAncestorFolderPaths } from "@/lib/fileTreeState";

const { act, createElement } = React;
const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalMatchMedia = window.matchMedia;

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    const mountedRoot = root;
    act(() => {
      mountedRoot.unmount();
    });
    root = null;
  }

  document.body.replaceChildren();
  if (originalInnerWidthDescriptor !== undefined) {
    Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.useRealTimers();
});

describe("buildEffectiveFolderExpansionStates", () => {
  it("force-opens changed folders in changes mode", () => {
    const result = buildEffectiveFolderExpansionStates({
      folderExpansionStates: [
        {
          folderPath: "src",
          isExpanded: false,
        },
      ],
      autoExpandedPaths: new Set(["src"]),
      manualExpansionOverrides: new Map(),
      forceAutoExpandedPaths: true,
    });

    expect(result).toEqual([
      {
        folderPath: "src",
        isExpanded: true,
      },
    ]);
  });

  it("preserves manual collapse after a folder is auto-opened", () => {
    const result = buildEffectiveFolderExpansionStates({
      folderExpansionStates: [
        {
          folderPath: "src",
          isExpanded: false,
        },
      ],
      autoExpandedPaths: new Set(["src"]),
      manualExpansionOverrides: new Map([["src", false]]),
      forceAutoExpandedPaths: true,
    });

    expect(result).toEqual([
      {
        folderPath: "src",
        isExpanded: false,
      },
    ]);
  });

  it("leaves persisted folder state alone outside changes mode", () => {
    const result = buildEffectiveFolderExpansionStates({
      folderExpansionStates: [
        {
          folderPath: "src",
          isExpanded: false,
        },
      ],
      autoExpandedPaths: new Set(["src"]),
      manualExpansionOverrides: new Map(),
      forceAutoExpandedPaths: false,
    });

    expect(result).toEqual([
      {
        folderPath: "src",
        isExpanded: false,
      },
    ]);
  });
});

describe("FileTree", () => {
  it("renders nothing for an empty tree", () => {
    const markup = renderToStaticMarkup(
      createElement(FileTree, {
        folderExpansionStates: [],
        items: [],
      }),
    );

    expect(markup).toBe("");
  });

  it("renders read-only labeled links without a dialog provider", () => {
    const markup = renderToStaticMarkup(
      createElement(FileTree, {
        folderExpansionStates: [
          {
            folderPath: "01 Guide",
            isExpanded: true,
          },
        ],
        items: [
          {
            label: "Guide",
            originalPath: "01 Guide",
            path: "01 Guide",
            type: "tree",
          },
          {
            href: "#intro",
            label: "Intro",
            originalPath: "01 Guide/README.md",
            path: "01 Guide/README.md",
            type: "blob",
          },
        ],
      }),
    );

    expect(markup).toContain('href="#intro"');
    expect(markup).toContain("gap-0.5");
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain(">Guide<");
    expect(markup).toContain(">Intro<");
  });

  it("opens actions on long press for a coarse pointer at desktop width", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: query === "(hover: none) and (pointer: coarse)",
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        createElement(FileTree, {
          folderExpansionStates: [],
          items: [
            {
              elementId: "coarse-pointer-file-row",
              originalPath: "README.md",
              path: "README.md",
              type: "blob",
            },
          ],
          onFileRename: vi.fn(),
        }),
      );
    });

    const fileRow = document.getElementById("coarse-pointer-file-row");
    if (fileRow === null) {
      throw new Error("Expected the FileTree file row to render");
    }

    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", {
      value: [{ clientX: 40, clientY: 80 }],
    });

    act(() => {
      fileRow.dispatchEvent(touchStart);
      vi.advanceTimersByTime(500);
    });

    expect(rootElement.textContent).toContain("Rename");
  });
});

describe("getAncestorFolderPaths", () => {
  it("returns each parent folder for a nested file", () => {
    expect(getAncestorFolderPaths("src/features/editor/FileView.tsx")).toEqual([
      "src",
      "src/features",
      "src/features/editor",
    ]);
  });

  it("returns an empty list for root files", () => {
    expect(getAncestorFolderPaths("README.md")).toEqual([]);
  });
});

describe("getFileTreeTooltipText", () => {
  it("uses action copy for coarse-pointer folders", () => {
    expect(
      getFileTreeTooltipText({
        isFolder: true,
        isDeletedFile: false,
        isCoarsePointer: true,
        type: "tree",
      }),
    ).toBe("Long press for actions");
  });

  it("describes deleted-file tap plus long press for coarse pointers", () => {
    expect(
      getFileTreeTooltipText({
        isFolder: false,
        isDeletedFile: true,
        isCoarsePointer: true,
        type: "blob",
      }),
    ).toBe("Tap to review deleted file, long press for actions");
  });

  it("uses open copy when no context actions are available", () => {
    expect(
      getFileTreeTooltipText({
        hasContextMenuActions: false,
        isFolder: false,
        isDeletedFile: false,
        isCoarsePointer: false,
        type: "blob",
      }),
    ).toBe("Click to open");
  });
});

describe("getRestoreDeletionLabel", () => {
  it("shows the pending label while restore is in flight", () => {
    expect(getRestoreDeletionLabel(true)).toBe("Reverting...");
  });

  it("shows the default restore label when idle", () => {
    expect(getRestoreDeletionLabel(false)).toBe("Revert deletion");
  });
});
