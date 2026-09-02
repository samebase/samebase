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
      "Call get_user_repositories first and use its returned repositoryId. Rotate Samebase-named production and preview Convex deploy keys, write them with the readable SAMEBASE_CONVEX_PROJECT marker to both Workers Builds triggers, then start a production build.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: true,
    },
    inputDescriptions: {
      repositoryId: "Samebase repository ID returned by get_user_repositories.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_repositories.",
      convexProjectId: "Attached Convex project selected for this deploy-key rotation.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys on the selected Convex project's production and preview scopes. It writes
\`CONVEX_DEPLOY_KEY\`, \`PREVIEW_CONVEX_DEPLOY_KEY\`, and the non-secret
\`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>\` marker to both Workers
Builds triggers, reads the
variables back, and verifies the marker value, secrecy flags, and required variable names before
starting the production build.

Cloudflare currently shows one shared build-variable table. Both triggers intentionally carry both
deploy keys so the production and preview keys stay visible in that UI. Keep this shared layout
until Cloudflare exposes separate production and preview build-variable views.

The Worker and project must both be attached to the repository. Their selection is input to this one
operation, not a persisted dependency. Rerunning the operation rotates the Samebase-named keys.
Samebase reads Convex live and stores no completed Worker-to-project, key, or trigger mirror in
Convex.`,
} as const;
