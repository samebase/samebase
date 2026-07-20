import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareConfigureWorkersBuildsForGitHubContract = {
  id: "configure_workers_builds_for_github",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: v.null(),
  mcp: {
    title: "Configure Workers Builds for GitHub",
    name: "vault_cloudflare_configureWorkersBuildsForGitHub",
    description:
      "Configure the app's production and preview Workers Builds triggers for its GitHub repository, so pushes deploy and pull requests get previews.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id containing the Worker.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_vaults.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Configures the production and preview Workers Builds triggers for an attached Worker,
GitHub repository, and root directory. A trigger belonging to a different repository is never
adopted. Samebase reads the current Worker and repository state live, writes the provider
configuration, and stores no trigger or status mirror in Convex.`,
} as const;
