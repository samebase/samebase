import { v } from "convex/values";

const { literal, number, object, optional, string, union } = v;

export const vResourceTokens = object({
  accessToken: string(),
  scope: string(),
  expiresAt: optional(number()),
  refreshToken: optional(string()),
});

export const resourceRequestFields = {
  requestId: string(),
  clientId: string(),
  redirectUri: string(),
  resource: string(),
  state: optional(string()),
  codeChallenge: string(),
  txnCookieHash: string(),
  expiresAt: number(),
};

export const vResourceRequest = union(
  object({
    status: literal("upstream"),
    ...resourceRequestFields,
    upstreamStateHash: string(),
    upstreamCodeVerifier: string(),
  }),
  object({ status: literal("claimed"), ...resourceRequestFields }),
  object({ status: literal("completed"), ...resourceRequestFields, tokens: vResourceTokens }),
);

export const vRefreshGrant = object({
  clientId: string(),
  resource: string(),
  tokenHash: string(),
  upstreamRefreshToken: string(),
  expiresAt: number(),
  /** Set while one attempt holds the upstream token, which can rotate only once. */
  refreshStartedAt: optional(number()),
});
