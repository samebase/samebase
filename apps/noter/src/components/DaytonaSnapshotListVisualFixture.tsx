import {
  DaytonaSnapshotListSurface,
  type DaytonaSnapshotListSurfaceSnapshot,
} from "@/components/DaytonaSnapshotList";

const SNAPSHOTS: DaytonaSnapshotListSurfaceSnapshot[] = [
  {
    name: "noter-prebuild-dev-quiet-robin-508-noter-md-noter-main-be9b65eb3d75cf9492eea13e8153cef0edbc027",
    state: "failed",
    commitSha: "be9b65eb3d75cf9492eea13e8153cef0edbc027",
    dashboardUrl: undefined,
    errorReason:
      "Failed to create snapshot. Name: noter-prebuild-dev-quiet-robin-508-noter-md-noter-main-be9b65eb3d75cf9492eea13e8153cef0edbc027 Reason: unprocessable entity: manifest unknown",
    attemptCount: 57,
    createdAt: undefined,
    updatedAt: undefined,
    lastUsedAt: undefined,
    nextRetryAt: undefined,
  },
  {
    name: "noter-prebuild-dev-quiet-robin-508-noter-md-noter-main-c28b7269e8ae68ea28e75ec2573a95fbce7716f",
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
        statusMessage="Stopped automatic retries and removed 2 Daytona snapshots."
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
