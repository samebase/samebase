import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";

/**
The signing keys of the Convex Auth component, in the format of `npx @convex-dev/auth`: the
component decodes the base64 PKCS#8 key and signs with the `kid` of the first key in the set.
*/
export function generateConvexAuthKeys(): { AUTH_PRIVATE_KEY: string; AUTH_JWKS: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" });
  const publicJwk = publicKey.export({ format: "jwk" });
  return {
    AUTH_PRIVATE_KEY: Buffer.from(privatePem.toString()).toString("base64"),
    AUTH_JWKS: JSON.stringify({
      keys: [{ ...publicJwk, kid: randomUUID(), alg: "RS256", use: "sig" }],
    }),
  };
}

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

/**
The identity hub variables of a local backend, which has no hub: a linked worktree and CI.
convex/convex.config.ts requires the three variables, and convex/auth.ts needs a loopback or https
issuer to load, so they hold values that name the absence. The sign-in page hides the hub methods on
the `local_worktree` deployment profile of these backends.
*/
export const NO_HUB_ENVIRONMENT = {
  HUB_ISSUER: "http://127.0.0.1:1",
  HUB_CLIENT_ID: "no-hub",
  HUB_CLIENT_SECRET: "no-hub",
};
