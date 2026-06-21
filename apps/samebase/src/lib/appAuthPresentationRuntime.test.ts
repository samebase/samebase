import { describe, expect, it } from "vite-plus/test";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import {
  AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH,
  readAuthTokenProfileClaims,
} from "../../shared/authTokenClaims";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
}

function createRuntime() {
  return Inlineable_createAppAuthPresentationRuntime({
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
    now: () => 0,
    textDecoder: new TextDecoder(),
  });
}

describe("app auth presentation runtime", () => {
  it("exposes namespaced Convex Auth storage keys", () => {
    const runtime = createRuntime();

    expect(runtime.convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE)).toBe(
      "__convexAuthJWT_httpsexampleconvexcloud",
    );
    expect(runtime.convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE)).toBe(
      "__convexAuthRefreshToken_httpsexampleconvexcloud",
    );
  });

  it("reads the JWT presentation label from the reusable runtime", () => {
    const runtime = createRuntime();

    expect(
      runtime.readJwtPresentationLabel(
        createJwt({
          email: "nicu@samebase.com",
          exp: 4100000000,
          name: "Nicu",
        }),
      ),
    ).toBe("nicu@samebase.com");
    expect(
      runtime.readJwtPresentationLabel(
        createJwt({
          email: "nicu@samebase.com",
          exp: -1,
          name: "Nicu",
        }),
      ),
    ).toBe(null);
    expect(
      runtime.readJwtPresentationLabel(
        createJwt({
          exp: 4100000000,
        }),
      ),
    ).toBe(null);
  });

  it("reads the local auth presentation hint from storage and search", () => {
    const runtime = createRuntime();
    const jwt = createJwt({
      email: "nicu@samebase.com",
      exp: 4100000000,
    });
    const entries = new Map([[runtime.convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), jwt]]);

    expect(
      runtime.readLocalAppAuthPresentationHint({
        search: "",
        storage: {
          getItem: (key) => entries.get(key) ?? null,
        },
        storageNamespace: TEST_STORAGE_NAMESPACE,
      }),
    ).toEqual({
      kind: "present",
      label: "nicu@samebase.com",
      profile: {
        email: "nicu@samebase.com",
      },
    });
  });

  it("does not present a JWT without profile claims", () => {
    const runtime = createRuntime();
    const jwt = createJwt({
      exp: 4100000000,
    });
    const entries = new Map([[runtime.convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), jwt]]);

    expect(
      runtime.readLocalAppAuthPresentationHint({
        search: "",
        storage: {
          getItem: (key) => entries.get(key) ?? null,
        },
        storageNamespace: TEST_STORAGE_NAMESPACE,
      }),
    ).toEqual({
      kind: "signedOut",
    });
  });

  it("keeps JWT profile claim parsing aligned with the sure schema", () => {
    const runtime = createRuntime();
    const payloads = [
      {
        email: "nicu@samebase.com",
        exp: 4100000000,
        name: "Nicu",
      },
      {
        email: "  nicu@samebase.com  ",
        exp: 4100000000,
        name: "  Nicu  ",
      },
      {
        email: " ",
        exp: 4100000000,
        name: "Nicu",
      },
      {
        email: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
        exp: 4100000000,
        name: "Nicu",
      },
      {
        email: "nicu@samebase.com",
        exp: 4100000000,
        name: 123,
      },
      {
        email: " ",
        exp: 4100000000,
        name: "",
      },
    ];

    for (const payload of payloads) {
      expect(runtime.readJwtPayload(createJwt(payload))).toEqual({
        kind: "valid",
        profile: readAuthTokenProfileClaims(payload),
        tokenExpiresAt: 4100000000 * 1000,
      });
    }
  });
});
