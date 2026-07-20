import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const convexConnectExistingProjectContract = {
  id: "connect_convex_project",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appId: id("vaultApps"),
    projectId: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Connect Convex project",
    name: "vault_convex_connectExistingProject",
    description:
      "Attach an existing Convex project to a Samebase app without copying its deployments into Samebase.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app to attach the Convex project to.",
      appId: "Stable Samebase vault app id returned by get_user_vaults.",
      projectId: "Convex project id from list_convex_projects.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Attaches an existing Convex project from \`list_convex_projects\` to a stable vault app.
Samebase stores the project identity only. Production, development, and preview deployments remain
provider-owned children and are read from Convex when a relevant view opens.`,
} as const;
