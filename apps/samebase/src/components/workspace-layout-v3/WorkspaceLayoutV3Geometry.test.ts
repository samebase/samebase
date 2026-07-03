import { describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX,
  WORKSPACE_PANE_RAIL_WIDTH_PX,
  getWorkspacePaneTrailNearestIndex,
  solveWorkspacePaneTrail,
} from "./WorkspaceLayoutV3Geometry";

const FIVE_PANES = [
  { id: "nav", minWidthPx: 200 },
  { id: "vaults", minWidthPx: 220 },
  { id: "branches", minWidthPx: 220 },
  { id: "files", minWidthPx: 240 },
  { id: "editor", minWidthPx: 160 },
] as const;

function solve(overrides: Partial<Parameters<typeof solveWorkspacePaneTrail>[0]> = {}) {
  return solveWorkspacePaneTrail({
    panes: FIVE_PANES,
    viewportWidthPx: 2000,
    widths: {},
    userCollapsed: new Set(),
    lastExpandedId: null,
    ...overrides,
  });
}

describe("solveWorkspacePaneTrail", () => {
  it("keeps every pane expanded when the viewport fits the whole trail", () => {
    const solution = solve();
    expect(solution.entries.map((entry) => entry.kind)).toEqual([
      "pane",
      "pane",
      "pane",
      "pane",
      "focus",
    ]);
    expect(solution.autoCollapsed.size).toBe(0);
  });

  it("auto-collapses leftmost context panes first when space runs out", () => {
    // Four context panes at 240px default each = 960px + 420px focus min =
    // 1380px. At 1200px collapsing nav (960 - 240 + 32 rail = 1172) fits.
    const solution = solve({ viewportWidthPx: 1200 });
    expect(solution.autoCollapsed).toEqual(new Set(["nav"]));
    expect(solution.entries[0]).toEqual({ kind: "rail", id: "nav" });
  });

  it("never auto-collapses the pane the operator just expanded", () => {
    const solution = solve({ viewportWidthPx: 1200, lastExpandedId: "nav" });
    expect(solution.autoCollapsed.has("nav")).toBe(false);
    expect(solution.autoCollapsed).toEqual(new Set(["vaults"]));
  });

  it("collapses as many panes as the viewport demands, leftmost first", () => {
    // 720px cannot fit any expanded context pane: 3 rails + 240 + 420 = 756.
    const solution = solve({ viewportWidthPx: 720 });
    expect(solution.autoCollapsed).toEqual(new Set(["nav", "vaults", "branches", "files"]));
  });

  it("keeps every collapsed pane as its own rail entry in trail order", () => {
    const solution = solve({
      userCollapsed: new Set(["nav", "vaults", "files"]),
    });
    expect(solution.entries).toEqual([
      { kind: "rail", id: "nav" },
      { kind: "rail", id: "vaults" },
      { kind: "pane", id: "branches", widthPx: 240 },
      { kind: "rail", id: "files" },
      { kind: "focus", id: "editor" },
    ]);
  });

  it("charges one rail width per collapsed pane", () => {
    // All four context panes collapsed cost 4 rails + focus min exactly.
    const solution = solve({
      viewportWidthPx: WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX + 4 * WORKSPACE_PANE_RAIL_WIDTH_PX,
      userCollapsed: new Set(["nav", "vaults", "branches", "files"]),
    });
    expect(solution.entries.map((entry) => entry.kind)).toEqual([
      "rail",
      "rail",
      "rail",
      "rail",
      "focus",
    ]);
    expect(solution.autoCollapsed.size).toBe(0);
  });

  it("respects persisted widths over defaults and clamps below pane minimums", () => {
    const solution = solve({ widths: { files: 400, branches: 100 } });
    const fileEntry = solution.entries.find(
      (entry) => entry.kind === "pane" && entry.id === "files",
    );
    const branchesEntry = solution.entries.find(
      (entry) => entry.kind === "pane" && entry.id === "branches",
    );
    expect(fileEntry).toEqual({ kind: "pane", id: "files", widthPx: 400 });
    // Stored 100px is below the 220px minimum and gets clamped back up.
    expect(branchesEntry).toEqual({ kind: "pane", id: "branches", widthPx: 220 });
  });

  it("keeps the focus pane even when nothing fits", () => {
    const solution = solve({ viewportWidthPx: 100 });
    expect(solution.entries[solution.entries.length - 1]).toEqual({
      kind: "focus",
      id: "editor",
    });
  });

  it("renders a single-pane trail as just the focus pane", () => {
    const solution = solve({ panes: [{ id: "only", minWidthPx: 160 }] });
    expect(solution.entries).toEqual([{ kind: "focus", id: "only" }]);
  });
});

describe("getWorkspacePaneTrailNearestIndex", () => {
  it("derives the nearest pane index from scroll position", () => {
    expect(
      getWorkspacePaneTrailNearestIndex({ scrollLeftPx: 0, paneWidthPx: 390, paneCount: 5 }),
    ).toBe(0);
    expect(
      getWorkspacePaneTrailNearestIndex({ scrollLeftPx: 585, paneWidthPx: 390, paneCount: 5 }),
    ).toBe(2);
    expect(
      getWorkspacePaneTrailNearestIndex({ scrollLeftPx: 9999, paneWidthPx: 390, paneCount: 5 }),
    ).toBe(4);
  });

  it("returns zero for an unmeasured carousel", () => {
    expect(
      getWorkspacePaneTrailNearestIndex({ scrollLeftPx: 100, paneWidthPx: 0, paneCount: 3 }),
    ).toBe(0);
  });
});
