import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { actionContracts, type ActionContractMcpName } from "./actionCatalog";

/**
The registered Convex function that runs each tool. Shared tools name the public function that the
dashboard calls; MCP-only tools name an internal function. A missing or extra key fails typecheck.
*/
const toolFunctions = {
  repository_list: api.repository.list,
  repository_getStatus: api.repository.getStatus,
  repository_convex_findProjects: api.repository.convex.findProjects,
  repository_cloudflare_findWorkers: api.repository.cloudflare.findWorkers,
  repository_create: api.repository.create,
  repository_connect: api.repository.connect,
  repository_convex_attachProject: api.repository.convex.attachProject,
  repository_convex_createProject: api.repository.convex.createProject,
  repository_cloudflare_attachWorkers: api.repository.cloudflare.attachWorkers,
  repository_cloudflare_connectWorker: api.repository.cloudflare.connectWorker,
  repository_cloudflare_createWorker: api.repository.cloudflare.createWorker,
  repository_cloudflare_configureBuilds: api.repository.cloudflare.configureBuilds,
  repository_cloudflare_rotateConvexDeployKeys: api.repository.cloudflare.rotateConvexDeployKeys,
  repository_retryProviderSetup: api.repository.retryProviderSetup,
  repository_detachResource: api.repository.detachResource,
  feedback_submit: internal.feedback.submit,
  account_createSignInLink: internal.account.createSignInLink,
  account_getAuthenticationStatus: internal.account.getAuthenticationStatus,
} satisfies Record<
  ActionContractMcpName,
  FunctionReference<"query" | "mutation" | "action", "public" | "internal">
>;

describe("action catalog", () => {
  it("leads with reads and keeps diagnostic actions at the end", () => {
    expect(actionContracts.map((contract) => contract.id)).toEqual([
      "list_repositories",
      "get_repository_status",
      "find_convex_projects",
      "find_cloudflare_workers",
      "create_repository",
      "connect_repository",
      "attach_convex_project",
      "create_convex_project",
      "attach_cloudflare_workers",
      "connect_cloudflare_worker",
      "create_cloudflare_worker",
      "configure_workers_builds",
      "rotate_convex_deploy_keys",
      "retry_provider_setup",
      "detach_resource",
      "submit_feedback",
      "create_sign_in_link",
      "get_authentication_status",
    ]);
  });

  it("labels each tool in the generated docs as its annotations describe it", () => {
    for (const { mcp } of actionContracts) {
      expect([mcp.name, mcp.safety === "read_only", mcp.safety === "destructive"]).toEqual([
        mcp.name,
        mcp.annotations.readOnlyHint,
        mcp.annotations.destructiveHint,
      ]);
    }
  });

  it("names each tool after the path of the Convex function that runs it", () => {
    for (const contract of actionContracts) {
      expect(getFunctionName(toolFunctions[contract.mcp.name]).replace(/[/:]/g, "_")).toBe(
        contract.mcp.name,
      );
    }
  });
});
