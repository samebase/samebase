import type { AccessKey, ViewerRole } from "../shared/accessModel";

const SAMEBASE_USAGE_CONTEXT_LOG_TOPIC = "samebase_usage_context";
const SAMEBASE_USAGE_CONTEXT_LOG_VERSION = 1;

export type SamebaseUsageFunctionKind = "query" | "mutation" | "action" | "http_action";

type SamebaseUsageContextLog = {
  topic: typeof SAMEBASE_USAGE_CONTEXT_LOG_TOPIC;
  version: typeof SAMEBASE_USAGE_CONTEXT_LOG_VERSION;
  surface: "app_function" | "mcp_http";
  function_kind: SamebaseUsageFunctionKind;
  samebase_user_id: string | null;
  viewer_role: ViewerRole | null;
  required_access: AccessKey | null;
  mcp_method: string | null;
  mcp_tool_name: string | null;
  mcp_is_notification: boolean | null;
};

/**
Emit one compact marker that PostHog can join to Convex `function_execution`
events through Convex's `function.request_id` log-stream field.

Keep this payload free of emails, tokens, provider account IDs, and file paths:
Convex forwards console output to every configured log stream.
*/
function writeSamebaseUsageContextLog(payload: SamebaseUsageContextLog) {
  console.info(`${SAMEBASE_USAGE_CONTEXT_LOG_TOPIC} ${JSON.stringify(payload)}`);
}

export function buildAppFunctionUsageContextLog(args: {
  functionKind: Exclude<SamebaseUsageFunctionKind, "http_action">;
  samebaseUserId: string | null;
  viewerRole: ViewerRole;
  requiredAccess: AccessKey;
}): SamebaseUsageContextLog {
  return {
    topic: SAMEBASE_USAGE_CONTEXT_LOG_TOPIC,
    version: SAMEBASE_USAGE_CONTEXT_LOG_VERSION,
    surface: "app_function",
    function_kind: args.functionKind,
    samebase_user_id: args.samebaseUserId,
    viewer_role: args.viewerRole,
    required_access: args.requiredAccess,
    mcp_method: null,
    mcp_tool_name: null,
    mcp_is_notification: null,
  };
}

export function logAppFunctionUsageContext(args: {
  functionKind: Exclude<SamebaseUsageFunctionKind, "http_action">;
  samebaseUserId: string | null;
  viewerRole: ViewerRole;
  requiredAccess: AccessKey;
}) {
  writeSamebaseUsageContextLog(buildAppFunctionUsageContextLog(args));
}

export function buildMcpHttpUsageContextLog(args: {
  samebaseUserId: string;
  mcpMethod: string;
  mcpToolName: string | null;
  mcpIsNotification: boolean;
}): SamebaseUsageContextLog {
  return {
    topic: SAMEBASE_USAGE_CONTEXT_LOG_TOPIC,
    version: SAMEBASE_USAGE_CONTEXT_LOG_VERSION,
    surface: "mcp_http",
    function_kind: "http_action",
    samebase_user_id: args.samebaseUserId,
    viewer_role: null,
    required_access: "access_mcp",
    mcp_method: args.mcpMethod,
    mcp_tool_name: args.mcpToolName,
    mcp_is_notification: args.mcpIsNotification,
  };
}

export function logMcpHttpUsageContext(args: {
  samebaseUserId: string;
  mcpMethod: string;
  mcpToolName: string | null;
  mcpIsNotification: boolean;
}) {
  writeSamebaseUsageContextLog(buildMcpHttpUsageContextLog(args));
}
