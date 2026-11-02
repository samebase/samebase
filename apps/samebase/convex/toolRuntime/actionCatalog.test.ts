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
  repository_create: api.repository.create,
  repository_connect: api.repository.connect,
  repository_retryProviderSetup: api.repository.retryProviderSetup,
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
      "create_repository",
      "connect_repository",
      "retry_provider_setup",
      "submit_feedback",
      "create_sign_in_link",
      "get_authentication_status",
    ]);
  });

  it("exposes exactly the start, monitor, and account tools", () => {
    expect(actionContracts.map((contract) => contract.mcp.name)).toEqual([
      "repository_list",
      "repository_getStatus",
      "repository_create",
      "repository_connect",
      "repository_retryProviderSetup",
      "feedback_submit",
      "account_createSignInLink",
      "account_getAuthenticationStatus",
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
