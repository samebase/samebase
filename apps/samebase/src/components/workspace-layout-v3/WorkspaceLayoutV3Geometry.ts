/**
 * Pane-trail geometry: the workspace is an ordered list of panes where the
 * last pane is the focus (flexes to fill) and every earlier pane is context.
 * A context pane is either expanded (fixed width, resizable) or collapsed
 * into its own 32px icon rail. Every pane keeps one continuous element in
 * both states so collapse and expand render as width transitions the eye can
 * follow — that causality is why collapsed neighbors do NOT coalesce.
 *
 * There is no left/right/main vocabulary, no merge model, and no mobile
 * resize: those are the v2 concepts this lab replaces.
 */

export const WORKSPACE_PANE_RAIL_WIDTH_PX = 32;
export const WORKSPACE_PANE_MIN_WIDTH_PX = 160;
export const WORKSPACE_PANE_DEFAULT_WIDTH_PX = 240;
export const WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX = 420;
/** Dragging a pane this far below its minimum and releasing collapses it. */
export const WORKSPACE_PANE_COLLAPSE_SLACK_PX = 48;
/** The mobile carousel settle check mirrors v2's scroll-quiet timing. */
export const WORKSPACE_PANE_MOBILE_SETTLE_DELAY_MS = 80;

export type WorkspacePaneTrailPaneInput = {
  id: string;
  minWidthPx: number;
};

export type WorkspacePaneTrailSolveArgs = {
  /** Ordered trail; the last entry is the focus pane. */
  panes: readonly WorkspacePaneTrailPaneInput[];
  viewportWidthPx: number;
  /** Persisted expanded widths per pane id; missing = default width. */
  widths: Readonly<Record<string, number>>;
  /** Pane ids the operator collapsed by dragging past minimum. */
  userCollapsed: ReadonlySet<string>;
  /**
   * The pane most recently expanded from a rail. Auto-collapse skips it so
   * expanding a rail icon can never be undone by the solver in the same
   * breath; some other pane gives way instead.
   */
  lastExpandedId: string | null;
};

export type WorkspacePaneTrailEntry =
  | { kind: "rail"; id: string }
  | { kind: "pane"; id: string; widthPx: number }
  | { kind: "focus"; id: string };

export type WorkspacePaneTrailSolution = {
  entries: readonly WorkspacePaneTrailEntry[];
  /** Context panes collapsed by the solver for space, not by the operator. */
  autoCollapsed: ReadonlySet<string>;
};

export function getWorkspacePaneWidthPx(
  widths: Readonly<Record<string, number>>,
  pane: WorkspacePaneTrailPaneInput,
): number {
  if (!(pane.id in widths)) {
    return Math.max(pane.minWidthPx, WORKSPACE_PANE_DEFAULT_WIDTH_PX);
  }
  return Math.max(pane.minWidthPx, widths[pane.id]);
}

function getTrailCostPx(args: {
  context: readonly WorkspacePaneTrailPaneInput[];
  closed: ReadonlySet<string>;
  widths: Readonly<Record<string, number>>;
}): number {
  let costPx = WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX;
  for (const pane of args.context) {
    costPx += args.closed.has(pane.id)
      ? WORKSPACE_PANE_RAIL_WIDTH_PX
      : getWorkspacePaneWidthPx(args.widths, pane);
  }
  return costPx;
}

/**
 * Deterministic desktop layout: start from the operator's collapsed set, then
 * collapse leftmost expanded context panes (oldest context first) until the
 * trail fits the viewport. Auto-collapse is derived on every solve and never
 * persisted, so growing the window back re-expands panes on its own.
 */
export function solveWorkspacePaneTrail(
  args: WorkspacePaneTrailSolveArgs,
): WorkspacePaneTrailSolution {
  if (args.panes.length === 0) {
    return { entries: [], autoCollapsed: new Set() };
  }
  const focusPane = args.panes[args.panes.length - 1];
  const context = args.panes.slice(0, -1);

  const closed = new Set(args.userCollapsed);
  const autoCollapsed = new Set<string>();
  while (getTrailCostPx({ context, closed, widths: args.widths }) > args.viewportWidthPx) {
    const victim =
      context.find((pane) => !closed.has(pane.id) && pane.id !== args.lastExpandedId) ??
      context.find((pane) => !closed.has(pane.id));
    if (victim === undefined) {
      break;
    }
    closed.add(victim.id);
    autoCollapsed.add(victim.id);
  }

  const entries: WorkspacePaneTrailEntry[] = context.map((pane) =>
    closed.has(pane.id)
      ? { kind: "rail" as const, id: pane.id }
      : { kind: "pane" as const, id: pane.id, widthPx: getWorkspacePaneWidthPx(args.widths, pane) },
  );
  entries.push({ kind: "focus", id: focusPane.id });

  return { entries, autoCollapsed };
}

/**
 * Mobile carousel: every pane is one full-viewport screen and the active
 * index is derived from scroll position. There is no resize and no merge.
 */
export function getWorkspacePaneTrailNearestIndex(args: {
  scrollLeftPx: number;
  paneWidthPx: number;
  paneCount: number;
}): number {
  if (args.paneWidthPx <= 0 || args.paneCount === 0) {
    return 0;
  }
  const rawIndex = Math.round(args.scrollLeftPx / args.paneWidthPx);
  return Math.min(Math.max(rawIndex, 0), args.paneCount - 1);
}
