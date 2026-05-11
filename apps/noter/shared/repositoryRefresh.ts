/**
 * Maximum vaults converted from one dashboard freshness signal page.
 *
 * One dashboard event can imply many repository refresh demand rows. Phase 2
 * ingests them through bounded cursor pages so each Convex transaction stays
 * small while the frontend can continue until the backend says it is done.
 */
export const MAX_DASHBOARD_REFRESH_DEMAND_VAULTS = 50;
