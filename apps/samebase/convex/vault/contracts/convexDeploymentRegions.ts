import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";

const { array, boolean, id, object, string } = v;

export const vConvexDeploymentRegionOption = object({
  name: vConvexDeploymentRegion,
  displayName: string(),
  available: boolean(),
});

const vConvexDeploymentRegionsResult = object({
  defaultRegion: vConvexDeploymentRegion,
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
      "List the production deployment regions currently available to an organization's connected Convex team and the default for new projects.",
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
connected Convex team. The result also returns the organization's default for new projects. It is
US East when the organization has no saved value. Availability is live Convex data. Selecting
another region for one project does not change the organization default. This action does not
modify Samebase or Convex.`,
} as const;
