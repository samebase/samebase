import { notEmpty } from "@samebase/dependent/main";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { createBrowserHandoffContract } from "./agentBrowserHandoff/contracts/createBrowserHandoff";
import {
  getAuthenticationStatusContract,
  type McpAuthenticationStatus,
} from "./mcp/contracts/getAuthenticationStatus";
import { publicMcpErrorMessage } from "./mcp/publicErrors";
import { listOrganizationIdsForUser } from "./organizationAccess";
import {
  AGENT_BROWSER_HANDOFF_TTL_MS,
  createAgentBrowserHandoffTokenValue,
  sha256Hex,
} from "./mcp/tokens";
import { vMcpToolFailure, mcpToolInvocationArgs } from "./toolRuntime/mcpTool";
import { normalizeAccountEmail, resolveAccountPresentation } from "../shared/accountPresentation";
import { buildAgentBrowserHandoffUrl } from "../shared/agentBrowserHandoff";

const { literal, object, string, union } = v;

const vAuthenticationStatusToolResult = object({
  status: literal("ok"),
  text: string(),
  structuredContent: getAuthenticationStatusContract.structuredContent,
});
type AuthenticationStatusToolResult = Infer<typeof vAuthenticationStatusToolResult>;

/** MCP-only: the status describes the bearer token of the calling MCP grant. */
export const getAuthenticationStatus = internalQuery({
  args: mcpToolInvocationArgs,
  returns: vAuthenticationStatusToolResult,
  handler: async (ctx, args): Promise<AuthenticationStatusToolResult> => {
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: args.userId,
    });
    if (viewer.user === null) {
      const authentication: McpAuthenticationStatus = { authenticated: false };
      return {
        status: "ok",
        text: "MCP token is valid, but its Samebase account is no longer active.",
        structuredContent: { authentication },
      };
    }

    const organizationIds = await listOrganizationIdsForUser(ctx.db, args.userId);
    const organizations = await Promise.all(
      organizationIds.map(async (organizationId) => await ctx.db.get(organizationId)),
    );
    const githubOwnerLogins = organizations
      .filter(notEmpty)
      .map((organization) => organization.githubOwnerLogin)
      .sort((left, right) => left.localeCompare(right));

    const normalizedEmail = normalizeAccountEmail(viewer.user.email);
    const accountPresentation = resolveAccountPresentation({
      displayName: viewer.user.displayName,
      email: normalizedEmail,
    });
    const authentication: McpAuthenticationStatus = {
      authenticated: true,
      user: {
        ...(accountPresentation.kind === "displayName" ? { name: accountPresentation.label } : {}),
        email: normalizedEmail,
      },
      role: viewer.role,
      githubOwnerLogins,
      grantedScopes: args.grantedScopes,
    };
    return {
      status: "ok",
      text: `Authenticated as ${accountPresentation.label}.`,
      structuredContent: { authentication },
    };
  },
});

const vCreateSignInLinkToolResult = union(
  object({
    status: literal("ok"),
    text: string(),
    structuredContent: createBrowserHandoffContract.structuredContent,
  }),
  vMcpToolFailure,
);
type CreateSignInLinkToolResult = Infer<typeof vCreateSignInLinkToolResult>;

/**
MCP-only: a browser session must not mint sign-in links, so this stays internal. The grant and
client IDs bind the handoff to the MCP grant that requested it.
*/
export const createSignInLink = internalAction({
  args: object({
    ...mcpToolInvocationArgs,
    grantId: string(),
    clientId: string(),
    ...createBrowserHandoffContract.args,
  }),
  returns: vCreateSignInLinkToolResult,
  handler: async (ctx, args): Promise<CreateSignInLinkToolResult> => {
    if (!args.grantedScopes.includes(createBrowserHandoffContract.access)) {
      return {
        status: "blocked",
        text: `Insufficient scope for ${createBrowserHandoffContract.mcp.name}.`,
      };
    }

    const siteUrl = process.env["SITE_URL"];
    if (!siteUrl) {
      return {
        status: "error",
        text: "SITE_URL must be configured to create browser handoff URLs.",
      };
    }

    const now = Date.now();
    const expiresAt = now + AGENT_BROWSER_HANDOFF_TTL_MS;
    const token = createAgentBrowserHandoffTokenValue();
    const tokenHash = await sha256Hex(token);
    let url: string;
    try {
      url = buildAgentBrowserHandoffUrl({
        returnToPath: args.returnToPath,
        siteUrl,
        token,
      });
    } catch (error) {
      return {
        status: "error",
        text: publicMcpErrorMessage(error),
      };
    }

    const result = await ctx.runMutation(internal.agentBrowserHandoff.createForMcp, {
      tokenHash,
      userId: args.userId,
      grantId: args.grantId,
      clientId: args.clientId,
      createdAt: now,
      expiresAt,
    });

    if (!result.ok) {
      return {
        status: "error",
        text: `Could not create browser handoff: ${result.reason}.`,
      };
    }

    const structuredContent = {
      url,
      expiresAt,
    };
    return {
      status: "ok",
      text: JSON.stringify(structuredContent, null, 2),
      structuredContent,
    };
  },
});
