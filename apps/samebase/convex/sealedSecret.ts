import {
  bad,
  good,
  isObject,
  object as sureObject,
  pure,
  string as sureString,
} from "@samebase/sure";
import { Infer, v } from "convex/values";

import { base64ToBytes, bytesToBase64Url } from "../shared/base64";
import { env, type ActionCtx } from "./_generated/server";

const { object, string } = v;

/** A credential sealed with AES-256-GCM under the key `keyId` of the CREDENTIAL_KEYS ring. */
export const vSealedSecret = object({
  keyId: string(),
  /** 12 random bytes, base64url. */
  iv: string(),
  /** The AES-GCM output with its 16-byte tag, base64url. */
  ciphertext: string(),
});
export type SealedSecret = Infer<typeof vSealedSecret>;

/**
CREDENTIAL_KEYS: `{"current":"<keyId>","keys":{"<keyId>":"<base64 of 32 random bytes>"}}`. A key of 32
bytes in base64 is 43 characters and one `=`.
*/
const sureCredentialKeys = sureObject({
  current: sureString,
  keys: pure((value) => {
    if (!isObject(value)) {
      return bad("not object" as const);
    }
    const keys = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const [keyId, key] of Object.entries(value)) {
      if (typeof key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
        return bad("not a 32-byte base64 key" as const);
      }
      keys.set(keyId, base64ToBytes(key));
    }
    return good(keys);
  }),
});

/**
Reads CREDENTIAL_KEYS on every call, so a changed ring applies to the next function run. It fails
closed when the variable is missing or malformed, or when the current key id has no key.
*/
function readCredentialKeys() {
  let value: unknown;
  try {
    value = JSON.parse(env.CREDENTIAL_KEYS);
  } catch {
    // The parse error quotes the input, which holds the keys.
    throw new Error("CREDENTIAL_KEYS is missing or is not JSON.");
  }
  const [valid, ring] = sureCredentialKeys(value);
  if (!valid) {
    throw new Error(
      'CREDENTIAL_KEYS must be {"current":"<keyId>","keys":{"<keyId>":"<base64 of 32 bytes>"}}.',
    );
  }
  if (!ring.keys.has(ring.current)) {
    throw new Error(`CREDENTIAL_KEYS has no key for its current key id "${ring.current}".`);
  }
  return ring;
}

function importCredentialKey(
  ring: ReturnType<typeof readCredentialKeys>,
  keyId: string,
): Promise<CryptoKey> {
  const bytes = ring.keys.get(keyId);
  if (bytes === undefined) {
    throw new Error(`CREDENTIAL_KEYS has no key "${keyId}".`);
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
Seals a credential for storage with the current key. It needs an action: only actions have system
randomness for the IV. In queries and mutations `crypto.getRandomValues` is a seeded deterministic
generator, and a repeated IV under one key breaks AES-GCM. `aad` names the owner and the field, so the
sealed value opens only there.
*/
export async function sealSecret(
  _ctx: Pick<ActionCtx, "runAction">,
  args: { plaintext: string; aad: string },
): Promise<SealedSecret> {
  const ring = readCredentialKeys();
  const key = await importCredentialKey(ring, ring.current);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(args.aad) },
    key,
    new TextEncoder().encode(args.plaintext),
  );
  return {
    keyId: ring.current,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

/** Opens a sealed credential with the key it names. A different `aad` or a changed value fails. */
export async function openSecret(args: { sealed: SealedSecret; aad: string }): Promise<string> {
  const key = await importCredentialKey(readCredentialKeys(), args.sealed.keyId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(args.sealed.iv),
      additionalData: new TextEncoder().encode(args.aad),
    },
    key,
    base64ToBytes(args.sealed.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
