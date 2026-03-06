export const DAYTONA_SNAPSHOT_STATUSES = [
  "queued",
  "building",
  "active",
  "failed",
  "removing",
] as const;

export type DaytonaSnapshotStatus = (typeof DAYTONA_SNAPSHOT_STATUSES)[number];

export const shortenCommitSha = (commitSha: string) =>
  commitSha.length <= 7 ? commitSha : commitSha.slice(0, 7);
