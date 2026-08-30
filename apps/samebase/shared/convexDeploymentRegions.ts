export const CONVEX_US_EAST_REGION = "aws-us-east-1";
export const CONVEX_EU_WEST_REGION = "aws-eu-west-1";

export type ConvexDeploymentRegion = typeof CONVEX_US_EAST_REGION | typeof CONVEX_EU_WEST_REGION;

export function formatConvexDeploymentRegion(region: ConvexDeploymentRegion): string {
  switch (region) {
    case CONVEX_US_EAST_REGION:
      return "US East (N. Virginia)";
    case CONVEX_EU_WEST_REGION:
      return "EU West (Ireland)";
    default:
      region satisfies never;
      throw new Error("Unknown Convex deployment region.");
  }
}

export function compareConvexDeploymentRegions(
  left: ConvexDeploymentRegion,
  right: ConvexDeploymentRegion,
): number {
  if (left === right) {
    return 0;
  }
  return left === CONVEX_US_EAST_REGION ? -1 : 1;
}

export function parseConvexDeploymentRegion(value: string): ConvexDeploymentRegion | null {
  switch (value) {
    case CONVEX_US_EAST_REGION:
    case CONVEX_EU_WEST_REGION:
      return value;
    default:
      return null;
  }
}
