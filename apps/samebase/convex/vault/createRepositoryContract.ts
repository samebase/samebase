import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { boolean, id, object, optional, string } = v;

export const createRepositoryContract = {
  access: ACCESS_APP_CREATE,
  args: {
    name: string(),
    owner: string(),
    convexProjectName: string(),
    cloudflareWorkerName: string(),
    description: optional(string()),
    private: optional(boolean()),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  }),
  mcp: {
    name: "vault_actions_createRepository",
    description:
      "Create a new Samebase app by starting the managed app provisioning workflow: create the GitHub repository, seed the starter app, provision Convex, and provision Cloudflare.",
    safety: "write",
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
    inputDescriptions: {
      name: "Name for the new app and GitHub repository.",
      owner: "GitHub user or organization where Samebase should create the app repository.",
      convexProjectName: "Convex project name to provision for the app.",
      cloudflareWorkerName: "Cloudflare Worker name to provision for the app.",
      description: "Optional GitHub repository description.",
      private: "Whether to create a private GitHub repository. Defaults to true.",
    },
  } satisfies AppFunctionMcpMetadata,
} as const;

const createRepositoryArgsValidator = object(createRepositoryContract.args);

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
