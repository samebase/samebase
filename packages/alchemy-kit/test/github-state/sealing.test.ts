// The opening of secrets that kit 0.2 sealed, and the parse of its key.
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import { openLegacyRecord, parseKey } from "../../src/github-state/sealing.ts";
import { KIT_0_2_2_KEY, KIT_0_2_2_PATH, KIT_0_2_2_RECORD } from "./kit-0.2.2-record.ts";

const newKeyText = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const open = (keyText: string | undefined, objectKey: string, text: string) =>
  openLegacyRecord(parseKey(keyText), objectKey, text);

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

describe("openLegacyRecord", () => {
  it("opens a record that kit 0.2.2 sealed into plaintext secrets", async () => {
    const text = await Effect.runPromise(open(KIT_0_2_2_KEY, KIT_0_2_2_PATH, KIT_0_2_2_RECORD));
    expect(JSON.parse(text)).toMatchObject({
      attr: {
        deployKey: { __redacted__: "the-deploy-key" },
        urls: { cloud: "https://example.test" },
      },
    });
  });

  it("leaves text without such a secret as it is, and asks for no key", async () => {
    const sealed = `alchemy:sealed:1:passphrase:AAAA\n{"attr":{"x":{"__sealed__":"AAAA"}}}`;
    const lease = JSON.stringify({ token: "t", expiresAt: 1 });
    const plain = JSON.stringify({ attr: { x: { __redacted__: "plain" } } });
    for (const text of [sealed, lease, plain, "not json"]) {
      expect(await Effect.runPromise(open(undefined, KIT_0_2_2_PATH, text))).toBe(text);
    }
  });

  it("fails without the key, and says what to do", async () => {
    const error = await failure(open(undefined, KIT_0_2_2_PATH, KIT_0_2_2_RECORD));
    expect(error.message).toContain("secrets that @samebase/alchemy-kit 0.2 sealed");
    expect(error.message).toContain("ALCHEMY_GITHUB_STATE_KEY");
  });

  it("does not open with another key, or in another record", async () => {
    const other = await failure(open(newKeyText(), KIT_0_2_2_PATH, KIT_0_2_2_RECORD));
    expect(other.message).toContain(`a secret in ${KIT_0_2_2_PATH} does not open`);
    const moved = await failure(open(KIT_0_2_2_KEY, "owner/name/staging/X.json", KIT_0_2_2_RECORD));
    expect(moved.message).toContain("does not open");
  });
});

describe("parseKey", () => {
  it("takes base64 of 32 bytes, with the newline of openssl", async () => {
    await expect(Effect.runPromise(parseKey(`${newKeyText()}\n`))).resolves.toBeDefined();
  });

  it("fails on a key that is not base64 of 32 bytes, and never quotes it", async () => {
    const short = Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("base64");
    const urlSafe = `${"-".repeat(43)}=`;
    for (const text of [short, urlSafe, "not a key"]) {
      const error = await failure(parseKey(text));
      expect(error.message).toContain("is not base64 of 32 bytes");
      expect(error.message).not.toContain(text);
    }
  });
});
