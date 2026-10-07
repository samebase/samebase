import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vSetupOutputApplyResult } from "../setupOutputModel";
import { MCP_REPOSITORY_INPUT_DESCRIPTION, mcpRepositoryArgs } from "./repositoryReference";

const { id } = v;

export const applySetupOutputContract = {
  id: "apply_setup_output",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
  },
  mcpArgs: mcpRepositoryArgs,
  returns: vSetupOutputApplyResult,
  structuredContent: vSetupOutputApplyResult,
  mcp: {
    title: "Apply setup output",
    name: "repository_setupOutput_apply",
    description:
      "For a repository that its GitHub Actions set up: read the newest setup output that its alchemy workflow published, check every Worker and Convex project in it against Cloudflare and Convex, and attach them to the repository in Samebase. The result names the step and the claim that stopped it.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repository: MCP_REPOSITORY_INPUT_DESCRIPTION,
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `For a repository that its GitHub Actions set up (\`repository_create\` with provisioning
repository_actions), the repository's alchemy workflow publishes a setup output after each deploy:
the ids of the Workers and the Convex projects that its setup stack owns. This action reads the
newest one from the runs of that workflow on the default branch, checks every claim with the
organization's Cloudflare and Convex connections (the account and the team are the repository's,
each Worker builds this repository through Workers Builds, each project exists in the team, each
Convex code location is on the default branch), and attaches the Workers and projects in one step.
An output older than the applied one is never applied.

Samebase applies the first output after the app's creation by itself when it names exactly the
Worker and the Convex project that Samebase reserved at creation, both created after the app.
Anything else, such as a second Worker, an adopted resource, or a Worker that a drift repair
recreated, waits for this action. \`repository_getStatus\` shows the waiting output and why Samebase
did not apply it by itself.

The attached resources are managed by the setup stack in \`alchemy.run.ts\`: Samebase never deletes
them or changes their provider settings. A destroy receipt from the confirmed destroy of the app is
recorded as a report; the attachments stay until they are removed.`,
} as const;
