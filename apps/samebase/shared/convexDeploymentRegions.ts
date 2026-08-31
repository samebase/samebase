export const CONVEX_US_EAST_REGION = "aws-us-east-1";
export const CONVEX_EU_WEST_REGION = "aws-eu-west-1";

export type ConvexDeploymentRegion = typeof CONVEX_US_EAST_REGION | typeof CONVEX_EU_WEST_REGION;

export const CONVEX_DEPLOYMENT_REGIONS: readonly ConvexDeploymentRegion[] = [
  CONVEX_US_EAST_REGION,
  CONVEX_EU_WEST_REGION,
];

const convexDeploymentRegionDetails = {
  [CONVEX_US_EAST_REGION]: { displayName: "US East (N. Virginia)", icon: "🇺🇸" },
  [CONVEX_EU_WEST_REGION]: { displayName: "EU West (Ireland)", icon: "🇪🇺" },
} satisfies Record<ConvexDeploymentRegion, { displayName: string; icon: string }>;

export function resolveDefaultConvexDeploymentRegion(
  savedDefault: ConvexDeploymentRegion | null | undefined,
): ConvexDeploymentRegion {
  return savedDefault ?? CONVEX_US_EAST_REGION;
}

export function formatConvexDeploymentRegionLabel(region: ConvexDeploymentRegion): string {
  const details = convexDeploymentRegionDetails[region];
  return `${details.icon} ${details.displayName}`;
}

export function parseConvexDeploymentRegion(value: string): ConvexDeploymentRegion | null {
  return value === CONVEX_US_EAST_REGION || value === CONVEX_EU_WEST_REGION ? value : null;
}
