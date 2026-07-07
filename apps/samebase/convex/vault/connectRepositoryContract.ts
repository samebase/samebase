import { v } from "convex/values";

import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { id, object, string } = v;

export const connectRepositoryContract = {
  id: "connect_existing_repository",
  access: "access_repo_connect",
  args: {
    repositoryFullName: string(),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  }),
  mcp: {
    name: "vault_actions_connectRepository",
    description:
      "Import an existing GitHub repository as a Samebase app. Creates the Samebase record and syncs the repository tree; Convex and Cloudflare stay unconfigured until explicitly attached.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      repositoryFullName: 'Full repository name to import, as "owner/name".',
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Brings a repository the caller's GitHub connection can read under Samebase's record
(access is what is checked — not ownership): creates the vault,
syncs the tree, and leaves the providers deliberately unconfigured — importing never touches
Convex or Cloudflare. This is the adoption entry point for existing projects; attach providers
afterwards with \`connect_convex_deployment\` and \`connect_cloudflare_worker\`, or leave the app
GitHub-only (watching and editing a repository is a supported use on its own).

Preconditions: a GitHub provider connection, and read access to the repository. Nothing is created
on any provider; the only writes are Samebase's own record and the tree sync. Progress and failure
are readable through \`get_user_vaults\` (\`sourceSetup\` running/failed with step and message).`,
} as const;
