import { randomBytes } from "node:crypto";

/**
A new provider credential key ring of convex/sealedSecret.ts: one random 256-bit key under the id of
today's UTC date. convex/convex.config.ts requires the variable.
*/
export function generateCredentialKeys(): { CREDENTIAL_KEYS: string } {
  const keyId = new Date().toISOString().slice(0, 10);
  return {
    CREDENTIAL_KEYS: JSON.stringify({
      current: keyId,
      keys: { [keyId]: randomBytes(32).toString("base64") },
    }),
  };
}
