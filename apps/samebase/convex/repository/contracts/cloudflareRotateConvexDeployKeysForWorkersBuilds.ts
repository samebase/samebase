import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareRotateConvexDeployKeysForWorkersBuildsContract = {
  id: "rotate_convex_deploy_keys_for_workers_builds",
  access: "access_provider_connections",
  args: {
    repositoryId: id("repositories"),
    workerId: id("repositoryCloudflareWorkers"),
    convexProjectId: id("repositoryConvexProjects"),
  },
  returns: v.null(),
  mcp: {
    title: "Rotate Convex deploy keys for Workers Builds",
    name: "repository_cloudflare_rotateConvexDeployKeysForWorkersBuilds",
    description:
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Rotate Samebase-named production and preview Convex deploy keys, write each as CONVEX_DEPLOY_KEY in its Workers Builds settings, update existing previews, write SAMEBASE_CONVEX_PROJECT in production, then start a production build.",
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
      convexProjectId: "Attached Convex project selected for this deploy-key rotation.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Mints production and preview deploy keys on the selected Convex project. It writes the
production key as \`CONVEX_DEPLOY_KEY\` in production Builds settings and the Preview key as
\`CONVEX_DEPLOY_KEY\` in Previews Base Builds settings and all existing previews. The non-secret
\`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>\` marker belongs only in
production. It reads the settings back and verifies the marker and secrecy flags before starting
the production build. The Worker must already use native Worker Previews.

The Worker and project must both be attached to the repository. Their selection is input to this one
operation, not a persisted dependency. Rerunning the operation rotates the Samebase-named keys.
Samebase reads Convex live and stores no completed Worker-to-project, key, or trigger mirror in
Convex.`,
} as const;
