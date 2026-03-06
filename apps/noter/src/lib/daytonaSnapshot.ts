export const DAYTONA_SNAPSHOT_STATUSES = [
  "queued",
  "building",
  "active",
  "failed",
  "removing",
] as const;

export type DaytonaSnapshotStatus = (typeof DAYTONA_SNAPSHOT_STATUSES)[number];

export const shortenCommitSha = (commitSha: string) => {
  const normalized = commitSha.trim().toLowerCase();
  return normalized.length <= 7 ? normalized : normalized.slice(0, 7);
};
