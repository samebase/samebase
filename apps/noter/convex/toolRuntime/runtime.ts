"use node";

import { Infer, v } from "convex/values";
import { ZodError } from "zod";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { findToolInCatalog } from "./catalog";
import { executeRuntimeTool } from "./executors";
import { validateToolPolicy } from "./policy";
import type { ResolvedToolContext, ToolExecutionOutput } from "./types";
import { normalizeOptionalString } from "./utils";

const { array, id, literal, object, optional, string, union } = v;

const toolSurfaceValidator = union(literal("agent"), literal("mcp"), literal("ui"));

const runToolArgsValidator = object({
  toolName: string(),
  inputJson: string(),
  surface: toolSurfaceValidator,
  userId: id("users"),
  grantedScopes: array(string()),
  vaultId: optional(string()),
  branch: optional(string()),
  threadId: optional(string()),
  requestId: optional(string()),
});
type RunToolArgs = Infer<typeof runToolArgsValidator>;

const runToolResultValidator = object({
  status: union(literal("ok"), literal("error"), literal("blocked")),
  text: string(),
  structuredContentJson: optional(string()),
});
type RunToolResult = Infer<typeof runToolResultValidator>;

function parseInputJson(inputJson: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return {
      ok: true,
      value: JSON.parse(inputJson),
    };
  } catch {
    return { ok: false };
  }
}

function formatZodError(error: ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "input";
    return `${path}: ${issue.message}`;
  });
  return issues.join("; ");
}

function toActionResult(args: {
  status: "ok" | "error" | "blocked";
  text: string;
  output?: ToolExecutionOutput;
}): RunToolResult {
  if (args.status !== "ok" || args.output?.structuredContent === undefined) {
    return {
      status: args.status,
      text: args.text,
    };
  }
  return {
    status: args.status,
    text: args.text,
    structuredContentJson: JSON.stringify(args.output.structuredContent),
  };
}

async function resolveToolContext(
  ctx: ActionCtx,
  args: RunToolArgs,
  requiresGithubConnection: boolean,
): Promise<{ ok: true; value: ResolvedToolContext } | { ok: false; message: string }> {
  const branch = normalizeOptionalString(args.branch);
  const threadId = normalizeOptionalString(args.threadId);
  const vault =
    args.vaultId === undefined
      ? null
      : await ctx.runQuery(internal.toolRuntime.queries.getVaultContextForUser, {
          userId: args.userId,
          vaultId: args.vaultId,
        });

  if (args.vaultId !== undefined) {
    if (vault === null) {
      return { ok: false, message: "Vault not found." };
    }
  }

  let githubAccessToken: string | undefined;
  if (requiresGithubConnection) {
    const githubConnection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "github",
    });
    if (githubConnection?.kind !== "github") {
      return {
        ok: false,
        message: "GitHub provider connection is not configured.",
      };
    }
    githubAccessToken = githubConnection.auth.credential;
  }

  return {
    ok: true,
    value: {
      ctx,
      surface: args.surface,
      userId: args.userId,
      grantedScopes: args.grantedScopes,
      vault,
      branch,
      githubAccessToken,
      threadId,
      requestId: args.requestId,
    },
  };
}

export const runTool = internalAction({
  args: runToolArgsValidator,
  returns: runToolResultValidator,
  handler: async (ctx, args): Promise<RunToolResult> => {
    const tool = findToolInCatalog({ name: args.toolName });
    if (!tool) {
      return toActionResult({
        status: "error",
        text: `Unknown tool: ${args.toolName}`,
      });
    }

    const inputParse = parseInputJson(args.inputJson);
    if (!inputParse.ok) {
      return toActionResult({
        status: "error",
        text: "Tool input must be valid JSON.",
      });
    }

    const policyCheck = validateToolPolicy({
      tool,
      request: {
        toolName: args.toolName,
        input: inputParse.value,
        surface: args.surface,
        userId: args.userId,
        grantedScopes: args.grantedScopes,
        vaultId: args.vaultId,
        branch: args.branch,
        threadId: args.threadId,
        requestId: args.requestId,
      },
    });
    if (!policyCheck.ok) {
      return toActionResult({
        status: "blocked",
        text: policyCheck.message ?? "Tool call blocked by policy.",
      });
    }

    const parsedInput = tool.agentArgs.safeParse(inputParse.value);
    if (!parsedInput.success) {
      return toActionResult({
        status: "error",
        text: `Invalid input for ${tool.name}: ${formatZodError(parsedInput.error)}`,
      });
    }

    const resolvedContext = await resolveToolContext(ctx, args, tool.requiresGithubConnection);
    if (!resolvedContext.ok) {
      return toActionResult({
        status: "blocked",
        text: resolvedContext.message,
      });
    }

    try {
      const output = await executeRuntimeTool({
        toolName: tool.name,
        context: resolvedContext.value,
        input: parsedInput.data,
      });
      return toActionResult({
        status: "ok",
        text: output.text,
        output,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return toActionResult({
        status: "error",
        text: message,
      });
    }
  },
});
