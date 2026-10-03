import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id, optional, string } = v;

export const cloudflareConfigureWorkersBuildsForGitHubContract = {
  id: "configure_workers_builds",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    rootDirectory: string(),
    buildTokenUuid: string(),
  },
  mcpArgs: {
    ...mcpRepositoryArgs,
    workerName: string(),
    rootDirectory: optional(string()),
    buildTokenUuid: optional(string()),
  },
  returns: v.null(),
  mcp: {
    title: "Configure Workers Builds",
    name: "repository_cloudflare_configureBuilds",
    description:
      "Rewrite an attached Worker's production and Previews Base Workers Builds settings for this repository and the Worker's root directory, then start a production build. Use it when the Worker's Builds settings point elsewhere or are missing.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      workerName: "Name of the attached Worker.",
      rootDirectory:
        "Optional root directory. It must equal the Worker's recorded root directory, which is the default.",
      buildTokenUuid:
        "Optional Workers Builds token UUID. Omit it: Samebase uses the last-used token, else the only token, and lists the tokens when it needs the user's choice.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Configures production and Previews Base Builds settings for an attached Worker, GitHub
repository, and root directory, then starts a production build. It can overwrite the Worker's
existing Builds settings. New connections enable native Worker Previews. Existing connections must
already use native Worker Previews. A connection to a different repository is never adopted.
Samebase reads the current Worker and repository state live and stores no build-settings or status
mirror in Convex. It does not revoke or rotate Convex deploy keys.`,
} as const;
