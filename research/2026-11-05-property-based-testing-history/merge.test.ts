// Bug: on a phone, letting go of a sidebar far above its minimum width merged it into the main pane.
// Lived 2026-05-04 (98ec9a99b) to 2026-07-04 (a9d09423a).
import fc from "fast-check";
import { run } from "./run.ts";
const G = await import(process.env.GEOMETRY ?? "./old/geometry-before-a9d09423a.ts");
const MIN = G.WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX; // 96

function mergesOnRelease(viewport: number, startSide: number, releaseSide: number) {
  const w = G.getMobileMinResizeMergeWidthsPx({
    mainMaxWidthPx: viewport, mainMinWidthPx: G.WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
    rawSideWidthPx: releaseSide, sideMaxWidthPx: G.getMobileSidebarMaxWidthPx(viewport), sideMinWidthPx: MIN,
    startMainWidthPx: viewport, startSideWidthPx: startSide, viewportWidthPx: viewport,
  });
  return w !== null && G.shouldCommitMobileMergedSurface({
    mainDefaultWidthPx: viewport, mainWidthPx: w.mainWidthPx, settledMainWidthPx: w.settledMainWidthPx,
    sideMinWidthPx: MIN, sideWidthPx: w.sideWidthPx, // fields the fixed version reads
  });
}

const drag = fc.integer({ min: 320, max: 767 }).chain((viewport) => {
  const side = fc.integer({ min: MIN, max: G.getMobileSidebarMaxWidthPx(viewport) });
  return fc.record({ viewport: fc.constant(viewport), startA: side, startB: side, release: side });
});

await run("same release width => same merge decision, whatever the start width",
  fc.property(drag, (d) => mergesOnRelease(d.viewport, d.startA, d.release) === mergesOnRelease(d.viewport, d.startB, d.release)));

await run("a sidebar released at 2x its minimum or wider never merges",
  fc.property(drag, (d) => d.release < 2 * MIN || !mergesOnRelease(d.viewport, d.startA, d.release)));

await run("sanity: dragging all the way to the edge merges",
  fc.property(drag, (d) => mergesOnRelease(d.viewport, d.startA, 0)));
