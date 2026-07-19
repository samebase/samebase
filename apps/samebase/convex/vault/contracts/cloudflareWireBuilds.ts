import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id } = v;

export const cloudflareWireBuildsContract = {
  id: "wire_builds",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    workerId: id("vaultCloudflareWorkers"),
  },
  returns: v.null(),
  mcp: {
    title: "Wire Workers Builds",
    name: "vault_cloudflare_wireBuilds",
    description:
      "Connect the app's Cloudflare Worker to its GitHub repository through Workers Builds: production and preview triggers, so pushes deploy and pull requests get previews.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id containing the Worker.",
      workerId: "Stable Samebase Worker attachment id returned by get_user_vaults.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The repair for a Worker that exists but is not connected to its repository: creates the
Workers Builds production and preview triggers against the app's repo and root directory, with the
wrong-repo guard (a trigger belonging to a different repository is never adopted). This is the
explicit user action. Samebase reads the current Worker and repository state live, writes the
provider configuration, and stores no trigger or status mirror in Convex.`,
} as const;
