import { v } from "convex/values";

import { ACCESS_APP_CREATE } from "../../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../../shared/convexFunctionPolicyTypes";

const { array, id, literal, null: nullValue, object, string, union } = v;

export const vCloudflareWorkerRepositoryEvidence = union(
  object({
    state: literal("none"),
  }),
  object({
    state: literal("matching_repo"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
    rootDirectory: string(),
  }),
  object({
    state: literal("same_repo_different_root"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
    rootDirectory: string(),
    expectedRootDirectory: string(),
  }),
  object({
    state: literal("different_repo"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("deleted_repo_connection"),
    repoId: union(string(), nullValue()),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("missing_repo_id"),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
  }),
  object({
    state: literal("missing_root_directory"),
    repoId: string(),
    repoName: union(string(), nullValue()),
    triggerName: union(string(), nullValue()),
    expectedRootDirectory: string(),
  }),
  object({
    state: literal("trigger_read_failed"),
    message: string(),
  }),
);

export const vCloudflareWorkerResult = object({
  workerName: string(),
  workerTag: string(),
  discovery: object({
    classification: union(
      literal("recommended"),
      literal("available"),
      literal("blocked"),
      literal("unknown"),
    ),
    evidence: vCloudflareWorkerRepositoryEvidence,
  }),
});

export const cloudflareListWorkersContract = {
  id: "list_cloudflare_workers",
  access: ACCESS_APP_CREATE,
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
    accountId: string(),
  },
  returns: array(vCloudflareWorkerResult),
  structuredContent: object({ workers: array(vCloudflareWorkerResult) }),
  mcp: {
    title: "List Cloudflare Workers",
    name: "vault_cloudflare_listWorkers",
    description:
      "List the Workers on a Cloudflare account, classified against the app's repository so safe attach targets are marked recommended.",
    safety: "read_only",
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      vaultId: "Samebase vault id of the app the Worker would attach to.",
      appRoot: 'App root within the repository ("." for single-app repositories).',
      accountId: "Cloudflare account id from list_cloudflare_accounts.",
    },
  } satisfies AppFunctionMcpMetadata,
  doc: `Discovery read for the manual Cloudflare attach flow: lists Workers on the chosen account
and classifies each against the app's repository: \`recommended\` (already tied to this repo and
root), \`available\`, \`blocked\` (tied to a different repository; attaching would be wrong), or
\`unknown\`. Pick a recommended or available \`workerName\` for \`connect_cloudflare_worker\`;
never attach a blocked one. Scoped to the caller's own vault; reads from Cloudflare. The only
writes are Samebase's own connection bookkeeping (OAuth token refresh) when needed.`,
} as const;
