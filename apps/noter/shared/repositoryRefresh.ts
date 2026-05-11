/**
 * Maximum vaults converted from one dashboard freshness signal.
 *
 * One dashboard event can imply many repository refresh demand rows, but Phase 2
 * still ingests them in one Convex transaction. Keep this bounded until
 * Workpool owns fan-out.
 */
export const MAX_DASHBOARD_REFRESH_DEMAND_VAULTS = 50;
