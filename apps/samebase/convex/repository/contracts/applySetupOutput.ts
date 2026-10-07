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
      "For a repository that its GitHub Actions set up: apply the setup output that repository_getStatus shows as waiting (setupStack.pending), after the user reviewed its Workers and Convex projects. Samebase checks each one against Cloudflare and Convex again and attaches them to the repository. The result names the step and the claim that stopped it.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
      artifactId:
        "setupStack.pending.source.artifactId from repository_getStatus: the setup output that the user reviewed. A newer output stops the apply.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `For a repository that its GitHub Actions set up (\`repository_create\` with provisioning
repository_actions), the repository's alchemy workflow publishes a setup output after each deploy:
the ids of the Workers and the Convex projects that its setup stack owns. \`repository_getStatus\`
shows the newest one that waits (\`setupStack.pending\`). This action applies it: it reads the newest
one again from the runs of that workflow on the default branch, stops when its artifact is not
\`artifactId\` (a newer run replaced the one that the user reviewed), checks every claim with the
organization's Cloudflare and Convex connections (the account and the team are the repository's,
each Worker builds this repository through Workers Builds, each project exists in the team, each
Convex code location is on the default branch), and attaches the Workers and projects in one step.
An output older than the applied one is never applied.

Samebase applies the first output after the app's creation by itself when it names exactly the
Worker and the Convex project that Samebase reserved at creation, no other project of the team has
that name, and both were created after the app. Anything else, such as a second Worker, an adopted
resource, a later output, or a Worker that a drift repair recreated, waits for this action. \`repository_getStatus\` shows the waiting output and why Samebase
did not apply it by itself.

The attached resources are managed by the setup stack in \`alchemy.run.ts\`: Samebase never deletes
them or changes their provider settings. A destroy receipt, which the repository's \`Destroy app\`
workflow uploads under the same artifact name after it destroyed the app, is recorded as a report;
the attachments stay until they are removed.`,
} as const;
