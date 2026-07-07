import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareWireBuildsContract = {
  id: "wire_builds",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: v.null(),
  mcp: {
    name: "vault_cloudflare_wireBuilds",
    description:
      "Connect the app's Cloudflare Worker to its GitHub repository through Workers Builds: production and preview triggers, so pushes deploy and pull requests get previews.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app whose Worker needs Builds wiring.",
      appRoot: 'App root within the repository ("." for single-app repositories).',
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for a Worker that exists but is not connected to its repository: creates the
Workers Builds production and preview triggers against the app's repo and root directory, with the
wrong-repo guard (a trigger belonging to a different repository is never adopted). This is the
remedy behind \`nextAction: "wire_builds"\` on the Worker's \`githubRepositoryConnection\` axis and
the dashboard's "Connect GitHub repo" button — the same operation.

Writes Workers Builds triggers on the caller's Cloudflare account. Follow with
\`wire_convex_build_access\` if deploy keys are still missing afterwards.`,
} as const;
