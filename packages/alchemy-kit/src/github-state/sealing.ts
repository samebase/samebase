// Seals each secret of a state record with AES-256-GCM, with Web Crypto only.
//
// Alchemy writes a secret as `{"__redacted__": X}` in plain text. On write, X becomes
// `{"__sealed__": "v1.<iv>.<ciphertext>"}`: the IV is 12 random bytes, the ciphertext is the
// AES-GCM output of `JSON.stringify(X)` with its tag, both base64url. The additional authenticated
// data is the object key of the record, so a sealed value opens only in its own record. Every
// other field stays readable JSON.
import type { webcrypto } from "node:crypto";
import { REDACTED_MARKER, StateStoreError } from "alchemy/State";
import * as Effect from "effect/Effect";

type CryptoKey = webcrypto.CryptoKey;

export const KEY_VARIABLE = "ALCHEMY_GITHUB_STATE_KEY";

const SEALED_MARKER = "__sealed__";
const VERSION = "v1";

/** A key of 32 bytes in base64 is 43 characters and one `=`. */
const KEY_TEXT = /^[A-Za-z0-9+/]{43}=$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));
const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/**
 * The AES-256-GCM key in `text`, base64 of exactly 32 bytes. It fails when the text is missing or
 * malformed. An error never quotes the text.
 */
export const parseKey = (text: string | undefined) =>
  Effect.gen(function* () {
    const make = `Make one with \`openssl rand -base64 32\` and keep it as a secret.`;
    const trimmed = text?.trim();
    if (!trimmed) {
      return yield* new StateStoreError({
        message: `GitHub state store: ${KEY_VARIABLE} is not set. ${make}`,
      });
    }
    if (!KEY_TEXT.test(trimmed)) {
      return yield* new StateStoreError({
        message: `GitHub state store: ${KEY_VARIABLE} is not base64 of 32 bytes. ${make}`,
      });
    }
    return yield* Effect.promise(() =>
      crypto.subtle.importKey(
        "raw",
        new Uint8Array(Buffer.from(trimmed, "base64")),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      ),
    );
  });

/**
 * `value` with `f` applied to each `__redacted__` field in it. Alchemy reads every object with
 * that field as a secret, also when the object has other fields, so every such field is one here.
 */
const mapSecrets = (
  value: unknown,
  f: (inner: unknown) => Effect.Effect<unknown, StateStoreError>,
): Effect.Effect<unknown, StateStoreError> => {
  if (Array.isArray(value)) return Effect.forEach(value, (item) => mapSecrets(item, f));
  if (typeof value !== "object" || value === null) return Effect.succeed(value);
  return Effect.forEach(Object.entries(value), ([name, item]) =>
    (name === REDACTED_MARKER ? f(item) : mapSecrets(item, f)).pipe(
      Effect.map((mapped) => [name, mapped] as const),
    ),
  ).pipe(Effect.map(Object.fromEntries));
};

/**
 * Rewrites the record `text` with `f` applied to each secret. A record without a secret comes back
 * as the same text.
 */
const rewrite = (
  objectKey: string,
  text: string,
  f: (inner: unknown) => Effect.Effect<unknown, StateStoreError>,
) =>
  Effect.gen(function* () {
    const value: unknown = yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: () => new StateStoreError({ message: `GitHub state store: ${objectKey} is not JSON` }),
    });
    let secrets = 0;
    const mapped = yield* mapSecrets(value, (inner) => {
      secrets++;
      return f(inner);
    });
    return secrets === 0 ? text : JSON.stringify(mapped, null, 2);
  });

/** The record `text` with each secret sealed for the record at `objectKey`. */
export const sealRecord = (key: CryptoKey, objectKey: string, text: string) =>
  rewrite(objectKey, text, (inner) =>
    Effect.promise(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(objectKey) },
        key,
        encoder.encode(JSON.stringify(inner)),
      );
      const sealed = `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
      return { [SEALED_MARKER]: sealed };
    }),
  );

/**
 * The record `text` with each sealed secret opened, as Alchemy wrote it. It fails when a secret is
 * not sealed, or does not open with `key` at `objectKey`.
 */
export const openRecord = (key: CryptoKey, objectKey: string, text: string) =>
  rewrite(objectKey, text, (inner) =>
    Effect.gen(function* () {
      const sealed =
        typeof inner === "object" && inner !== null && SEALED_MARKER in inner
          ? inner[SEALED_MARKER]
          : undefined;
      const [version, iv, ciphertext, ...rest] =
        typeof sealed === "string" ? sealed.split(".") : [];
      if (version !== VERSION || iv === undefined || ciphertext === undefined || rest.length > 0) {
        return yield* new StateStoreError({
          message: `GitHub state store: ${objectKey} holds a secret that is not sealed by this store`,
        });
      }
      const plaintext = yield* Effect.tryPromise({
        try: () =>
          crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64(iv), additionalData: encoder.encode(objectKey) },
            key,
            fromBase64(ciphertext),
          ),
        catch: () =>
          new StateStoreError({
            message: `GitHub state store: a secret in ${objectKey} does not open. ${KEY_VARIABLE} is not the key that sealed it, or the record was moved from another place.`,
          }),
      });
      // AES-GCM opened it, so it is the JSON text that `sealRecord` sealed.
      const value: unknown = JSON.parse(decoder.decode(plaintext));
      return value;
    }),
  );
