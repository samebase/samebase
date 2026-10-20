import { describe, expect, it } from "vite-plus/test";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";

function readHint(args: { entries?: Record<string, string>; search?: string }) {
  const runtime = Inlineable_createAppAuthPresentationRuntime({ URLSearchParams });
  return runtime.readLocalAppAuthPresentationHint({
    search: args.search ?? "",
    storage: { getItem: (key) => args.entries?.[key] ?? null },
    storageNamespace: TEST_STORAGE_NAMESPACE,
  });
}

describe("app auth presentation runtime", () => {
  it("uses the namespaced Convex Auth refresh-token key", () => {
    expect(
      Inlineable_createAppAuthPresentationRuntime().convexAuthRefreshTokenStorageKey(
        TEST_STORAGE_NAMESPACE,
      ),
    ).toBe("__convexAuthRefreshToken_httpsexampleconvexcloud");
  });

  it("keeps the presentation pending while a refresh token can restore the session", () => {
    expect(
      readHint({ entries: { __convexAuthRefreshToken_httpsexampleconvexcloud: "refresh" } }),
    ).toEqual({ kind: "pending" });
  });

  it("reads a browser without a session as signed out", () => {
    expect(readHint({})).toEqual({ kind: "signedOut" });
    expect(readHint({ entries: { __convexAuthJWT_httpsexampleconvexcloud: "access" } })).toEqual({
      kind: "signedOut",
    });
  });

  it.each(["?auth=github", "?auth=google", "?convexAuthCode=code", "?convexAuthError=expired"])(
    "keeps the presentation pending during the auth flow in %s",
    (search) => {
      expect(readHint({ search })).toEqual({ kind: "pending" });
    },
  );

  it("keeps the presentation pending when storage cannot be read", () => {
    const runtime = Inlineable_createAppAuthPresentationRuntime();
    expect(
      runtime.readLocalAppAuthPresentationHint({
        search: "",
        storage: {
          getItem: () => {
            throw new Error("Storage is blocked.");
          },
        },
        storageNamespace: TEST_STORAGE_NAMESPACE,
      }),
    ).toEqual({ kind: "pending" });
  });
});
