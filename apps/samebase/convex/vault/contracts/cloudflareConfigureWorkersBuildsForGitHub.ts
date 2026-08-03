import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareConfigureWorkersBuildsForGitHubContract = {
  id: "configure_workers_builds_for_github",
  access: "access_provider_connections",
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
    rootDirectory: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Configure Workers Builds for GitHub",
    name: "vault_cloudflare_configureWorkersBuildsForGitHub",
    description:
      "Configure the selected Worker's production and preview Workers Builds triggers for the vault's GitHub repository, then start a production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id containing the Worker.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_vaults.",
      rootDirectory: "Repository root to write to this Worker's GitHub Builds triggers.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Configures the production and preview Workers Builds triggers for an attached Worker,
GitHub repository, and root directory, then starts a production build. A trigger belonging to a
different repository is never adopted. Samebase reads the current Worker and repository state
live, writes the provider configuration, and stores no trigger or status mirror in Convex.`,
} as const;
