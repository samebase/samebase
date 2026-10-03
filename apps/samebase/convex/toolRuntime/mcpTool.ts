import { v, type Infer, type ObjectType, type PropertyValidators } from "convex/values";
import type { ReturnValueForOptionalValidator } from "convex/server";

import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { AccessKey } from "../../shared/accessModel";
import { publicMcpErrorMessage } from "../mcp/publicErrors";
import { mcpScopeAllowsAccess } from "./mcpScopes";

const { array, id, literal, object, string, union } = v;

/** Trusted fields that mcp/http.ts sets for every tool call after the bearer token check. */
export const mcpToolInvocationArgs = {
  userId: id("users"),
  grantedScopes: array(string()),
};

/**
Trusted grant fields that mcp/http.ts adds for the tools that record the calling MCP client: the
sign-in link binds to the grant, and a confirmed action names it in its audit row.
*/
export const mcpGrantArgs = {
  grantId: string(),
  clientId: string(),
};

export const vMcpToolFailure = object({
  status: union(literal("error"), literal("blocked")),
  text: string(),
});

type McpToolContract = {
  access: AccessKey;
  mcp: { name: string };
};

type RegisteredMcpToolArgs<Args extends PropertyValidators> = ObjectType<Args> & {
  userId: Id<"users">;
  grantedScopes: string[];
};
type McpToolArgs<Args extends PropertyValidators> = Omit<
  RegisteredMcpToolArgs<Args>,
  "grantedScopes"
>;

/**
Registers the internal action that runs one MCP tool. It checks the granted scope before `run`
starts and turns a thrown error into a public tool error, so `run` holds only the product call.
*/
export function defineMcpTool<
  const Args extends PropertyValidators,
  const SuccessFields extends PropertyValidators,
>(config: {
  contract: McpToolContract;
  args: Args;
  successFields: SuccessFields;
  run: (
    ctx: ActionCtx,
    args: McpToolArgs<Args>,
  ) => Promise<(ObjectType<SuccessFields> & { text: string }) | Infer<typeof vMcpToolFailure>>;
}) {
  const vToolSuccess = object({
    ...config.successFields,
    status: literal("ok"),
    text: string(),
  });
  const vToolResult = union(vToolSuccess, vMcpToolFailure);
  const vToolArgs = object({
    ...config.args,
    ...mcpToolInvocationArgs,
  });
  type ToolReturn = ReturnValueForOptionalValidator<typeof vToolResult>;

  return internalAction<
    typeof vToolArgs,
    typeof vToolResult,
    ToolReturn,
    [Infer<typeof vToolArgs>]
  >({
    args: vToolArgs,
    returns: vToolResult,
    // @ts-expect-error vToolArgs validates these contract and trusted fields before the handler.
    handler: async (ctx, args: RegisteredMcpToolArgs<Args>) => {
      const { grantedScopes, ...toolArgs } = args;
      if (!mcpScopeAllowsAccess(config.contract.access, grantedScopes)) {
        return {
          status: "blocked",
          text: `Insufficient scope for ${config.contract.mcp.name}.`,
        };
      }

      try {
        return {
          status: "ok",
          ...(await config.run(ctx, toolArgs)),
        };
      } catch (error) {
        return {
          status: "error",
          text: publicMcpErrorMessage(error),
        };
      }
    },
  });
}
