// The keys of the store and the secrets of the state rows. Since store version 8 the client seals
// each secret with Alchemy's sealing codec, under a data key of its stage, before a write. The store
// is the key service of that codec: `state:newDataKey` makes a data key and gives it back with a
// copy wrapped under the current key of the store, and `state:openDataKey` opens a wrapped copy for
// the stage that it was made for. So a row holds no secret in clear text, and the client needs no
// key of its own.
//
// Each key is one variable `STATE_KEY_<keyId>` of the store deployment, and a wrapped data key names
// its key. So two runs that make a key at the same time add two variables, and neither can replace a
// key that a row needs. The table `keys` of the component names the current key: that choice is a
// transaction, so the first run wins.
//
// Store version 7 sealed in the store: a row of that version holds
// `{ "__redacted__": { "__sealed__": <sealed> } }`, or a secret in clear text that its reseal did not
// reach. The reads of a run still open such a row (`openText`), and the next write of that resource
// replaces it.
import { openSecret, parseKeyRing, sealSecret, type SealedSecret } from "../sealedSecret.ts";

const REDACTED = "__redacted__";
const SEALED = "__sealed__";

/** The variable of the store deployment that holds the key `keyId`. */
export const stateKeyName = (keyId: string) => `STATE_KEY_${keyId}`;

/** The one key `keyId` as a key ring. It fails when the variable is missing or malformed. */
const keyRingOf = (keyId: string) => {
  const name = stateKeyName(keyId);
  return parseKeyRing(
    name,
    JSON.stringify({ current: keyId, keys: { [keyId]: process.env[name] } }),
  );
};

/** Fails unless the deployment holds the key `keyId`, before a function makes it the current key. */
export const requireKey = (keyId: string) => {
  keyRingOf(keyId);
};

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- The store imports no app package, and this check is exactly the JSON object that the predicate names.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `value` as a sealed object, or undefined when it is not one. */
const sealedOf = (value: unknown): SealedSecret | undefined => {
  if (!isRecord(value)) return undefined;
  const { keyId, iv, ciphertext } = value;
  return typeof keyId === "string" && typeof iv === "string" && typeof ciphertext === "string"
    ? { keyId, iv, ciphertext }
    : undefined;
};

/** `value` with each `__redacted__` value replaced by the result of `change`. */
const mapSecrets = async (
  value: unknown,
  change: (secret: unknown) => Promise<unknown>,
): Promise<unknown> => {
  if (Array.isArray(value)) return Promise.all(value.map((item) => mapSecrets(item, change)));
  if (!isRecord(value)) return value;
  if (REDACTED in value) return { [REDACTED]: await change(value[REDACTED]) };
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, item]) => [key, await mapSecrets(item, change)]),
  );
  return Object.fromEntries(entries);
};

/** The owner of a resource row of store version 7: a sealed value opens only in that row. */
export const resourceAad = (row: { stack: string; stage: string; fqn: string }) =>
  JSON.stringify(["resource", row.stack, row.stage, row.fqn]);

/** The owner of an output row of store version 7. */
export const outputAad = (row: { stack: string; stage: string }) =>
  JSON.stringify(["output", row.stack, row.stage]);

/**
 * Opens each secret of a row of store version 7, for the reads of a run. A row that the client
 * sealed holds no `__redacted__` object, and it comes back as the same JSON.
 */
export const openText = async (text: string, aad: string) =>
  text.includes(REDACTED)
    ? JSON.stringify(
        await mapSecrets(JSON.parse(text), async (secret) => {
          const sealed = isRecord(secret) ? sealedOf(secret[SEALED]) : undefined;
          return sealed === undefined
            ? secret
            : JSON.parse(await openSecret(keyRingOf(sealed.keyId), { sealed, aad }));
        }),
      )
    : text;

/**
 * Fails when a JSON text holds a secret in clear text: an object with the key `__redacted__`. The
 * client seals each secret before a write, so such a text comes from a client of store version 7.
 */
export const refuseClearSecrets = (text: string) => {
  JSON.parse(text, (key, value: unknown) => {
    if (key === REDACTED) {
      throw new Error(
        "The store takes no secret in clear text. Update @samebase/alchemy-convex: it seals each secret before a write.",
      );
    }
    return value;
  });
};

/** The owner of a data key: it opens only for the stage that it was made for. */
const dataKeyAad = (scope: { stack: string; stage: string }) =>
  JSON.stringify(["data-key", scope.stack, scope.stage]);

/**
 * The data key `dataKey` of a stage, sealed under the key `keyId`: base64 of the JSON of the sealed
 * object. Only an action can call it.
 */
export const wrapDataKey = async (
  dataKey: string,
  scope: { stack: string; stage: string },
  keyId: string,
) =>
  btoa(
    JSON.stringify(
      await sealSecret(keyRingOf(keyId), { plaintext: dataKey, aad: dataKeyAad(scope) }),
    ),
  );

/** The data key of a wrapped copy. It fails for another stage, or when its key is gone. */
export const unwrapDataKey = (wrapped: string, scope: { stack: string; stage: string }) => {
  const sealed = sealedOf(JSON.parse(atob(wrapped)));
  if (sealed === undefined) throw new Error("This is not a data key of the store.");
  return openSecret(keyRingOf(sealed.keyId), { sealed, aad: dataKeyAad(scope) });
};
