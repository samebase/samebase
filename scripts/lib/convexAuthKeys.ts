import { generateKeyPairSync, randomUUID } from "node:crypto";

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
