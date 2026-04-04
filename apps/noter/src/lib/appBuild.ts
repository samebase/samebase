export const APP_BUILD_STATUS_BAR_TEST_ID = "app-build-status-bar";
export const APP_BUILD_VERSION_TEST_ID = "app-build-version";
export const APP_BUILD_VERSION_PREFIX = "v";

const UNKNOWN_APP_BUILD_VERSION_NUMBER = "?";

type AppBuildCopyPayload = {
  buildVersionCopyLabel: string;
  commitUrl: string;
};

type ClipboardDataWriter = Pick<DataTransfer, "setData">;

function isValidAppBuildCommitNumber(
  commitNumber: number | null,
): commitNumber is number {
  if (
    commitNumber === null ||
    !Number.isSafeInteger(commitNumber) ||
    commitNumber < 1
  ) {
    return false;
  }

  return true;
}

/**
 * Keep the clickable part to the bare number so selecting it in the header
 * does not need to fight an extra prefix character.
 */
export function formatAppBuildVersionNumber(
  commitNumber: number | null,
): string {
  return isValidAppBuildCommitNumber(commitNumber)
    ? String(commitNumber)
    : UNKNOWN_APP_BUILD_VERSION_NUMBER;
}

/**
 * The header exposes the current build as a simple, one-based repo version so
 * users can speak about builds without needing to trade raw SHAs.
 */
export function formatAppBuildVersionLabel(
  commitNumber: number | null,
): string {
  return `${APP_BUILD_VERSION_PREFIX}${formatAppBuildVersionNumber(
    commitNumber,
  )}`;
}

export function formatAppBuildMarkdownLink({
  buildVersionCopyLabel,
  commitUrl,
}: AppBuildCopyPayload): string {
  if (!commitUrl) {
    return buildVersionCopyLabel;
  }

  return `[${buildVersionCopyLabel}](${commitUrl})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function selectionIncludesNode(node: Node, selection: Selection): boolean {
  for (let rangeIndex = 0; rangeIndex < selection.rangeCount; rangeIndex += 1) {
    const range = selection.getRangeAt(rangeIndex);
    if (typeof range.intersectsNode === "function") {
      if (range.intersectsNode(node)) {
        return true;
      }
    } else if (
      typeof selection.containsNode === "function" &&
      selection.containsNode(node, true)
    ) {
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

export function writeAppBuildClipboardData(
  clipboardData: ClipboardDataWriter,
  payload: AppBuildCopyPayload,
): string {
  const markdownLink = formatAppBuildMarkdownLink(payload);
  clipboardData.setData("text/plain", markdownLink);

  if (!payload.commitUrl) {
    return markdownLink;
  }

  clipboardData.setData("text/markdown", markdownLink);
  clipboardData.setData(
    "text/html",
    `<a href="${escapeHtml(payload.commitUrl)}">${escapeHtml(payload.buildVersionCopyLabel)}</a>`,
  );

  return markdownLink;
}

/**
 * Install a tiny document-level copy interceptor for the build label so the
 * clipboard receives Markdown without pulling in a richer editor runtime.
 */
export function installAppBuildMarkdownCopy(
  element: HTMLElement,
  payload: AppBuildCopyPayload,
): () => void {
  const handleCopy = (event: ClipboardEvent) => {
    if (!hasSelectedAppBuildVersion(element) || event.clipboardData === null) {
      return;
    }

    event.preventDefault();
    writeAppBuildClipboardData(event.clipboardData, payload);
  };

  document.addEventListener("copy", handleCopy);
  return () => {
    document.removeEventListener("copy", handleCopy);
  };
}
