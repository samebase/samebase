import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";

const { boolean, id, object, optional, string, union } = v;

const vCreateRepositoryResult = object({
  vaultId: id("vaults"),
  runId: id("workflow_vaultProvisioning_runs"),
});

const createRepositoryFields = {
  name: string(),
  convexProjectName: string(),
  convexDeploymentRegion: vConvexDeploymentRegion,
  cloudflareWorkerName: string(),
  cloudflareBuildTokenUuid: union(string(), v.null()),
  description: optional(string()),
  private: optional(boolean()),
};

export const createRepositoryContract = {
  id: "create_repository",
  access: ACCESS_APP_CREATE,
  args: {
    organizationId: id("organizations"),
    ...createRepositoryFields,
  },
  mcpArgs: {
    githubOwnerLogin: string(),
    ...createRepositoryFields,
  },
  returns: vCreateRepositoryResult,
  structuredContent: vCreateRepositoryResult,
  mcp: {
    title: "Create Samebase app",
    name: "vault_actions_createRepository",
    description:
      "Create a new Samebase app. A current Workers Builds token provisions GitHub, Convex, and Cloudflare; a confirmed empty token list provisions GitHub and Convex and leaves Cloudflare pending.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubOwnerLogin: "GitHub owner login that will own the new repository.",
      name: "Name for the new app and GitHub repository.",
      convexProjectName: "Convex project name to provision for the app.",
      convexDeploymentRegion:
        "Production deployment region returned by convex_listDeploymentRegions.",
      cloudflareWorkerName:
        "Cloudflare Worker name for automatic Cloudflare provisioning. This required field is ignored when cloudflareBuildTokenUuid is null.",
      cloudflareBuildTokenUuid:
        "Exact Workers Builds token UUID returned by cloudflare_listWorkersBuildTokens, or null only after that current list is confirmed empty.",
      description: "Optional GitHub repository description.",
      private: "Whether to create a private GitHub repository. Defaults to true.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates a Samebase app in one action. It always creates a GitHub repository under the
selected organization's verified GitHub owner, seeds the starter template, and creates a Convex
project with one production deployment in the required convexDeploymentRegion. When
cloudflareBuildTokenUuid is a current
token UUID, it also creates a Cloudflare Worker and configures Workers Builds for the repository
(pushes to the default branch deploy, and pull requests get preview deploys) with Convex deploy keys
in the build triggers.

Pass null only after cloudflare_listWorkersBuildTokens returns an empty current list. In that case,
the run creates no Cloudflare Worker and stops after GitHub and Convex are ready. Cloudflare setup is
still pending. Follow https://samebase.com/docs/cloudflare-setup: use Cloudflare's standard
repository setup to create the first account token, delete the temporary Worker, then use
vault_cloudflare_createWorker with a current token UUID to create and configure the real Worker.

Preconditions: the caller must be an organization member. Its GitHub App installation and selected
Convex and Cloudflare provider connections must be available. The
GitHub repository and Convex project names must be available. The Cloudflare Worker name must be
available only when a token UUID requests automatic Cloudflare provisioning. A required
cloudflareWorkerName is ignored when the token is null. A relevant name collision fails the call
immediately before any vault or run is created, so pick a different name and call again; failures
after provisioning starts surface through \`get_user_vaults\` instead.

What it writes: one repository (private by default) and one Convex project with one production
deployment in the selected region. When
\`cloudflareBuildTokenUuid\` is not null, it also writes one Worker and two Workers Builds triggers
that carry \`CONVEX_DEPLOY_KEY\` and \`PREVIEW_CONVEX_DEPLOY_KEY\` variables. All resources live in
the organization's provider accounts. Deleting the Samebase account does not remove or stop any of
them.

Progress and failure are readable through \`get_user_vaults\`: while running, \`providerSetup\`
carries the current step; on failure it carries the failed step and a message. Repair it with
\`retry_infrastructure_provisioning\`. When the token was null, \`providerSetup.status: ready\`
means that the requested GitHub and Convex work finished. It does not mean Cloudflare is complete.
This expected pending state is not a failure and must not be repaired with the retry action. Cost:
the created resources run on the providers' free tiers; an idle app costs $0/month.`,
} as const;

const createRepositoryArgsValidator = object(createRepositoryContract.args);

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
