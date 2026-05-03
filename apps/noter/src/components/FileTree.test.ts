import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { FileTree } from "@/components/FileTree";
import {
  getFileTreeTooltipText,
  getRestoreDeletionLabel,
} from "@/lib/fileTreeLabels";
import {
  buildEffectiveFolderExpansionStates,
  getAncestorFolderPaths,
} from "@/lib/fileTreeState";

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
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain(">Guide<");
    expect(markup).toContain(">Intro<");
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
  it("uses action copy for mobile folders", () => {
    expect(
      getFileTreeTooltipText({
        isFolder: true,
        isDeletedFile: false,
        isMobile: true,
        type: "tree",
      }),
    ).toBe("Long press for actions");
  });

  it("describes deleted-file tap plus long press on mobile", () => {
    expect(
      getFileTreeTooltipText({
        isFolder: false,
        isDeletedFile: true,
        isMobile: true,
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
        isMobile: false,
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
