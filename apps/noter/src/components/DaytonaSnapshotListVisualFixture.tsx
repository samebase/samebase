import {
  DaytonaSnapshotListSurface,
  type DaytonaSnapshotListSurfaceSnapshot,
} from "@/components/DaytonaSnapshotList";

const SNAPSHOTS: DaytonaSnapshotListSurfaceSnapshot[] = [
  {
    name: "noter-prebuild-main-be9b65e",
    state: "failed",
    commitSha: "be9b65eb3d75cf9492eea13e8153cef0edbc027",
    dashboardUrl: undefined,
    errorReason: "manifest unknown",
    attemptCount: 57,
    createdAt: undefined,
    updatedAt: undefined,
    lastUsedAt: undefined,
    nextRetryAt: undefined,
  },
  {
    name: "noter-prebuild-main-c28b726",
    state: "building",
    commitSha: "c28b7269e8ae68ea28e75ec2573a95fbce7716f",
    dashboardUrl: undefined,
    errorReason: undefined,
    attemptCount: 6,
    createdAt: undefined,
    updatedAt: undefined,
    lastUsedAt: undefined,
    nextRetryAt: undefined,
  },
];

export function DaytonaSnapshotListVisualFixture() {
  return (
    <div className="inline-flex bg-background p-3 text-foreground">
      <DaytonaSnapshotListSurface
        snapshots={SNAPSHOTS}
        errorMessage={null}
        statusMessage="Stopped automatic retries."
        deletingSnapshotName={null}
        isExpanded
        isFetching={false}
        isStoppingRetries={false}
        onToggleExpanded={() => {}}
        onRefresh={() => {}}
        onStopRetries={() => {}}
        onDeleteSnapshot={() => {}}
        testId="daytona-snapshot-list-visual-fixture"
      />
    </div>
  );
}
