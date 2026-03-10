import { describe, expect, it } from "vitest";

import { buildEffectiveFolderExpansionStates } from "@/lib/fileTreeState";

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
