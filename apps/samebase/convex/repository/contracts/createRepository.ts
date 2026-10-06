import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";
import { vConvexDeploymentRegion } from "../../convexDeploymentRegionModel";
import { vRepositoryProvisioningMode } from "../provisioningModel";

const { boolean, id, literal, object, optional, string, union } = v;

const vCreateRepositoryResult = object({
  repositoryId: id("repositories"),
  runId: id("workflow_repositoryProvisioning_runs"),
});

export const createRepositoryContract = {
  id: "create_repository",
  access: ACCESS_APP_CREATE,
  args: {
    organizationId: id("organizations"),
    githubRepositoryName: string(),
    convexProjectName: string(),
    convexDeploymentRegion: optional(vConvexDeploymentRegion),
    cloudflareWorkerName: string(),
    cloudflareBuildTokenUuid: union(string(), v.null()),
    description: optional(string()),
    private: optional(boolean()),
    provisioning: optional(vRepositoryProvisioningMode),
  },
  mcpArgs: {
    githubOwnerLogin: string(),
    name: string(),
    convexDeploymentRegion: optional(vConvexDeploymentRegion),
    buildTokenUuid: optional(string()),
    convexProjectName: optional(string()),
    cloudflareWorkerName: optional(string()),
    description: optional(string()),
    private: optional(boolean()),
    provisioning: optional(vRepositoryProvisioningMode),
  },
  returns: vCreateRepositoryResult,
  structuredContent: object({
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
    cloudflare: union(
      object({ state: literal("planned"), workerName: string() }),
      object({ state: literal("pending"), setupGuideUrl: string() }),
    ),
  }),
  mcp: {
    title: "Create Samebase repository",
    name: "repository_create",
    description:
      "Create a GitHub repository with the Samebase starter, its Samebase repository, and its first app: one Convex project and, when the Cloudflare account has a Workers Builds token, one Cloudflare Worker. Setup keeps running after the call returns; read repository_list for progress. Ready setup does not prove that the app is live.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubOwnerLogin:
        "GitHub user or organization login that will own the new repository. Ask the user when it is unclear.",
      name: "Name for the new GitHub repository.",
      convexDeploymentRegion:
        "Optional production region: aws-us-east-1, aws-eu-west-1, aws-ca-central-1, or aws-ap-southeast-2. Omit it to use the organization default, which is US East when no default is saved. Before you pass aws-eu-west-1, tell the user: EU usage costs 1.3 times US usage, and included usage for Starter and Professional plans does not apply to EU deployments (https://www.convex.dev/pricing).",
      buildTokenUuid:
        "Optional Workers Builds token UUID. Omit it: Samebase uses the last-used token, else the only token, and lists the tokens when it needs the user's choice.",
      convexProjectName: "Optional Convex project name. Defaults to the repository name.",
      cloudflareWorkerName: "Optional Cloudflare Worker name. Defaults to the repository name.",
      description: "Optional GitHub repository description.",
      private: "Whether to create a private GitHub repository. Defaults to true.",
      provisioning:
        "Optional, experimental. samebase (the default): Samebase creates the Convex project and the Worker. repository_actions: the repository's GitHub Actions create and deploy both. Use it only when the user asks for it.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates a GitHub repository under the selected organization's verified GitHub owner, seeds the
starter template, records the Samebase repository, and starts managed setup of its first app. Setup
always creates a Convex project with one production deployment. It uses convexDeploymentRegion when
supplied. Otherwise, it uses the organization default, which is US East when no default is saved.

Samebase picks the Workers Builds token: the given buildTokenUuid, else the available last-used
token, else the only token. Several tokens and no last-used one return an error that lists their
names and UUIDs. With a token, setup also creates a Cloudflare Worker and configures Workers Builds
for the repository (pushes to the default branch deploy, and pull requests get preview deploys) with
Convex deploy keys in production and Previews Base Builds settings. The result reports
cloudflare.state planned with the Worker name.

When the Cloudflare account has no token, setup creates no Worker and stops after GitHub and Convex
are ready. The result reports cloudflare.state pending with the setup guide,
https://samebase.com/docs/cloudflare-setup: use Cloudflare's standard repository setup to create the
first account token, delete the temporary Worker, then call repository_cloudflare_createWorker for
this repository.

Preconditions: the caller must be an organization member. Its GitHub App installation and selected
Convex and Cloudflare provider connections must be available. The GitHub repository and Convex
project names must be available, and the Worker name when a token is used. A name collision fails
the call before any repository or run is created, so pick a different name and call again; failures
after setup starts surface through \`repository_list\` instead.

What it writes: one repository (private by default) and one Convex project with one production
deployment in the resolved region. With a token, it also writes one Worker with native Worker
Previews. Production Builds and Previews Base Builds each carry \`CONVEX_DEPLOY_KEY\` with the
matching Convex key. All resources live in the organization's provider accounts. Deleting the
Samebase account does not remove or stop any of them.

Progress and failure are readable through \`repository_list\`: \`providerSetup.status\` is running,
ready, or failed; on failure it names the provider and carries a message. Repair a failure with
\`repository_retryProviderSetup\`. Without a token, \`providerSetup.status: ready\` means that the
requested GitHub and Convex work finished. It does not mean Cloudflare is complete. This expected
pending state is not a failure and must not be repaired with the retry action. Cost: the created
resources run on the providers' free tiers; an idle app costs $0/month.

provisioning (optional, experimental) chooses who sets up the app. samebase is the default and
everything above describes it. With repository_actions, the repository's own GitHub Actions
workflow creates and deploys the Convex project and the Worker; Samebase creates no provider
resource. Samebase creates the GitHub repository and mints a Convex team access token named
samebase/<owner>/<repository>, without expiry, through the organization's Convex OAuth connection.
It writes the Actions secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CONVEX_ACCESS_TOKEN
(the minted token, which Samebase does not store) and the Actions variable CONVEX_TEAM_ID, then
seeds the GitHub Actions variant of the starter on main, and that first push deploys. When GitHub
created the repository with another default branch, Samebase sets main as the default. The Convex
project and the Worker take the repository's name, so omit convexProjectName, cloudflareWorkerName,
buildTokenUuid, and convexDeploymentRegion. Before it creates anything, the call fails when the
organization has no saved Cloudflare CI token (the Providers page) or the token does not verify,
when the organization's Convex connection was not made with OAuth, when the Samebase GitHub App
installation has not granted the Secrets and Variables permissions, or when a Convex project or
Worker with the repository's name exists. A ready providerSetup then means that the secrets are
written and the starter is seeded, not that the app is deployed: the deployment runs in the
repository's GitHub Actions. Samebase's Worker and Convex project tools refuse such a repository,
because its GitHub Actions own those resources. Samebase never revokes what the repository needs to
keep working: removing the repository from Samebase, or deleting the Samebase account or
organization, leaves the minted Convex access token in the Convex team's access tokens for the user
to revoke.`,
} as const;

const createRepositoryArgsValidator = object(createRepositoryContract.args);

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
