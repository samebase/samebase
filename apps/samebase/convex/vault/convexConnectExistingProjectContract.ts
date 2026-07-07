import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const convexConnectExistingProjectContract = {
  id: "connect_convex_deployment",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    projectId: string(),
  },
  returns: v.null(),
  mcp: {
    name: "vault_convex_connectExistingProject",
    description:
      "Attach an existing Convex project to a Samebase app (manual attach): records the deployment and starts the connection run.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app to attach the Convex project to.",
      appRoot: 'App root within the repository ("." for single-app repositories).',
      projectId: "Convex project id from list_convex_projects.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The manual Convex attach: binds an existing Convex project (from
\`list_convex_projects\`) to the app's record and starts the connection run. This is also the
remedy \`get_user_vaults\` names as \`nextAction: "connect_convex_deployment"\` after a failed
manual Convex attach — rerunning it with a valid target is the repair.

Writes Samebase's deployment record and reads the project from Convex; it does not modify the
project itself. Progress and failure are readable through \`get_user_vaults\`
(\`providerSetup\` with step, message, and \`nextAction\`).`,
} as const;
