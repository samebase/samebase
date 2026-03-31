let pendingPublicLandingScrollTop: number | null = null;

/**
 * Keep the latest fast-shell scroll offset so the hydrated landing route can
 * reuse it instead of jumping small-screen users back to the top.
 */
export function setPendingPublicLandingScrollTop(scrollTop: number) {
  pendingPublicLandingScrollTop = scrollTop;
}

/**
 * Read the pending fast-shell scroll offset without clearing it so a dev-only
 * StrictMode probe mount cannot discard the handoff before the real mount.
 */
export function readPendingPublicLandingScrollTop() {
  return pendingPublicLandingScrollTop;
}

/**
 * Clear the pending handoff only after the hydrated scroll shell has applied
 * it; the optional guard avoids wiping out a newer handoff value.
 */
export function clearPendingPublicLandingScrollTop(expectedScrollTop?: number) {
  if (
    expectedScrollTop !== undefined &&
    pendingPublicLandingScrollTop !== expectedScrollTop
  ) {
    return;
  }

  pendingPublicLandingScrollTop = null;
}
