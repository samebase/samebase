import { Infer, v } from "convex/values";

import { vSealedSecret, type SealedSecret } from "./sealedSecret";

const { literal, number, object, string, union } = v;

export const vOAuthAuth = object({
  method: literal("oauth"),
  credential: vSealedSecret,
});

export const vCloudflareOAuthAuth = object({
  method: literal("oauth"),
  credential: vSealedSecret,
  refreshCredential: vSealedSecret,
  credentialExpiresAt: number(),
});

export const vMcpOAuthAuth = object({
  method: literal("mcp_oauth"),
  credential: vSealedSecret,
  refreshCredential: vSealedSecret,
  credentialExpiresAt: number(),
  clientId: string(),
});

export const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: vSealedSecret,
});

export const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
export const vCloudflareProviderAuth = union(vCloudflareOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export const vProviderAuth = union(vOAuthAuth, vCloudflareOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;

/** Equal sealed objects mean an unchanged row: every seal draws a new IV. */
function sameSealedSecret(left: SealedSecret, right: SealedSecret): boolean {
  return left.keyId === right.keyId && left.iv === right.iv && left.ciphertext === right.ciphertext;
}

export function providerAuthMatches(left: ProviderAuth, right: ProviderAuth): boolean {
  if (left.method !== right.method) {
    return false;
  }

  switch (left.method) {
    case "api_key":
      return right.method === "api_key" && sameSealedSecret(left.credential, right.credential);
    case "oauth":
      if (right.method !== "oauth" || !sameSealedSecret(left.credential, right.credential)) {
        return false;
      }
      if ("refreshCredential" in left || "refreshCredential" in right) {
        return (
          "refreshCredential" in left &&
          "refreshCredential" in right &&
          sameSealedSecret(left.refreshCredential, right.refreshCredential) &&
          left.credentialExpiresAt === right.credentialExpiresAt
        );
      }
      return true;
    case "mcp_oauth":
      return (
        right.method === "mcp_oauth" &&
        sameSealedSecret(left.credential, right.credential) &&
        sameSealedSecret(left.refreshCredential, right.refreshCredential) &&
        left.credentialExpiresAt === right.credentialExpiresAt &&
        left.clientId === right.clientId
      );
  }
}

export function requireCloudflareAuthUsableDuringRefresh(
  auth: Infer<typeof vCloudflareProviderAuth>,
  now: number,
): void {
  if ((auth.method === "oauth" || auth.method === "mcp_oauth") && auth.credentialExpiresAt <= now) {
    throw new Error("Cloudflare token refresh is in progress. Retry shortly.");
  }
}
