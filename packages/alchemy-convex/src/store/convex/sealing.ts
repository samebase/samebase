// The secrets of the state rows. Alchemy's `encodeState` writes a `Redacted` value in clear text as
// `{ "__redacted__": <value> }`. A row holds `{ "__redacted__": { "__sealed__": <sealed> } }`, so a
// table view, a snapshot, or a reader that forgets to remove secrets shows no value. The key ring
// is the variable STATE_KEYS of the store deployment, and it never leaves the deployment.
//
// `state:set` and `state:setOutput` seal in an action, and the reads of a run open in a query.
// `state:readStack` and `reader:repository` give the rows as they are stored, without their
// secrets. A value without `__sealed__` is one that the reseal after a push has not reached yet.
import {
  newKeyRing,
  openSecret,
  parseKeyRing,
  sealSecret,
  type SealedSecret,
} from "../sealedSecret.ts";

export { newKeyRing };

/** The variable of the store deployment that holds the key ring. */
export const STATE_KEYS = "STATE_KEYS";

const REDACTED = "__redacted__";
const SEALED = "__sealed__";

const keyRing = () => parseKeyRing(STATE_KEYS, process.env[STATE_KEYS]);

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

/** The JSON text with each secret changed. A text without a secret stays the same text. */
const mapText = async (text: string, change: (secret: unknown) => Promise<unknown>) =>
  text.includes(REDACTED) ? JSON.stringify(await mapSecrets(JSON.parse(text), change)) : text;

const sealValue = async (value: unknown, aad: string) => ({
  [SEALED]: await sealSecret(keyRing(), { plaintext: JSON.stringify(value), aad }),
});

const openValue = async (sealed: SealedSecret, aad: string): Promise<unknown> =>
  JSON.parse(await openSecret(keyRing(), { sealed, aad }));

/** The owner of a resource row: a sealed value opens only in the row that sealed it. */
export const resourceAad = (row: { stack: string; stage: string; fqn: string }) =>
  JSON.stringify(["resource", row.stack, row.stage, row.fqn]);

/** The owner of an output row. */
export const outputAad = (row: { stack: string; stage: string }) =>
  JSON.stringify(["output", row.stack, row.stage]);

/** Seals each secret of a JSON text of `encodeState`. Only an action can call it. */
export const sealText = (text: string, aad: string) =>
  mapText(text, (secret) => sealValue(secret, aad));

/** Opens each secret of a row, for the reads of a run. */
export const openText = (text: string, aad: string) =>
  mapText(text, async (secret) => {
    const sealed = sealedIn(secret);
    return sealed === undefined ? secret : openValue(sealed, aad);
  });

/** The row with every secret sealed under the current key. Only an action can call it. */
export const resealText = (text: string, aad: string) =>
  mapText(text, async (secret) => {
    const sealed = sealedIn(secret);
    if (sealed === undefined) return sealValue(secret, aad);
    if (sealed.keyId === keyRing().current) return secret;
    return sealValue(await openValue(sealed, aad), aad);
  });
