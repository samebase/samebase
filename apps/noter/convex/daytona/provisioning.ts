export const DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED = "snapshot_backed";
export const DAYTONA_PROVISIONING_MODE_LIVE_DEBUG = "live_debug";

export const DAYTONA_PROVISIONING_MODES = [
  DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED,
  DAYTONA_PROVISIONING_MODE_LIVE_DEBUG,
] as const;

export type DaytonaProvisioningMode =
  (typeof DAYTONA_PROVISIONING_MODES)[number];

type SnapshotRecordLike = {
  status: string;
  snapshotName?: string | null;
  commitSha: string;
  createdAt: number;
};

export function resolveDaytonaProvisioningMode(
  mode?: DaytonaProvisioningMode | null,
): DaytonaProvisioningMode {
  return mode === DAYTONA_PROVISIONING_MODE_LIVE_DEBUG
    ? DAYTONA_PROVISIONING_MODE_LIVE_DEBUG
    : DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED;
}

export function findLatestActiveDaytonaSnapshotRecord<
  T extends SnapshotRecordLike,
>(records: readonly T[]): T | null {
  let latestRecord: T | null = null;

  for (const record of records) {
    if (record.status !== "active") {
      continue;
    }
    const snapshotName = record.snapshotName?.trim() ?? "";
    if (snapshotName.length === 0) {
      continue;
    }
    if (!latestRecord || record.createdAt > latestRecord.createdAt) {
      latestRecord = record;
    }
  }

  return latestRecord;
}
