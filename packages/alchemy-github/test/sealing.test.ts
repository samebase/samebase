// The sealing of the secrets of a state record, and the parse of its key.
import { encodeState } from "alchemy/State";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import { openRecord, parseKey, sealRecord } from "../src/sealing.ts";

const OBJECT_KEY = "app/prod/Secret.json";

const newKeyText = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const newKey = () => Effect.runPromise(parseKey(newKeyText()));

/** A record as the released BucketState writes it. */
const recordText = (value: unknown) => JSON.stringify(encodeState(value), null, 2);

const record = recordText({
  status: "created",
  fqn: "Secret",
  props: { bytes: 16, labels: ["a", "b"] },
  attr: {
    text: Redacted.make("the-secret-text"),
    list: [Redacted.make("in-an-array"), { deep: Redacted.make("in-an-object") }],
    number: Redacted.make(42),
    object: Redacted.make({ user: "u", password: "in-a-secret-object" }),
  },
});

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

describe("sealRecord and openRecord", () => {
  it("opens to the text that the store wrote", async () => {
    const key = await newKey();
    const sealed = await Effect.runPromise(sealRecord(key, OBJECT_KEY, record));
    expect(sealed).not.toBe(record);
    expect(await Effect.runPromise(openRecord(key, OBJECT_KEY, sealed))).toBe(record);
  });

  it("keeps no plaintext of a secret in the sealed text", async () => {
    const sealed = await Effect.runPromise(sealRecord(await newKey(), OBJECT_KEY, record));
    for (const secret of ["the-secret-text", "in-an-array", "in-an-object", "in-a-secret-object"]) {
      expect(sealed).not.toContain(secret);
    }
  });

  it("seals each secret, nested or not, and keeps every other field as it was", async () => {
    const sealed: unknown = JSON.parse(
      await Effect.runPromise(sealRecord(await newKey(), OBJECT_KEY, record)),
    );
    const sealedValue = {
      __redacted__: { __sealed__: expect.stringMatching(/^v1\.[\w-]+\.[\w-]+$/) },
    };
    expect(sealed).toEqual({
      status: "created",
      fqn: "Secret",
      props: { bytes: 16, labels: ["a", "b"] },
      attr: {
        text: sealedValue,
        list: [sealedValue, { deep: sealedValue }],
        number: sealedValue,
        object: sealedValue,
      },
    });
  });

  it("draws a new IV for each seal of one record", async () => {
    const key = await newKey();
    const first = await Effect.runPromise(sealRecord(key, OBJECT_KEY, record));
    const second = await Effect.runPromise(sealRecord(key, OBJECT_KEY, record));
    expect(first).not.toBe(second);
  });

  it("leaves a record without a secret as the same text", async () => {
    const lease = JSON.stringify({ token: "t", expiresAt: 1 });
    const key = await newKey();
    expect(await Effect.runPromise(sealRecord(key, "app/prod/__lease__.json", lease))).toBe(lease);
    expect(await Effect.runPromise(openRecord(key, "app/prod/__lease__.json", lease))).toBe(lease);
  });

  it("does not open with another key", async () => {
    const sealed = await Effect.runPromise(sealRecord(await newKey(), OBJECT_KEY, record));
    const error = await failure(openRecord(await newKey(), OBJECT_KEY, sealed));
    expect(error._tag).toBe("StateStoreError");
    expect(error.message).toContain(`a secret in ${OBJECT_KEY} does not open`);
  });

  it("does not open in another record", async () => {
    const key = await newKey();
    const sealed = await Effect.runPromise(sealRecord(key, OBJECT_KEY, record));
    const error = await failure(openRecord(key, "app/staging/Secret.json", sealed));
    expect(error.message).toContain("a secret in app/staging/Secret.json does not open");
  });

  it("refuses a secret that is not sealed", async () => {
    const error = await failure(openRecord(await newKey(), OBJECT_KEY, record));
    expect(error.message).toContain(`${OBJECT_KEY} holds a secret that is not sealed`);
  });
});

describe("parseKey", () => {
  it("takes base64 of 32 bytes, with the newline of openssl", async () => {
    await expect(Effect.runPromise(parseKey(`${newKeyText()}\n`))).resolves.toBeDefined();
  });

  it("fails without a key, and says how to make one", async () => {
    for (const text of [undefined, "", " \n"]) {
      const error = await failure(parseKey(text));
      expect(error.message).toContain("ALCHEMY_GITHUB_STATE_KEY is not set");
      expect(error.message).toContain("openssl rand -base64 32");
    }
  });

  it("fails on a key that is not base64 of 32 bytes, and never quotes it", async () => {
    const short = Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("base64");
    const long = Buffer.from(crypto.getRandomValues(new Uint8Array(33))).toString("base64");
    const urlSafe = `${"-".repeat(43)}=`;
    for (const text of [short, long, urlSafe, "not a key"]) {
      const error = await failure(parseKey(text));
      expect(error.message).toContain("is not base64 of 32 bytes");
      expect(error.message).not.toContain(text);
    }
  });
});
