import { createHash } from "node:crypto";

export const ANONYMOUS_LOCAL_CLOUD_PORT_START = 11000;
export const ANONYMOUS_LOCAL_PORT_PAIR_COUNT = 2000;

/**
 * @typedef {{
 *   cloud: number
 *   site: number
 * }} AnonymousLocalPortPair
 */

/**
 * @param {string} worktreeRoot
 * @returns {AnonymousLocalPortPair[]}
 */
export function listAnonymousLocalPortCandidates(worktreeRoot) {
  const digest = createHash("sha256").update(worktreeRoot).digest();
  const startIndex = digest.readUInt32BE(0) % ANONYMOUS_LOCAL_PORT_PAIR_COUNT;
  /** @type {AnonymousLocalPortPair[]} */
  const candidates = [];

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

/**
 * @param {string} worktreeRoot
 * @param {(port: number) => boolean} isPortInUse
 * @returns {AnonymousLocalPortPair | null}
 */
export function pickAvailableAnonymousLocalPorts(worktreeRoot, isPortInUse) {
  for (const candidate of listAnonymousLocalPortCandidates(worktreeRoot)) {
    if (isPortInUse(candidate.cloud) || isPortInUse(candidate.site)) {
      continue;
    }
    return candidate;
  }

  return null;
}
