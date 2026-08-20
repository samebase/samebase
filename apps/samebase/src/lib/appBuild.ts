import { guard } from "@samebase/dependent";

export const APP_BUILD_STATUS_BAR_TEST_ID = "app-build-status-bar";
export const APP_BUILD_VERSION_TEST_ID = "app-build-version";
export const APP_BUILD_COMMIT_TEST_ID = "app-build-commit";
export const APP_BUILD_VERSION_PREFIX = "v";

const UNKNOWN_APP_BUILD_VERSION_NUMBER = "?";
const SHORT_APP_BUILD_COMMIT_LENGTH = 8;

const isValidAppBuildCommitNumber = guard<number | null, number>((commitNumber) => {
  if (commitNumber === null || !Number.isSafeInteger(commitNumber) || commitNumber < 1) {
    return null;
  }

  return commitNumber;
});

/**
 * Keep the numeric segment separate from surrounding chrome so the status bar
 * can render it either as plain text or as part of a linked reference.
 */
export function formatAppBuildVersionNumber(commitNumber: number | null): string {
  return isValidAppBuildCommitNumber(commitNumber)
    ? String(commitNumber)
    : UNKNOWN_APP_BUILD_VERSION_NUMBER;
}

/**
 * The header exposes the current build as a simple, one-based repo version so
 * users can speak about builds without needing to trade raw SHAs.
 */
export function formatAppBuildVersionLabel(commitNumber: number | null): string {
  return `${APP_BUILD_VERSION_PREFIX}${formatAppBuildVersionNumber(commitNumber)}`;
}

/** Show a short commit SHA so users can identify the exact build in reports. */
export function formatAppBuildCommitLabel(appCommit: string): string {
  return /^[0-9a-f]{8,40}$/i.test(appCommit)
    ? appCommit.slice(0, SHORT_APP_BUILD_COMMIT_LENGTH)
    : appCommit;
}
