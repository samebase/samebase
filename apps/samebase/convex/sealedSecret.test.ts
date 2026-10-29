import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { openSecret, sealSecret } from "./sealedSecret";

/** Throwaway keys: 32 bytes each, in base64. */
const firstKey = `${"A".repeat(43)}=`;
const secondKey = `${"B".repeat(43)}=`;
/** sealSecret takes an action context only so that queries and mutations cannot call it. */
const actionCtx = { runAction: vi.fn() };
const aad = "organizationProviderCredentials/organization-1/convex.auth.credential";

function stubKeyRing(ring: unknown) {
  vi.stubEnv("CREDENTIAL_KEYS", JSON.stringify(ring));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sealed secrets", () => {
  it("opens a sealed value with the same AAD, and never stores the plaintext", async () => {
    stubKeyRing({ current: "first", keys: { first: firstKey } });

    const sealed = await sealSecret(actionCtx, { plaintext: "test-token", aad });
    const again = await sealSecret(actionCtx, { plaintext: "test-token", aad });

    expect(sealed.keyId).toBe("first");
    expect(JSON.stringify(sealed)).not.toContain("test-token");
    expect(again.iv).not.toBe(sealed.iv);
    await expect(openSecret({ sealed, aad })).resolves.toBe("test-token");
  });

  it("opens a value sealed under an older key after the current key changes", async () => {
    stubKeyRing({ current: "first", keys: { first: firstKey } });
    const sealed = await sealSecret(actionCtx, { plaintext: "test-token", aad });

    stubKeyRing({ current: "second", keys: { first: firstKey, second: secondKey } });

    await expect(openSecret({ sealed, aad })).resolves.toBe("test-token");
    await expect(sealSecret(actionCtx, { plaintext: "test-token", aad })).resolves.toMatchObject({
      keyId: "second",
    });
  });

  it("does not open a value under another AAD", async () => {
    stubKeyRing({ current: "first", keys: { first: firstKey } });
    const sealed = await sealSecret(actionCtx, { plaintext: "test-token", aad });

    await expect(
      openSecret({
        sealed,
        aad: "organizationProviderCredentials/organization-2/convex.auth.credential",
      }),
    ).rejects.toThrow();
  });

  it("does not open a changed ciphertext", async () => {
    stubKeyRing({ current: "first", keys: { first: firstKey } });
    const sealed = await sealSecret(actionCtx, { plaintext: "test-token", aad });
    const changed = `${sealed.ciphertext.startsWith("A") ? "B" : "A"}${sealed.ciphertext.slice(1)}`;

    await expect(openSecret({ sealed: { ...sealed, ciphertext: changed }, aad })).rejects.toThrow();
  });

  it("does not open a value whose key id is not in the ring", async () => {
    stubKeyRing({ current: "first", keys: { first: firstKey } });
    const sealed = await sealSecret(actionCtx, { plaintext: "test-token", aad });

    await expect(openSecret({ sealed: { ...sealed, keyId: "retired" }, aad })).rejects.toThrow(
      'CREDENTIAL_KEYS has no key "retired".',
    );
  });

  it.each([
    {
      name: "a current key id without a key",
      ring: JSON.stringify({ current: "second", keys: { first: firstKey } }),
      error: 'CREDENTIAL_KEYS has no key for its current key id "second".',
    },
    {
      name: "a key that is not 32 bytes",
      ring: JSON.stringify({ current: "first", keys: { first: `${"A".repeat(22)}==` } }),
      error: "CREDENTIAL_KEYS must be",
    },
    {
      name: "a value that is not JSON",
      ring: `{"current":"first","keys":{"first":"${firstKey}"}`,
      error: "CREDENTIAL_KEYS is missing or is not JSON.",
    },
  ])("fails closed on $name without quoting the keys", async ({ ring, error }) => {
    vi.stubEnv("CREDENTIAL_KEYS", ring);

    const failure = await sealSecret(actionCtx, { plaintext: "test-token", aad }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain(error);
    expect(String(failure)).not.toContain(firstKey);
  });
});
