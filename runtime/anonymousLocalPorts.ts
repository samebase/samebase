import { createHash } from "node:crypto";

export const ANONYMOUS_LOCAL_CLOUD_PORT_START = 11000;
export const ANONYMOUS_LOCAL_PORT_PAIR_COUNT = 2000;

type AnonymousLocalPortPair = {
  cloud: number;
  site: number;
};

export function listAnonymousLocalPortCandidates(worktreeRoot: string): AnonymousLocalPortPair[] {
  const digest = createHash("sha256").update(worktreeRoot).digest();
  const startIndex = digest.readUInt32BE(0) % ANONYMOUS_LOCAL_PORT_PAIR_COUNT;

  const candidates: AnonymousLocalPortPair[] = [];

  for (let offset = 0; offset < ANONYMOUS_LOCAL_PORT_PAIR_COUNT; offset += 1) {
    const index = (startIndex + offset) % ANONYMOUS_LOCAL_PORT_PAIR_COUNT;
    const cloud = ANONYMOUS_LOCAL_CLOUD_PORT_START + index * 2;
    candidates.push({
      cloud,
      site: cloud + 1,
    });
  }

  return candidates;
}

export function pickAvailableAnonymousLocalPorts(
  worktreeRoot: string,
  isPortInUse: (port: number) => boolean,
): AnonymousLocalPortPair | null {
  for (const candidate of listAnonymousLocalPortCandidates(worktreeRoot)) {
    if (isPortInUse(candidate.cloud) || isPortInUse(candidate.site)) {
      continue;
    }
    return candidate;
  }

  return null;
}
