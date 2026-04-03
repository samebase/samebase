export const APP_BUILD_STATUS_BAR_TEST_ID = "app-build-status-bar";
export const APP_BUILD_VERSION_TEST_ID = "app-build-version";

const UNKNOWN_APP_BUILD_VERSION_LABEL = "v ?";

/**
 * The header exposes the current build as a simple, one-based repo version so
 * users can speak about builds without needing to trade raw SHAs.
 */
export function formatAppBuildVersionLabel(
  commitNumber: number | null,
): string {
  if (
    commitNumber === null ||
    !Number.isSafeInteger(commitNumber) ||
    commitNumber < 1
  ) {
    return UNKNOWN_APP_BUILD_VERSION_LABEL;
  }

  return `v ${commitNumber}`;
}
