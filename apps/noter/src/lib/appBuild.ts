import { guard } from "@noter-md/dependent";

export const APP_BUILD_STATUS_BAR_TEST_ID = "app-build-status-bar";
export const APP_BUILD_VERSION_TEST_ID = "app-build-version";
export const APP_BUILD_COMMIT_LINK_TEST_ID = "app-build-commit-link";
export const APP_BUILD_VERSION_PREFIX = "v";

const UNKNOWN_APP_BUILD_VERSION_NUMBER = "?";
const SHORT_APP_BUILD_COMMIT_LENGTH = 8;

const isValidAppBuildCommitNumber = guard((commitNumber: number | null): number | null => {
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

/**
 * Show the same short commit SHA that GitHub surfaces in UI so mobile users can
 * identify the exact build without opening the commit page first.
 */
export function formatAppBuildCommitLabel(appCommit: string): string {
  return /^[0-9a-f]{8,40}$/i.test(appCommit)
    ? appCommit.slice(0, SHORT_APP_BUILD_COMMIT_LENGTH)
    : appCommit;
}

function selectionIncludesNode(node: Node, selection: Selection): boolean {
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    if (typeof range.intersectsNode === "function") {
      if (range.intersectsNode(node)) {
        return true;
      }
    } else if (typeof selection.containsNode === "function" && selection.containsNode(node, true)) {
      return true;
    }

    const commonAncestor = range.commonAncestorContainer;
    if (commonAncestor === node || node.contains(commonAncestor)) {
      return true;
    }
  }

  return false;
}

/**
 * Treat any active selection that touches the build label as intent to copy
 * the build reference, even when the user drags slightly wider than the link.
 */
export function hasSelectedAppBuildVersion(node: Node): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed) {
    return false;
  }

  return selectionIncludesNode(node, selection);
}
