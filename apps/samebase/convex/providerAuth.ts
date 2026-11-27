import { Infer, v } from "convex/values";

import { sameSealedSecret, vSealedSecret } from "./sealedSecret";

const { literal, number, object, union } = v;

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

export const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: vSealedSecret,
});

export const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
export const vCloudflareProviderAuth = union(vCloudflareOAuthAuth, vApiKeyAuth);
export const vProviderAuth = union(vOAuthAuth, vCloudflareOAuthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;

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
  }
}

export function requireCloudflareAuthUsableDuringRefresh(
  auth: Infer<typeof vCloudflareProviderAuth>,
  now: number,
): void {
  if (auth.method === "oauth" && auth.credentialExpiresAt <= now) {
    throw new Error("Cloudflare token refresh is in progress. Retry shortly.");
  }
}
