// AES-256-GCM sealing under a key ring, with Web Crypto only, so that it runs in Convex and in Node.
//
// A key ring is the JSON text `{"current":"<keyId>","keys":{"<keyId>":"<base64 of 32 bytes>"}}`,
// which a deployment keeps in one environment variable. `sealSecret` seals with the `current` key.
// `openSecret` opens with the key that the sealed object names, so an old key stays in the ring
// until a reseal moves its values to the current key.
//
// Seal only where randomness is real: in a Convex action, or outside Convex. In a Convex query or
// mutation `crypto.getRandomValues` is a seeded deterministic generator, and a repeated IV under one
// key breaks AES-GCM. Opening draws no randomness, so a query can open.

/** A value sealed with AES-256-GCM under the key `keyId` of a key ring. */
export interface SealedSecret {
  readonly keyId: string;
  /** 12 random bytes, base64url. */
  readonly iv: string;
  /** The AES-GCM output with its 16-byte tag, base64url. */
  readonly ciphertext: string;
}

export interface KeyRing {
  readonly current: string;
  readonly keys: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}

const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

/** The bytes of base64 or base64url text. */
const fromBase64 = (text: string) => {
  const standard = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

/** A key of 32 bytes in base64 is 43 characters and one `=`. */
const KEY_TEXT = /^[A-Za-z0-9+/]{43}=$/;

/**
 * The key ring in the text of the variable `name`. It fails closed when the text is missing or
 * malformed, or when the current key id has no key. An error never quotes the text, which holds
 * the keys.
 */
export const parseKeyRing = (name: string, text: string | undefined): KeyRing => {
  let value: unknown;
  try {
    value = JSON.parse(text ?? "");
  } catch {
    throw new Error(`${name} is missing or is not JSON.`);
  }
  const malformed = new Error(
    `${name} must be {"current":"<keyId>","keys":{"<keyId>":"<base64 of 32 bytes>"}}.`,
  );
  if (typeof value !== "object" || value === null) throw malformed;
  if (!("current" in value) || !("keys" in value)) throw malformed;
  const { current, keys: keyTexts } = value;
  if (typeof current !== "string" || typeof keyTexts !== "object" || keyTexts === null) {
    throw malformed;
  }
  const keys = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [keyId, key] of Object.entries(keyTexts)) {
    if (typeof key !== "string" || !KEY_TEXT.test(key)) throw malformed;
    keys.set(keyId, fromBase64(key));
  }
  if (!keys.has(current)) throw new Error(`${name} has no key for its current key id.`);
  return { current, keys };
};

/** The text of a new key ring with one random key. It needs real randomness, like `sealSecret`. */
export const newKeyRing = (): string => {
  const keyId = toBase64Url(crypto.getRandomValues(new Uint8Array(6)));
  const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  return JSON.stringify({ current: keyId, keys: { [keyId]: key } });
};

const importKey = (ring: KeyRing, keyId: string) => {
  const bytes = ring.keys.get(keyId);
  if (bytes === undefined) throw new Error(`The key ring has no key "${keyId}".`);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
};

/** Seals `plaintext` with the current key. `aad` names the owner, so the value opens only there. */
export const sealSecret = async (
  ring: KeyRing,
  args: { readonly plaintext: string; readonly aad: string },
): Promise<SealedSecret> => {
  const key = await importKey(ring, ring.current);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(args.aad) },
    key,
    new TextEncoder().encode(args.plaintext),
  );
  return {
    keyId: ring.current,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
};

/** Opens a sealed value with the key it names. A different `aad` or a changed value fails. */
export const openSecret = async (
  ring: KeyRing,
  args: { readonly sealed: SealedSecret; readonly aad: string },
): Promise<string> => {
  const { sealed } = args;
  const key = await importKey(ring, sealed.keyId);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(sealed.iv),
      additionalData: new TextEncoder().encode(args.aad),
    },
    key,
    fromBase64(sealed.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
};
