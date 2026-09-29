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
      "Call repository_dashboard_getUserRepositories first and use its returned repositoryId. Requires a verified empty Worker preview list. Rotate Samebase-named production and preview Convex deploy keys, write each value as CONVEX_DEPLOY_KEY in Production and Previews Base build settings, respectively, and start a production build.",
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
  doc: `The repair for builds that cannot deploy the backend: mints production and preview deploy
keys on the selected Convex project's production and preview scopes. It writes the production key
as \`CONVEX_DEPLOY_KEY\` in Production build settings and the project Preview key under
the same name in Previews Base build settings through the worker-level Builds API. It writes the
non-secret
\`SAMEBASE_CONVEX_PROJECT=version=1&teamId=<teamId>&projectId=<projectId>\` marker only to the
Production build settings.

Before it deletes or creates a Convex deploy key, the operation requires a verified empty Worker
preview list. Existing previews or an unavailable preview list block rotation because
preview-specific Convex projects and secret key overrides cannot yet be verified safely. It checks
the list again before it writes build settings and does not apply those changes to existing previews.

The operation reads the variables back and verifies the production marker value, secrecy flags, and
canonical key name before it starts the production build. The preview key belongs under
**Builds > Previews Base**, not under **Runtime variables and secrets**.

The Worker and project must both be attached to the repository. Their selection is input to this one
operation, not a persisted dependency. Rerunning the operation rotates the Samebase-named keys.
Samebase reads Convex live and stores no completed Worker-to-project, key, or trigger mirror in
Convex.`,
} as const;
