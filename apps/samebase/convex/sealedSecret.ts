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

const { object, string, union } = v;

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
Transitional, for the in-place sealing of the rows that existed before PR #1798: a plain string is a
credential written before sealing. The narrowing PR after the reseal run replaces every use of this
validator with vSealedSecret and deletes it.
*/
export const vStoredSecret = union(string(), vSealedSecret);
export type StoredSecret = Infer<typeof vStoredSecret>;

/**
Equal stored values mean an unchanged row: every seal draws a new IV, two plain strings compare by
equality, and a plain string never equals a sealed object.
*/
export function sameSealedSecret(left: StoredSecret, right: StoredSecret): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  return left.keyId === right.keyId && left.iv === right.iv && left.ciphertext === right.ciphertext;
}

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

/** The key id that sealSecret seals under now. */
export function readCurrentCredentialKeyId(): string {
  return readCredentialKeys().current;
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

/**
Opens a sealed credential with the key it names. A different `aad` or a changed value fails. A plain
string, written before sealing, fails without its value in the error.
*/
export async function openSecret(args: { sealed: StoredSecret; aad: string }): Promise<string> {
  const { sealed } = args;
  if (typeof sealed === "string") {
    throw new Error(
      "Stored credential is not sealed yet. Run internal.resealCredentials.run on this deployment.",
    );
  }
  const key = await importCredentialKey(readCredentialKeys(), sealed.keyId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(sealed.iv),
      additionalData: new TextEncoder().encode(args.aad),
    },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
