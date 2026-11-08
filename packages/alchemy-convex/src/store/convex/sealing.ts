// The secrets of the state rows. Alchemy's `encodeState` writes a `Redacted` value in clear text as
// `{ "__redacted__": <value> }`. A row holds `{ "__redacted__": { "__sealed__": <sealed> } }`, so a
// table view, a snapshot, or a reader that forgets to remove secrets shows no value.
//
// Each key is one variable `STATE_KEY_<keyId>` of the store deployment, and a sealed value names its
// key. So two runs that make a key at the same time add two variables, and neither can replace a
// key that a row needs. The table `keys` of the component names the current key: that choice is a
// transaction, so the first run wins, and a write that sealed under an older key cannot commit.
//
// `state:set` and `state:setOutput` seal in an action, and the reads of a run open in a query.
// `state:readStack` and `reader:repository` give the rows as they are stored, without their
// secrets. A value without `__sealed__` is one that `state:reseal` has not reached yet.
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

/** The sealed object of a `__redacted__` value, or undefined for a value in clear text. */
const sealedIn = (value: unknown): SealedSecret | undefined => {
  if (!isRecord(value) || !isRecord(value[SEALED])) return undefined;
  const { keyId, iv, ciphertext } = value[SEALED];
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

/** True when a JSON text of `encodeState` can hold a secret. */
export const hasSecret = (text: string) => text.includes(REDACTED);

/** The JSON text with each secret changed. A text without a secret stays the same text. */
const mapText = async (text: string, change: (secret: unknown) => Promise<unknown>) =>
  hasSecret(text) ? JSON.stringify(await mapSecrets(JSON.parse(text), change)) : text;

const sealValue = async (value: unknown, aad: string, keyId: string) => ({
  [SEALED]: await sealSecret(keyRingOf(keyId), { plaintext: JSON.stringify(value), aad }),
});

const openValue = async (sealed: SealedSecret, aad: string): Promise<unknown> =>
  JSON.parse(await openSecret(keyRingOf(sealed.keyId), { sealed, aad }));

/** The owner of a resource row: a sealed value opens only in the row that sealed it. */
export const resourceAad = (row: { stack: string; stage: string; fqn: string }) =>
  JSON.stringify(["resource", row.stack, row.stage, row.fqn]);

/** The owner of an output row. */
export const outputAad = (row: { stack: string; stage: string }) =>
  JSON.stringify(["output", row.stack, row.stage]);

/** Seals each secret of a JSON text of `encodeState`. Only an action can call it. */
export const sealText = (text: string, aad: string, keyId: string) =>
  mapText(text, (secret) => sealValue(secret, aad, keyId));

/** Opens each secret of a row, for the reads of a run. */
export const openText = (text: string, aad: string) =>
  mapText(text, async (secret) => {
    const sealed = sealedIn(secret);
    return sealed === undefined ? secret : openValue(sealed, aad);
  });

/** The row with every secret sealed under `keyId`. Only an action can call it. */
export const resealText = (text: string, aad: string, keyId: string) =>
  mapText(text, async (secret) => {
    const sealed = sealedIn(secret);
    if (sealed === undefined) return sealValue(secret, aad, keyId);
    if (sealed.keyId === keyId) return secret;
    return sealValue(await openValue(sealed, aad), aad, keyId);
  });
