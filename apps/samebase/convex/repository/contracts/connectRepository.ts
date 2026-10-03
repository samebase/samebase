import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, object, string } = v;

const vConnectRepositoryResult = object({
  repositoryId: id("repositories"),
  runId: id("workflow_repositoryProvisioning_runs"),
  githubRepositoryFullName: string(),
});

const connectRepositoryFields = {
  githubRepositoryDatabaseId: string(),
};

export const connectRepositoryContract = {
  id: "connect_repository",
  access: "access_repo_connect",
  args: {
    organizationId: id("organizations"),
    ...connectRepositoryFields,
  },
  mcpArgs: {
    githubOwnerLogin: string(),
    ...connectRepositoryFields,
  },
  returns: vConnectRepositoryResult,
  structuredContent: object({
    repositoryId: id("repositories"),
    githubRepositoryFullName: string(),
  }),
  mcp: {
    title: "Connect GitHub repository",
    name: "repository_connect",
    description:
      "Call repository_list first to avoid a duplicate connection. Connect a GitHub repository by its githubRepositoryDatabaseId as a Samebase repository, then sync its repository tree. Convex and Cloudflare stay unconfigured until explicitly attached.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubOwnerLogin:
        "GitHub owner login for the Samebase organization that will hold the repository.",
      githubRepositoryDatabaseId:
        "GitHub repository database ID to connect. This is not a Samebase repository ID.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Brings a repository that the selected organization's GitHub App installation can read into
Samebase: creates the repository,
syncs the tree, and leaves the providers deliberately unconfigured. Importing never touches
Convex or Cloudflare. This is the adoption entry point for existing projects; discover and attach
provider resources afterwards with the repository-level Convex and Cloudflare actions, or leave the
repository GitHub-only (watching and editing a repository is a supported use on its own).

Preconditions: organization membership and installation read access to the repository. Nothing is created
on any provider; the only writes are Samebase's own record and the tree sync. Progress and failure
are readable through \`repository_list\` (\`sourceSetup\` running/failed with step and message).`,
} as const;
