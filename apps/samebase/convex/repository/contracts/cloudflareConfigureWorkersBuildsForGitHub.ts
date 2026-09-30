import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareConfigureWorkersBuildsForGitHubContract = {
  id: "configure_workers_builds_for_github",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    rootDirectory: string(),
    buildTokenUuid: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Configure Workers Builds for GitHub",
    name: "repository_cloudflare_configureWorkersBuildsForGitHub",
    description:
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Configure the selected Worker's production and Previews Base Builds settings for the Samebase repository's GitHub repository, then start a production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by repository_dashboard_getUserRepositories.",
      workerId:
        "Stable Samebase Worker attachment id returned by repository_dashboard_getUserRepositories.",
      rootDirectory: "Repository root to write to this Worker's GitHub Builds settings.",
      buildTokenUuid: "Workers Builds token UUID returned by cloudflare_listWorkersBuildTokens.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Configures production and Previews Base Builds settings for an attached Worker, GitHub
repository, and root directory, then starts a production build. New connections enable native
Worker Previews. Existing connections must already use native Worker Previews. A connection to a
different repository is never adopted. Samebase reads the current Worker and repository state live
and stores no build-settings or status mirror in Convex.`,
} as const;
