import { v } from "convex/values";

import {
  CONVEX_AUSTRALIA_SOUTHEAST_REGION,
  CONVEX_CANADA_CENTRAL_REGION,
  CONVEX_EU_WEST_REGION,
  CONVEX_US_EAST_REGION,
} from "../shared/convexDeploymentRegions";

export const vConvexDeploymentRegion = v.union(
  v.literal(CONVEX_US_EAST_REGION),
  v.literal(CONVEX_EU_WEST_REGION),
);

export const vConvexProviderDeploymentRegion = v.union(
  v.literal(CONVEX_US_EAST_REGION),
  v.literal(CONVEX_EU_WEST_REGION),
  v.literal(CONVEX_CANADA_CENTRAL_REGION),
  v.literal(CONVEX_AUSTRALIA_SOUTHEAST_REGION),
);
