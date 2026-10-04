import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, object, string } = v;

const vConnectRepositoryResult = object({
  repositoryId: id("repositories"),
  runId: id("workflow_repositoryProvisioning_runs"),
  githubRepositoryFullName: string(),
});

export const connectRepositoryContract = {
  id: "connect_repository",
  access: "access_repo_connect",
  args: {
    organizationId: id("organizations"),
    githubRepositoryDatabaseId: string(),
  },
  mcpArgs: {
    githubRepositoryFullName: string(),
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
      "Connect an existing GitHub repository to Samebase as a Samebase repository, then sync its repository tree. Convex and Cloudflare stay unchanged until resources are attached, connected, or created.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      githubRepositoryFullName:
        "GitHub repository as owner/name. The owner must be a GitHub owner of one of the account's Samebase organizations.",
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Brings a repository that the organization's GitHub App installation can read into Samebase:
creates the Samebase repository, syncs the tree, and leaves the providers deliberately unconfigured.
The GitHub owner in githubRepositoryFullName selects the organization. Connecting never touches
Convex or Cloudflare. This is the adoption entry point for existing projects; find and attach
provider resources afterwards with the repository-level Convex and Cloudflare actions, or leave the
repository GitHub-only (watching and editing a repository is a supported use on its own).

Preconditions: organization membership and installation read access to the repository. Nothing is
created on any provider; the only writes are Samebase's own record and the tree sync. Progress and
failure are readable through \`repository_list\` (\`sourceSetup\` running or failed with a message).`,
} as const;
