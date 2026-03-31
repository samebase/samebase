let pendingPublicLandingScrollTop: number | null = null;

/**
 * Keep the latest fast-shell scroll offset so the hydrated landing route can
 * reuse it instead of jumping small-screen users back to the top.
 */
export function setPendingPublicLandingScrollTop(scrollTop: number) {
  pendingPublicLandingScrollTop = scrollTop;
}

/**
 * The pre-hydration shell only hands its scroll position to one hydrated route
 * mount, so the pending value is consumed exactly once.
 */
export function consumePendingPublicLandingScrollTop() {
  const nextScrollTop = pendingPublicLandingScrollTop;
  pendingPublicLandingScrollTop = null;
  return nextScrollTop;
}
