// AES-256-GCM sealing under a key ring, the same format as the credentials of Samebase.
import { describe, expect, it } from "vitest";
import {
  newKeyRing,
  openSecret,
  parseKeyRing,
  sealSecret,
  type SealedSecret,
} from "../src/store/sealedSecret.ts";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const ring = () => parseKeyRing("KEYS", newKeyRing());

describe("sealed secrets", () => {
  it("opens what it sealed, with no clear text in the sealed object", async () => {
    const keys = ring();
    const sealed = await sealSecret(keys, { plaintext: "the-value", aad: "owner" });
    expect(sealed.keyId).toBe(keys.current);
    expect(JSON.stringify(sealed)).not.toContain("the-value");
    expect(await openSecret(keys, { sealed, aad: "owner" })).toBe("the-value");
  });

  it("opens text outside ASCII and an empty value", async () => {
    const keys = ring();
    for (const plaintext of ["pässwörd ✓ 🔑", ""]) {
      const sealed = await sealSecret(keys, { plaintext, aad: "owner" });
      expect(await openSecret(keys, { sealed, aad: "owner" })).toBe(plaintext);
    }
  });

  it("draws a new IV for each seal of one value", async () => {
    const keys = ring();
    const first = await sealSecret(keys, { plaintext: "same", aad: "owner" });
    const second = await sealSecret(keys, { plaintext: "same", aad: "owner" });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("fails for another owner, a changed value, and a key that left the ring", async () => {
    const keys = ring();
    const sealed = await sealSecret(keys, { plaintext: "the-value", aad: "owner" });
    await expect(openSecret(keys, { sealed, aad: "other" })).rejects.toThrow();
    const changed: SealedSecret = {
      ...sealed,
      ciphertext: `${sealed.ciphertext.startsWith("A") ? "B" : "A"}${sealed.ciphertext.slice(1)}`,
    };
    await expect(openSecret(keys, { sealed: changed, aad: "owner" })).rejects.toThrow();
    await expect(openSecret(ring(), { sealed, aad: "owner" })).rejects.toThrow("has no key");
  });

  it("opens with the key that the sealed object names, after the current key changed", async () => {
    const keys = parseKeyRing("KEYS", JSON.stringify({ current: "old", keys: { old: KEY } }));
    const sealed = await sealSecret(keys, { plaintext: "the-value", aad: "owner" });
    const rotated = parseKeyRing(
      "KEYS",
      JSON.stringify({ current: "new", keys: { old: KEY, new: KEY.replace("A", "B") } }),
    );
    expect(await openSecret(rotated, { sealed, aad: "owner" })).toBe("the-value");
    expect((await sealSecret(rotated, { plaintext: "x", aad: "owner" })).keyId).toBe("new");
  });

  it("fails closed on a bad key ring, and no error quotes the text", () => {
    const secret = "not-a-key-but-a-secret";
    for (const text of [undefined, "", "{", secret]) {
      expect(() => parseKeyRing("KEYS", text)).toThrow("KEYS is missing or is not JSON.");
    }
    for (const value of [
      [],
      {},
      { current: "a" },
      { current: 1, keys: {} },
      { current: "a", keys: { a: secret } },
      { current: "a", keys: { a: 1 } },
    ]) {
      const text = JSON.stringify(value);
      expect(() => parseKeyRing("KEYS", text)).toThrow("KEYS must be");
      try {
        parseKeyRing("KEYS", text);
      } catch (error) {
        expect(String(error)).not.toContain(secret);
      }
    }
    expect(() => parseKeyRing("KEYS", JSON.stringify({ current: "b", keys: { a: KEY } }))).toThrow(
      "KEYS has no key for its current key id.",
    );
  });

  it("makes a key ring with one 32-byte key", () => {
    const { current, keys } = ring();
    expect(keys.get(current)).toHaveLength(32);
    expect(keys.size).toBe(1);
    expect(ring().current).not.toBe(current);
  });
});
