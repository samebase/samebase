import { Effect, Predicate, Schema } from "effect";
import { exportJWK, generateKeyPair, importJWK, type CryptoKey, type JWK } from "jose";

export const SIGNING_ALGORITHM = "RS256";

/** How long a retired key's public half stays in the JWKS: longer than any token it signed lives. */
export const KEY_OVERLAP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The content of the `IDENTITY_BROKER_KEYS` env var: one current private key and the public halves
 * of recently retired keys. `identity-broker keys` writes it. It holds no user identity: a `sub` is
 * the provider's own id, so a new key set changes no user.
 */
export type KeySet = {
  version: 1;
  keys: Array<
    | { kid: string; status: "current"; privateJwk: JWK }
    | { kid: string; status: "retired"; retiredAt: number; publicJwk: JWK }
  >;
};

const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth"] as const;

function publicHalf(jwk: JWK): JWK {
  const copy: JWK = { ...jwk };
  for (const member of PRIVATE_MEMBERS) {
    delete copy[member];
  }
  return copy;
}

function randomKid(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function freshKey(): Promise<{ kid: string; privateJwk: JWK }> {
  const kid = randomKid();
  const { privateKey } = await generateKeyPair(SIGNING_ALGORITHM, { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  return { kid, privateJwk: { ...privateJwk, kid, alg: SIGNING_ALGORITHM, use: "sig" } };
}

/** A new key set: one current key. */
export async function createKeySet(): Promise<KeySet> {
  const key = await freshKey();
  return { version: 1, keys: [{ status: "current", ...key }] };
}

/**
 * Rotation: the current key keeps only its public half and a retirement time, a new key becomes
 * current, and keys retired longer than the overlap window drop out.
 */
export async function rotateKeySet(keySet: KeySet, now = Date.now()): Promise<KeySet> {
  const key = await freshKey();
  const kept = keySet.keys.flatMap((entry) => {
    if (entry.status === "current") {
      return [
        {
          kid: entry.kid,
          status: "retired" as const,
          retiredAt: now,
          publicJwk: publicHalf(entry.privateJwk),
        },
      ];
    }
    return entry.retiredAt + KEY_OVERLAP_MS > now ? [entry] : [];
  });
  return { version: 1, keys: [{ status: "current", ...key }, ...kept] };
}

/**
 * Unpadded base64url (RFC 7515 section 2) of a length that decodes, so not 4k + 1: the encoding of
 * JWK members (RFC 7518 section 6.3).
 */
const BASE64URL = /^(?:[A-Za-z0-9_-]{4})*[A-Za-z0-9_-]{2,4}$/;

/** The members of an RSA private JWK (RFC 7518 section 6.3); a current key carries every one. */
const RSA_PRIVATE_MEMBERS = ["n", "e", "d", "p", "q", "dp", "dq", "qi"] as const;
const RSA_PUBLIC_MEMBERS = ["n", "e"] as const;
/** What `createKeySet` writes beside the key material, and the JWKS publishes. */
const JWK_PARAMETERS = ["kid", "alg", "use"] as const;

/** `IDENTITY_BROKER_KEYS` is not a complete key set. The message names the wrong part. */
export class KeySetInvalid extends Schema.TaggedError<KeySetInvalid>()("KeySetInvalid", {
  message: Schema.String,
}) {}

/** A JSON object's members, or none for any other value. */
const membersOf = (value: unknown) => (Predicate.isObject(value) ? value : {});

const parseJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

/**
 * An RSA JWK whose `members` are base64url strings, rebuilt from those members and the string
 * parameters, so a private member left in a retired public key never reaches the JWKS. `where`
 * names the JWK in the error.
 */
const rsaJwk = Effect.fnUntraced(function* (
  value: unknown,
  where: string,
  members: ReadonlyArray<(typeof RSA_PRIVATE_MEMBERS)[number]>,
) {
  const record = membersOf(value);
  if (record["kty"] !== "RSA") {
    return yield* new KeySetInvalid({ message: `${where}.kty must be "RSA"` });
  }
  const jwk: JWK = { kty: "RSA" };
  for (const name of members) {
    const member = record[name];
    if (!Predicate.isString(member) || !BASE64URL.test(member)) {
      return yield* new KeySetInvalid({
        message: `${where}.${name} must be a non-empty base64url string`,
      });
    }
    jwk[name] = member;
  }
  for (const name of JWK_PARAMETERS) {
    const parameter = record[name];
    if (Predicate.isString(parameter)) {
      jwk[name] = parameter;
    } else if (parameter !== undefined) {
      return yield* new KeySetInvalid({ message: `${where}.${name} must be a string` });
    }
  }
  return jwk;
});

/** One entry of the key set's `keys`. */
const parseKey = Effect.fnUntraced(function* (entry: unknown) {
  const key = membersOf(entry);
  const kid = key["kid"];
  if (!Predicate.isString(kid)) {
    return yield* new KeySetInvalid({ message: "IDENTITY_BROKER_KEYS has a key without kid" });
  }
  const where = `IDENTITY_BROKER_KEYS key "${kid}"`;
  if (key["status"] === "current") {
    const current: KeySet["keys"][number] = {
      kid,
      status: "current",
      privateJwk: yield* rsaJwk(key["privateJwk"], `${where} privateJwk`, RSA_PRIVATE_MEMBERS),
    };
    return current;
  }
  const retiredAt = key["retiredAt"];
  if (key["status"] === "retired" && Predicate.isNumber(retiredAt)) {
    const retired: KeySet["keys"][number] = {
      kid,
      status: "retired",
      retiredAt,
      publicJwk: yield* rsaJwk(key["publicJwk"], `${where} publicJwk`, RSA_PUBLIC_MEMBERS),
    };
    return retired;
  }
  return yield* new KeySetInvalid({ message: `${where} is neither current nor retired` });
});

/**
 * Parses the env var. Fails on anything that is not a complete key set: a hub without keys is
 * down. It checks the shape only; `assertKeySetUsable` signs and verifies with the keys.
 */
export const parseKeySet = Effect.fnUntraced(function* (raw: string | undefined) {
  if (raw === undefined || raw.trim().length === 0) {
    return yield* new KeySetInvalid({
      message: "IDENTITY_BROKER_KEYS is not set; run `identity-broker keys` and store its output",
    });
  }
  const record = membersOf(
    yield* parseJson(raw).pipe(
      Effect.mapError(() => new KeySetInvalid({ message: "IDENTITY_BROKER_KEYS is not JSON" })),
    ),
  );
  const entries = record["keys"];
  if (record["version"] !== 1 || !Array.isArray(entries)) {
    return yield* new KeySetInvalid({
      message: "IDENTITY_BROKER_KEYS is not a version 1 key set",
    });
  }
  const keys = yield* Effect.forEach(entries, parseKey);
  if (keys.filter((key) => key.status === "current").length !== 1) {
    return yield* new KeySetInvalid({
      message: "IDENTITY_BROKER_KEYS must hold exactly one current key",
    });
  }
  const keySet: KeySet = { version: 1, keys };
  return keySet;
});

export function currentKey(keySet: KeySet): { kid: string; privateJwk: JWK } {
  const key = keySet.keys.find((entry) => entry.status === "current");
  if (key === undefined) {
    throw new Error("The key set has no current key");
  }
  return { kid: key.kid, privateJwk: key.privateJwk };
}

export async function importSigningKey(keySet: KeySet): Promise<{ kid: string; key: CryptoKey }> {
  const { kid, privateJwk } = currentKey(keySet);
  const key = await importJWK(privateJwk, SIGNING_ALGORITHM);
  if (typeof key === "string" || !("type" in key)) {
    throw new Error("The current key is not an asymmetric key");
  }
  return { kid, key };
}

/**
 * The public JWKS: the current key and the retired keys still inside the overlap window, each under
 * its entry's kid, the kid the signer writes into a token header, whatever kid its JWK carries.
 */
export function publicJwks(
  keySet: KeySet,
  now = Date.now(),
): { keys: Array<JWK & { kid: string }> } {
  return {
    keys: keySet.keys.flatMap((entry) => {
      if (entry.status === "current") {
        return [{ ...publicHalf(entry.privateJwk), kid: entry.kid }];
      }
      return entry.retiredAt + KEY_OVERLAP_MS > now ? [{ ...entry.publicJwk, kid: entry.kid }] : [];
    }),
  };
}
