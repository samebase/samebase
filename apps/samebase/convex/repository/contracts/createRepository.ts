import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { boolean, id, object, optional, string } = v;

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
    description: optional(string()),
    private: optional(boolean()),
  },
  mcpArgs: {
    githubOwnerLogin: string(),
    name: string(),
    description: optional(string()),
    private: optional(boolean()),
  },
  returns: vCreateRepositoryResult,
  structuredContent: object({
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
  }),
  mcp: {
    title: "Create Samebase repository",
    name: "repository_create",
    description:
      "Create a GitHub repository with the Samebase starter and its Samebase repository. The repository's GitHub Actions then run Alchemy, create the Convex project, and deploy the app to Convex. Setup keeps running after the call returns; read repository_list for progress. Ready setup does not prove that the app is live.",
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
      description: "Optional GitHub repository description.",
      private: "Whether to create a private GitHub repository. Defaults to true.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Creates a GitHub repository under the selected organization's verified GitHub owner, records the
Samebase repository, and starts its setup. The repository's own GitHub Actions run Alchemy, create
the Convex project, and deploy the app to Convex. Samebase creates no provider resource, and
Cloudflare takes no part.

Samebase creates the GitHub repository and writes two values into it: the Actions secret
CONVEX_ACCESS_TOKEN, which holds the credential of the organization's Convex connection (its OAuth
token or its API key), and the Actions variable CONVEX_TEAM_ID. Then it seeds the starter on main,
and that first push deploys. When GitHub created the repository with another default branch,
Samebase makes main the default before it pushes the starter, so that first deployment runs as
production. The Convex project takes the repository's name.

Preconditions: the caller must be an organization owner, because the repository receives the
organization's Convex credential. Before it creates anything, the call fails when the organization
has no Convex connection, when the Samebase GitHub App installation has not granted the Secrets and
Variables permissions, or when the GitHub repository name or a Convex project with the repository's
name exists, so pick a different name and call again. Failures after setup starts surface through
\`repository_list\` instead.

What it writes: one repository (private by default), its Actions secret and variable, and the
starter commit on main. The Convex project and its deployments live in the organization's Convex
team. Deleting the Samebase account does not remove or stop any of them.

Progress and failure are readable through \`repository_list\`: \`providerSetup.status\` is running,
ready, or failed; on failure it names the provider and carries a message. Repair a failure with
\`repository_retryProviderSetup\`. A ready providerSetup means that the secret and the variable are
written and the starter is seeded, not that the app is deployed: the deployment runs in the
repository's GitHub Actions, and \`repository_getStatus\` reports setupStack.state done after it
finished. The repository's GitHub Actions own its provider resources, so repair a deployment there,
with Alchemy. Cost: the created resources run on the providers' free tiers; an
idle app costs $0/month.`,
} as const;

const createRepositoryArgsValidator = object(createRepositoryContract.args);

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
