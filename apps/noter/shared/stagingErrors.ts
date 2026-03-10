export const STALE_BASE_VERSION_ERROR_CODE = "STALE_BASE_VERSION";

function buildErrorCodePrefix(code: string): string {
  return `[${code}]`;
}

export function buildStaleBaseVersionErrorMessage(args: {
  expectedVersion: number;
  actualVersion: number;
}): string {
  return `${buildErrorCodePrefix(STALE_BASE_VERSION_ERROR_CODE)} pushContentUpdate failed: stale base version (expected ${args.expectedVersion}, got ${args.actualVersion})`;
}

export function readTaggedErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.name === STALE_BASE_VERSION_ERROR_CODE) {
    return error.name;
  }

  const match = /\[([A-Z0-9_]+)\]/.exec(error.message);
  return match?.[1] ?? null;
}

export function isStaleBaseVersionError(error: unknown): boolean {
  return readTaggedErrorCode(error) === STALE_BASE_VERSION_ERROR_CODE;
}
