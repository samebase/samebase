import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { boolean, id, object, optional, string } = v;

const vCreateRepositoryResult = object({
  vaultId: id("vaults"),
  runId: id("workflow_vaultProvisioning_runs"),
});

export const createRepositoryContract = {
  id: "create_repository",
  access: ACCESS_APP_CREATE,
  args: {
    name: string(),
    owner: string(),
    convexProjectName: string(),
    cloudflareWorkerName: string(),
    description: optional(string()),
    private: optional(boolean()),
  },
  returns: vCreateRepositoryResult,
  structuredContent: vCreateRepositoryResult,
  mcp: {
    title: "Create Samebase app",
    name: "vault_actions_createRepository",
    description:
      "Create a new Samebase app by starting the managed app provisioning workflow: create the GitHub repository, seed the starter app, provision Convex, and provision Cloudflare.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      name: "Name for the new app and GitHub repository.",
      owner: "GitHub user or organization where Samebase should create the app repository.",
      convexProjectName: "Convex project name to provision for the app.",
      cloudflareWorkerName: "Cloudflare Worker name to provision for the app.",
      description: "Optional GitHub repository description.",
      private: "Whether to create a private GitHub repository. Defaults to true.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates a complete Samebase app in one action: a GitHub repository under the caller's
connected owner, seeded with the starter template, a Convex project and dev/prod deployments, a
Cloudflare Worker, Workers Builds configured for the repository (push to the default branch deploys,
pull requests get preview deploys), and Convex deploy keys placed into the build triggers.

Preconditions: the account must have GitHub, Convex, and Cloudflare provider connections; the
target names must be available on each provider. A name collision fails the call immediately before
any vault or run is created, so pick different names and call again; failures after
provisioning starts surface through \`get_user_vaults\` instead.

What it writes: one repository (private by default), one Convex project, one Worker, and two
Workers Builds triggers that each carry \`CONVEX_DEPLOY_KEY\` and
\`PREVIEW_CONVEX_DEPLOY_KEY\` variables. All resources live in the caller's own provider accounts.
Deleting the Samebase account does not remove or stop any of them.

Progress and failure are readable through \`get_user_vaults\`: while running, \`providerSetup\`
carries the current step; on failure it carries the failed step and a message. Repair it with
\`retry_infrastructure_provisioning\`. Cost: the created resources run on the providers' free
tiers; an idle app costs $0/month.`,
} as const;

const createRepositoryArgsValidator = object(createRepositoryContract.args);

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
