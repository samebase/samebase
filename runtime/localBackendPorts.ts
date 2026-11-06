import { createHash } from "node:crypto";

const LOCAL_BACKEND_CLOUD_PORT_START = 11000;
const LOCAL_BACKEND_PORT_PAIR_COUNT = 2000;

type LocalBackendPortPair = {
  cloud: number;
  site: number;
};

/**
The port pairs of a folder's local backend, first the one that a hash of the folder picks. The same
folder gets the same pair at each start, so the hub callback on the site port keeps its address.
*/
function listLocalBackendPortCandidates(worktreeRoot: string): LocalBackendPortPair[] {
  const digest = createHash("sha256").update(worktreeRoot).digest();
  const startIndex = digest.readUInt32BE(0) % LOCAL_BACKEND_PORT_PAIR_COUNT;

  const candidates: LocalBackendPortPair[] = [];

  for (let offset = 0; offset < LOCAL_BACKEND_PORT_PAIR_COUNT; offset += 1) {
    const index = (startIndex + offset) % LOCAL_BACKEND_PORT_PAIR_COUNT;
    const cloud = LOCAL_BACKEND_CLOUD_PORT_START + index * 2;
    candidates.push({
      cloud,
      site: cloud + 1,
    });
  }

  return candidates;
}

export function pickAvailableLocalBackendPorts(
  worktreeRoot: string,
  isPortInUse: (port: number) => boolean,
): LocalBackendPortPair | null {
  for (const candidate of listLocalBackendPortCandidates(worktreeRoot)) {
    if (isPortInUse(candidate.cloud) || isPortInUse(candidate.site)) {
      continue;
    }
    return candidate;
  }

  return null;
}
