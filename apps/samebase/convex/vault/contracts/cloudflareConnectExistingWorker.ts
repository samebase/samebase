import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareConnectExistingWorkerContract = {
  id: "connect_cloudflare_worker",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appId: id("vaultApps"),
    accountId: string(),
    workerName: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Connect Cloudflare Worker",
    name: "vault_cloudflare_connectExistingWorker",
    description:
      "Attach an existing Cloudflare Worker identity to a Samebase app after validating it against the repository.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app to attach the Worker to.",
      appId: "Stable Samebase vault app id returned by get_user_vaults.",
      accountId: "Cloudflare account id from list_cloudflare_accounts.",
      workerName: "Worker name from list_cloudflare_workers (recommended or available only).",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The manual Cloudflare attach: binds an existing Worker (validated against the app's
repository; a Worker wired to a different repository is rejected rather than adopted). Samebase
stores only the stable Worker identity. Current Worker state is read live from Cloudflare.`,
} as const;
