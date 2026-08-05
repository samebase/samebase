import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, object, string } = v;

const vConnectRepositoryResult = object({
  vaultId: id("vaults"),
  runId: id("workflow_vaultProvisioning_runs"),
});

const connectRepositoryFields = {
  repositoryFullName: string(),
};

export const connectRepositoryContract = {
  id: "connect_existing_repository",
  access: "access_repo_connect",
  args: {
    organizationId: id("organizations"),
    ...connectRepositoryFields,
  },
  mcpArgs: connectRepositoryFields,
  returns: vConnectRepositoryResult,
  structuredContent: vConnectRepositoryResult,
  mcp: {
    title: "Connect existing repository",
    name: "vault_actions_connectRepository",
    description:
      "Connect an existing GitHub repository as a Samebase vault and sync its repository tree; Convex and Cloudflare stay unconfigured until explicitly attached.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryFullName: 'Full repository name to import, as "owner/name".',
    },
  } as const satisfies AppFunctionMcpMetadata,
  doc: `Brings a repository that the selected organization's GitHub App installation can read into
Samebase: creates the vault,
syncs the tree, and leaves the providers deliberately unconfigured. Importing never touches
Convex or Cloudflare. This is the adoption entry point for existing projects; discover and attach
provider resources afterwards with the vault-level Convex and Cloudflare actions, or leave the
vault GitHub-only (watching and editing a repository is a supported use on its own).

Preconditions: organization membership and installation read access to the repository. Nothing is created
on any provider; the only writes are Samebase's own record and the tree sync. Progress and failure
are readable through \`get_user_vaults\` (\`sourceSetup\` running/failed with step and message).`,
} as const;
