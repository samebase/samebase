import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const convexConnectExistingProjectContract = {
  id: "connect_convex_deployment",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appId: id("vaultApps"),
    projectId: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Connect Convex deployment",
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
      appId: "Stable Samebase app id that will own the Convex deployment.",
      projectId: "Convex project id from list_convex_projects.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The manual Convex attach: binds an existing Convex project (from
\`list_convex_projects\`) to the app's record and starts the connection run. This is also the
remedy \`get_user_vaults\` names as \`nextAction: "connect_convex_deployment"\` after a failed
manual Convex attach. Rerunning it with a valid target is the repair.

Writes Samebase's deployment record and reads the project from Convex; it does not modify the
project itself. Progress and failure are readable through \`get_user_vaults\`
(\`providerSetup\` with step, message, and \`nextAction\`).`,
} as const;
