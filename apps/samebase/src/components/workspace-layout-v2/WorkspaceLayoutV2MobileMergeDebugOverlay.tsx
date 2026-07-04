import { cn } from "@/lib/utils";
import { type WorkspaceLayoutV2MobileMergeDebugGeometry } from "./WorkspaceLayoutV2Geometry";

function WorkspaceLayoutV2MergeDebugMarker({
  label,
  positionPx,
  tone,
}: {
  label: string;
  positionPx: number;
  tone: "commit" | "min" | "start";
}) {
  const markerClassName = {
    commit: "border-amber-500 bg-amber-500/15 text-amber-950 dark:text-amber-100",
    min: "border-rose-500 bg-rose-500/15 text-rose-950 dark:text-rose-100",
    start: "border-sky-500 bg-sky-500/15 text-sky-950 dark:text-sky-100",
  }[tone];
  const labelPositionClassName = {
    commit: "top-2",
    min: "top-2",
    start: "top-8",
  }[tone];

  return (
    <div
      data-testid={`workspace-layout-v2-merge-debug-${tone}-marker`}
      className={cn("absolute inset-y-0 border-l", markerClassName)}
      style={{ left: `${positionPx}px` }}
    >
      <div
        className={cn(
          "absolute left-1 whitespace-nowrap border border-current bg-background/90 px-1 py-0.5 text-[10px] leading-none",
          labelPositionClassName,
        )}
      >
        {label}
      </div>
    </div>
  );
}

export function WorkspaceLayoutV2MobileMergeDebugOverlay({
  geometry,
}: {
  geometry: WorkspaceLayoutV2MobileMergeDebugGeometry;
}) {
  const mergeZoneWidthPx = Math.max(0, geometry.mergeZoneEndPx - geometry.mergeZoneStartPx);
  const resizeOnlyZoneWidthPx = Math.max(
    0,
    geometry.resizeOnlyZoneEndPx - geometry.resizeOnlyZoneStartPx,
  );

  return (
    <div
      aria-hidden="true"
      data-testid="workspace-layout-v2-merge-debug-overlay"
      data-workspace-layout-v2-merge-debug-side={geometry.side}
      data-workspace-layout-v2-merge-debug-start-width={geometry.startSideWidthPx}
      data-workspace-layout-v2-merge-debug-commit-width={geometry.commitSideWidthPx}
      data-workspace-layout-v2-merge-debug-min-width={geometry.minSideWidthPx}
      className="pointer-events-none absolute inset-0 z-[28] md:hidden"
    >
      <div
        data-testid="workspace-layout-v2-merge-debug-resize-zone"
        className="absolute inset-y-0 bg-sky-500/10"
        style={{
          left: `${geometry.resizeOnlyZoneStartPx}px`,
          width: `${resizeOnlyZoneWidthPx}px`,
        }}
      />
      <div
        data-testid="workspace-layout-v2-merge-debug-commit-zone"
        className="absolute inset-y-0 bg-amber-500/15"
        style={{
          left: `${geometry.mergeZoneStartPx}px`,
          width: `${mergeZoneWidthPx}px`,
        }}
      />
      <WorkspaceLayoutV2MergeDebugMarker
        label={`start ${geometry.startSideWidthPx}px`}
        positionPx={geometry.startEdgePositionPx}
        tone="start"
      />
      <WorkspaceLayoutV2MergeDebugMarker
        label={`merge ${geometry.commitSideWidthPx}px`}
        positionPx={geometry.commitEdgePositionPx}
        tone="commit"
      />
      <WorkspaceLayoutV2MergeDebugMarker
        label={`min ${geometry.minSideWidthPx}px`}
        positionPx={geometry.minEdgePositionPx}
        tone="min"
      />
    </div>
  );
}
