import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { id, string } = v;

export const cloudflareConnectExistingWorkerContract = {
  id: "connect_cloudflare_worker",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    accountId: string(),
    workerName: string(),
  },
  returns: v.null(),
  mcp: {
    title: "Connect Cloudflare Worker",
    name: "vault_cloudflare_connectExistingWorker",
    description:
      "Attach an existing Cloudflare Worker to a Samebase app (manual attach): validates the Worker against the repository and starts the connection run.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app to attach the Worker to.",
      appRoot: 'App root within the repository ("." for single-app repositories).',
      accountId: "Cloudflare account id from list_cloudflare_accounts.",
      workerName: "Worker name from list_cloudflare_workers (recommended or available only).",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `The manual Cloudflare attach: binds an existing Worker (validated against the app's
repository; a Worker wired to a different repository is rejected rather than adopted) and starts
the connection run. This is also the remedy \`get_user_vaults\` names as
\`nextAction: "connect_cloudflare_worker"\` after a failed manual Cloudflare attach.

Writes Samebase's Worker record and the connection run; follow with \`wire_builds\` and
\`wire_convex_build_access\` if the Worker's Builds trigger or deploy keys are missing (the status
axes name exactly that). Progress and failure are readable through \`get_user_vaults\`.`,
} as const;
