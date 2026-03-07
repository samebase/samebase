import { Infer, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  McpAuthRequestStatus,
  McpOauthClientRegistrationStatus,
} from "./schema";

const {
  array,
  id,
  literal,
  null: nullValue,
  number,
  object,
  optional,
  string,
  union,
} = v;

const registerDynamicClientArgsValidator = object({
  clientId: string(),
  clientName: optional(string()),
  redirectUris: array(string()),
  grantTypes: array(string()),
  responseTypes: array(string()),
  tokenEndpointAuthMethod: literal("none"),
  provisionalExpiresAt: number(),
  createdAt: number(),
  updatedAt: number(),
  metadataJson: string(),
});
type RegisterDynamicClientArgs = Infer<
  typeof registerDynamicClientArgsValidator
>;

const getClientByIdResultValidator = union(
  object({
    id: id("mcpOauthClients"),
    clientId: string(),
    clientName: optional(string()),
    redirectUris: array(string()),
    grantTypes: array(string()),
    responseTypes: array(string()),
    tokenEndpointAuthMethod: literal("none"),
    registrationStatus: McpOauthClientRegistrationStatus,
    provisionalExpiresAt: optional(number()),
    firstTokenExchangedAt: optional(number()),
    createdAt: number(),
    updatedAt: number(),
    metadataJson: string(),
  }),
  nullValue(),
);
type GetClientByIdResult = Infer<typeof getClientByIdResultValidator>;

const createAuthRequestArgsValidator = object({
  requestId: string(),
  clientId: string(),
  redirectUri: string(),
  resource: string(),
  scope: string(),
  state: optional(string()),
  codeChallenge: string(),
  codeChallengeMethod: literal("S256"),
  userId: optional(id("users")),
  createdAt: number(),
  expiresAt: number(),
});
type CreateAuthRequestArgs = Infer<typeof createAuthRequestArgsValidator>;

export const registerDynamicClient = internalMutation({
  args: registerDynamicClientArgsValidator,
  returns: id("mcpOauthClients"),
  handler: async (ctx, args: RegisterDynamicClientArgs) => {
    return await ctx.db.insert("mcpOauthClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      grantTypes: args.grantTypes,
      responseTypes: args.responseTypes,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      createdBy: "dynamic_registration",
      registrationStatus: "provisional",
      provisionalExpiresAt: args.provisionalExpiresAt,
      metadataJson: args.metadataJson,
    });
  },
});

export const getClientByClientId = internalQuery({
  args: { clientId: string() },
  returns: getClientByIdResultValidator,
  handler: async (ctx, args): Promise<GetClientByIdResult> => {
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      return null;
    }
    return {
      id: client._id,
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      registrationStatus: client.registrationStatus,
      provisionalExpiresAt: client.provisionalExpiresAt,
      firstTokenExchangedAt: client.firstTokenExchangedAt,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      metadataJson: client.metadataJson,
    };
  },
});

export const createAuthRequest = internalMutation({
  args: createAuthRequestArgsValidator,
  returns: id("mcpAuthRequests"),
  handler: async (ctx, args: CreateAuthRequestArgs) => {
    return await ctx.db.insert("mcpAuthRequests", {
      requestId: args.requestId,
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      resource: args.resource,
      scope: args.scope,
      state: args.state,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      userId: args.userId,
      status: "pending",
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const expireAuthRequest = internalMutation({
  args: {
    authRequestId: id("mcpAuthRequests"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.authRequestId);
    if (!existing) {
      return null;
    }
    await ctx.db.patch(args.authRequestId, {
      status: "expired" satisfies Infer<typeof McpAuthRequestStatus>,
    });
    return null;
  },
});
