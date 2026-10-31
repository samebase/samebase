import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vSetupOutputApplyResult } from "../setupOutputModel";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id, number } = v;

export const applySetupOutputContract = {
  id: "apply_setup_output",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    artifactId: number(),
  },
  mcpArgs: { ...mcpRepositoryArgs, artifactId: number() },
  returns: vSetupOutputApplyResult,
  structuredContent: vSetupOutputApplyResult,
  mcp: {
    title: "Apply setup output",
    name: "repository_setupOutput_apply",
    description:
      "For a repository whose setup stack publishes a samebase-setup-output artifact: apply the newest output, after the user reviewed its Workers and Convex projects. Samebase checks each one against Cloudflare and Convex again and attaches them to the repository. The result names the step and the claim that stopped it.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      artifactId:
        "The GitHub artifact id of the samebase-setup-output artifact that the user reviewed. A newer output stops the apply.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `A repository's setup stack can publish a setup output after each deploy: the ids of the
Workers and the Convex projects that it owns. This action applies the newest one: it reads it from
the runs on the default branch, stops when its artifact is not \`artifactId\` (a newer run replaced
the one that the user reviewed), checks every claim with the
organization's Cloudflare and Convex connections (the account and the team are the repository's,
each Worker builds this repository through Workers Builds, each project exists in the team, each
Convex code location is on the default branch), and attaches the Workers and projects in one step.
An output older than the applied one is never applied.

A repository created with provisioning repository_actions does not need this action: Samebase reads
what it deployed from the team's Alchemy state store, and \`repository_getStatus\` shows no setup
output.

The attached resources are managed by the setup stack in \`alchemy.run.ts\`: Samebase never deletes
them or changes their provider settings. A destroy receipt, which the repository's confirmed destroy
uploads under the same artifact name, is recorded as a report; the attachments stay until they are
removed. A failed output reports a failed setup run and has nothing to apply (\`setup_failed\`).`,
} as const;
