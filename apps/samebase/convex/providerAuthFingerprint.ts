import type {
  CloudflareProviderCredential,
  ConvexProviderCredential,
} from "./organizationProviderCredentialModel";
import type { ProviderAuth } from "./providerAuth";
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

export function hashOrganizationProviderSnapshot(
  provider:
    | {
        provider: "convex";
        teamId: string | undefined;
        credential: ConvexProviderCredential | undefined;
      }
    | {
        provider: "cloudflare";
        accountId: string | undefined;
        credential: CloudflareProviderCredential | undefined;
      },
): Promise<string> {
  switch (provider.provider) {
    case "convex":
      return sha256Hex(
        JSON.stringify([
          "convex",
          provider.teamId ?? null,
          provider.credential
            ? [
                serializeProviderAuth(provider.credential.auth),
                provider.credential.connectedByUserId,
                provider.credential.updatedAt,
              ]
            : null,
        ]),
      );
    case "cloudflare":
      return sha256Hex(
        JSON.stringify([
          "cloudflare",
          provider.accountId ?? null,
          provider.credential
            ? [
                serializeProviderAuth(provider.credential.auth),
                provider.credential.connectedByUserId,
                provider.credential.updatedAt,
              ]
            : null,
        ]),
      );
  }
}
