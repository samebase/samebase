import { v, type Infer } from "convex/values";

import { ACCESS_APP_CREATE } from "../../shared/accessModel";
import type { AppFunctionMcpMetadata } from "../../shared/convexFunctionPolicyTypes";

const { boolean, id, object, optional, string } = v;

export const createRepositoryAccess = ACCESS_APP_CREATE;

export const createRepositoryArgs = {
  name: string(),
  owner: string(),
  convexProjectName: string(),
  cloudflareWorkerName: string(),
  description: optional(string()),
  private: optional(boolean()),
};

const createRepositoryArgsValidator = object(createRepositoryArgs);

export const vCreateRepositoryReturns = object({
  vaultId: id("vaults"),
  runId: id("appProvisioningRuns"),
});

export const createRepositoryMcp = {
  name: "vault.actions.createRepository",
  description:
    "Create a new Samebase app by starting the managed app provisioning workflow: create the GitHub repository, seed the starter app, provision Convex, and provision Cloudflare.",
  safety: "write",
  inputDescriptions: {
    name: "Name for the new app and GitHub repository.",
    owner: "GitHub user or organization where Samebase should create the app repository.",
    convexProjectName: "Convex project name to provision for the app.",
    cloudflareWorkerName: "Cloudflare Worker name to provision for the app.",
    description: "Optional GitHub repository description.",
    private: "Whether to create a private GitHub repository. Defaults to true.",
  },
} satisfies AppFunctionMcpMetadata;

type CreateRepositoryContract = {
  access: typeof createRepositoryAccess;
  args: typeof createRepositoryArgs;
  returns: typeof vCreateRepositoryReturns;
  mcp: typeof createRepositoryMcp;
};

export const createRepositoryContract: CreateRepositoryContract = {
  access: createRepositoryAccess,
  args: createRepositoryArgs,
  returns: vCreateRepositoryReturns,
  mcp: createRepositoryMcp,
};

export type CreateRepositoryArgs = Infer<typeof createRepositoryArgsValidator>;
