import type { ProviderAuth } from "./providerConnectionModel";
import { sha256Hex } from "./mcp/tokens";

function serializeProviderAuth(auth: ProviderAuth): string {
  switch (auth.method) {
    case "api_key":
      return JSON.stringify(["api_key", auth.credential]);
    case "oauth":
      return "refreshCredential" in auth
        ? JSON.stringify([
            "cloudflare_oauth",
            auth.credential,
            auth.refreshCredential,
            auth.credentialExpiresAt,
          ])
        : JSON.stringify(["convex_oauth", auth.credential]);
    case "mcp_oauth":
      return JSON.stringify([
        "cloudflare_mcp_oauth",
        auth.credential,
        auth.refreshCredential,
        auth.credentialExpiresAt,
        auth.clientId,
      ]);
  }
}

export function fingerprintProviderAuth(auth: ProviderAuth): Promise<string> {
  return sha256Hex(serializeProviderAuth(auth));
}
