// Opens the secrets that @samebase/alchemy-kit 0.2 sealed itself, so that Alchemy's
// StateEncryption seals them again at the next deploy of their stage.
//
// Kit 0.2 wrote a secret as `{"__redacted__": {"__sealed__": "v1.<iv>.<ciphertext>"}}`: the IV is
// 12 random bytes, the ciphertext is the AES-GCM output of `JSON.stringify(X)` with its tag, both
// base64url, and the additional authenticated data is the object key of the record.
import type { webcrypto } from "node:crypto";
import { REDACTED_MARKER, StateStoreError } from "alchemy/State";
import { isSealed } from "alchemy/State/StateEncryption";
import * as Effect from "effect/Effect";

type CryptoKey = webcrypto.CryptoKey;

/** The variable that held the kit 0.2 key. */
export const KEY_VARIABLE = "ALCHEMY_GITHUB_STATE_KEY";

const SEALED_MARKER = "__sealed__";
const VERSION = "v1";

/** A key of 32 bytes in base64 is 43 characters and one `=`. */
const KEY_TEXT = /^[A-Za-z0-9+/]{43}=$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

/**
 * The kit 0.2 AES-256-GCM key in `text`, base64 of exactly 32 bytes. It fails when the text is
 * missing or malformed. An error never quotes the text.
 */
export const parseKey = (text: string | undefined) =>
  Effect.gen(function* () {
    const trimmed = text?.trim();
    if (!trimmed) {
      return yield* new StateStoreError({
        message: `GitHub state store: the state holds secrets that @samebase/alchemy-kit 0.2 sealed. Set ${KEY_VARIABLE} to that key for one deploy of each stage; the deploy seals them again with the StateEncryption.`,
      });
    }
    if (!KEY_TEXT.test(trimmed)) {
      return yield* new StateStoreError({
        message: `GitHub state store: ${KEY_VARIABLE} is not base64 of 32 bytes.`,
      });
    }
    return yield* Effect.promise(() =>
      crypto.subtle.importKey(
        "raw",
        new Uint8Array(Buffer.from(trimmed, "base64")),
        "AES-GCM",
        false,
        ["decrypt"],
      ),
    );
  });

/** `value` with `f` applied to each `__redacted__` field in it. */
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

/** The `v1.<iv>.<ciphertext>` of a secret that kit 0.2 sealed, else `undefined`. */
const legacySeal = (inner: unknown) => {
  const sealed =
    typeof inner === "object" && inner !== null && SEALED_MARKER in inner
      ? inner[SEALED_MARKER]
      : undefined;
  const [version, iv, ciphertext, ...rest] = typeof sealed === "string" ? sealed.split(".") : [];
  return version === VERSION && iv !== undefined && ciphertext !== undefined && rest.length === 0
    ? { iv, ciphertext }
    : undefined;
};

/**
 * The record `text` with each secret that kit 0.2 sealed opened into plaintext, so Alchemy's
 * codec sees a stale record and seals it again. Text that Alchemy sealed, and text without such a
 * secret, comes back as it is. `key` is asked for only when a record holds such a secret.
 */
export const openLegacyRecord = (
  key: Effect.Effect<CryptoKey, StateStoreError>,
  objectKey: string,
  text: string,
) =>
  Effect.gen(function* () {
    if (isSealed(text) || !text.includes(`"${SEALED_MARKER}"`)) return text;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      // Not JSON: the codec reports it.
      return text;
    }
    let opened = 0;
    const mapped = yield* mapSecrets(value, (inner) =>
      Effect.gen(function* () {
        const sealed = legacySeal(inner);
        if (sealed === undefined) return inner;
        opened++;
        const cryptoKey = yield* key;
        const plaintext = yield* Effect.tryPromise({
          try: () =>
            crypto.subtle.decrypt(
              {
                name: "AES-GCM",
                iv: fromBase64(sealed.iv),
                additionalData: encoder.encode(objectKey),
              },
              cryptoKey,
              fromBase64(sealed.ciphertext),
            ),
          catch: () =>
            new StateStoreError({
              message: `GitHub state store: a secret in ${objectKey} does not open. ${KEY_VARIABLE} is not the key that sealed it, or the record was moved from another place.`,
            }),
        });
        // AES-GCM opened it, so it is the JSON text that kit 0.2 sealed.
        const secret: unknown = JSON.parse(decoder.decode(plaintext));
        return secret;
      }),
    );
    return opened === 0 ? text : JSON.stringify(mapped, null, 2);
  });
