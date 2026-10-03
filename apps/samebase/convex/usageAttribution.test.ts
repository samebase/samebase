import { describe, expect, it } from "vite-plus/test";

import { buildAppFunctionUsageContextLog, buildMcpHttpUsageContextLog } from "./usageAttribution";

describe("usage attribution logs", () => {
  it("builds app function context without user PII", () => {
    const log = buildAppFunctionUsageContextLog({
      functionKind: "query",
      samebaseUserId: "users_123",
      viewerRole: "role_member",
      requiredAccess: "access_dashboard",
    });

    expect(log).toEqual({
      topic: "samebase_usage_context",
      version: 1,
      surface: "app_function",
      function_kind: "query",
      samebase_user_id: "users_123",
      viewer_role: "role_member",
      required_access: "access_dashboard",
      mcp_method: null,
      mcp_tool_name: null,
      mcp_is_notification: null,
    });
  });

  it("builds mcp http context with method and tool dimensions", () => {
    const log = buildMcpHttpUsageContextLog({
      samebaseUserId: "users_123",
      mcpMethod: "tools/call",
      mcpToolName: "repository_create",
      mcpIsNotification: false,
    });

    expect(log).toEqual({
      topic: "samebase_usage_context",
      version: 1,
      surface: "mcp_http",
      function_kind: "http_action",
      samebase_user_id: "users_123",
      viewer_role: null,
      required_access: "access_mcp",
      mcp_method: "tools/call",
      mcp_tool_name: "repository_create",
      mcp_is_notification: false,
    });
  });
});
