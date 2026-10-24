export const CONVEX_US_EAST_REGION = "aws-us-east-1";
export const CONVEX_EU_WEST_REGION = "aws-eu-west-1";
export const CONVEX_CANADA_CENTRAL_REGION = "aws-ca-central-1";
export const CONVEX_AUSTRALIA_SOUTHEAST_REGION = "aws-ap-southeast-2";

export type ConvexDeploymentRegion =
  | typeof CONVEX_US_EAST_REGION
  | typeof CONVEX_EU_WEST_REGION
  | typeof CONVEX_CANADA_CENTRAL_REGION
  | typeof CONVEX_AUSTRALIA_SOUTHEAST_REGION;

export const convexDeploymentRegionDetails = {
  [CONVEX_US_EAST_REGION]: { displayName: "US East (N. Virginia)", icon: "🇺🇸" },
  [CONVEX_EU_WEST_REGION]: { displayName: "EU West (Ireland)", icon: "🇪🇺" },
  [CONVEX_CANADA_CENTRAL_REGION]: { displayName: "Canada Central (Montreal)", icon: "🇨🇦" },
  [CONVEX_AUSTRALIA_SOUTHEAST_REGION]: {
    displayName: "Australia Southeast (Sydney)",
    icon: "🇦🇺",
  },
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
  switch (value) {
    case CONVEX_US_EAST_REGION:
    case CONVEX_EU_WEST_REGION:
    case CONVEX_CANADA_CENTRAL_REGION:
    case CONVEX_AUSTRALIA_SOUTHEAST_REGION:
      return value;
    default:
      return null;
  }
}
