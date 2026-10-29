import type {
  CloudflareProviderCredential,
  ConvexProviderCredential,
} from "./organization/providerCredentialModel";
import type { ProviderAuth } from "./providerAuth";
import type { StoredSecret } from "./sealedSecret";
import { sha256Hex } from "./mcp/tokens";

/**
A fixed field order, so the hash does not depend on the key order of the stored object; a plain
string written before sealing serializes as itself.
*/
function serializeSealedSecret(stored: StoredSecret): string | [string, string, string] {
  return typeof stored === "string" ? stored : [stored.keyId, stored.iv, stored.ciphertext];
}

function serializeProviderAuth(auth: ProviderAuth): string {
  switch (auth.method) {
    case "api_key":
      return JSON.stringify(["api_key", serializeSealedSecret(auth.credential)]);
    case "oauth":
      return "refreshCredential" in auth
        ? JSON.stringify([
            "cloudflare_oauth",
            serializeSealedSecret(auth.credential),
            serializeSealedSecret(auth.refreshCredential),
            auth.credentialExpiresAt,
          ])
        : JSON.stringify(["convex_oauth", serializeSealedSecret(auth.credential)]);
    case "mcp_oauth":
      return JSON.stringify([
        "cloudflare_mcp_oauth",
        serializeSealedSecret(auth.credential),
        serializeSealedSecret(auth.refreshCredential),
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
