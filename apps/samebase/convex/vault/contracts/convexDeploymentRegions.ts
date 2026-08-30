import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";

const { array, boolean, id, object, string, union } = v;

export const vConvexDeploymentRegionOption = object({
  name: vConvexDeploymentRegion,
  displayName: string(),
  available: boolean(),
});

const vConvexDeploymentRegionsResult = object({
  defaultRegion: union(vConvexDeploymentRegion, v.null()),
  regions: array(vConvexDeploymentRegionOption),
});

export const convexListDeploymentRegionsContract = {
  id: "list_convex_deployment_regions",
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  mcpArgs: {
    githubOwnerLogin: string(),
  },
  returns: vConvexDeploymentRegionsResult,
  structuredContent: vConvexDeploymentRegionsResult,
  mcp: {
    title: "List Convex deployment regions",
    name: "convex_listDeploymentRegions",
    description:
      "List the production deployment regions currently available to an organization's connected Convex team and its saved default.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubOwnerLogin: "GitHub owner login for the Samebase organization.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Lists the production deployment regions currently available to the selected organization's
connected Convex team. The result also returns the organization's saved default, or null when no
default is saved. Availability is live Convex data. The saved default only starts a new project
form. Selecting another region for one project does not change it. This action does not modify
Samebase or Convex.`,
} as const;
