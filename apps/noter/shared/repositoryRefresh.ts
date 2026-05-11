// One dashboard event can imply many vault refresh demands, but ingest still
// runs as one Convex transaction. Keep the vault set bounded until Workpool owns
// fan-out.
export const MAX_DASHBOARD_REFRESH_DEMAND_VAULTS = 50;
