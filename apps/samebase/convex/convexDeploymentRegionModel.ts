import { v } from "convex/values";

import { CONVEX_EU_WEST_REGION, CONVEX_US_EAST_REGION } from "../shared/convexDeploymentRegions";

export const vConvexDeploymentRegion = v.union(
  v.literal(CONVEX_US_EAST_REGION),
  v.literal(CONVEX_EU_WEST_REGION),
);
