import { describe, expect, it } from "vite-plus/test";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import { ACCOUNT_EMAIL_MAX_LENGTH } from "../../shared/accountPresentation";
import {
  AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH,
  readAuthTokenProfileClaims,
} from "../../shared/authTokenClaims";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";

function createEmail(length: number) {
  const suffix = "@b.co";
  return "a".repeat(length - suffix.length) + suffix;
}

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
          accountLabelKind: "displayName",
          accountLabel: "Nicu",
          exp: 4100000000,
        }),
      ),
    ).toBe("Nicu");
    expect(
      runtime.readJwtPresentationLabel(
        createJwt({
          accountLabelKind: "email",
          accountLabel: "nicu@samebase.com",
          exp: -1,
        }),
      ),
    ).toBe(null);
    expect(
      runtime.readJwtPresentationLabel(
        createJwt({
          email: " NICU@SAMEBASE.COM ",
          name: "Provider name",
          exp: 4100000000,
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

  it.each(["NICU@SAMEBASE.COM", " nicu@samebase.com "])(
    "rejects a noncanonical typed email claim %j",
    (accountLabel) => {
      const runtime = createRuntime();

      expect(
        runtime.readJwtPresentationLabel(
          createJwt({
            accountLabelKind: "email",
            accountLabel,
            exp: 4100000000,
          }),
        ),
      ).toBe(null);
    },
  );

  it.each([
    { accountLabelKind: "displayName", accountLabel: "Nicu", email: 123 },
    { accountLabelKind: "displayName", accountLabel: "Nicu", email: " " },
    {
      accountLabelKind: "email",
      accountLabel: "nicu@samebase.com",
      email: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
    },
    { accountLabelKind: "displayName", accountLabel: "Nicu", name: "Provider name" },
    { accountLabelKind: "displayName", accountLabel: "Nicu", githubUsername: "octocat" },
  ])("rejects legacy presentation claims mixed with a typed pair %j", (payload) => {
    const runtime = createRuntime();
    const jwtPayload = { ...payload, exp: 4100000000 };

    expect(runtime.readJwtPayload(createJwt(jwtPayload))).toEqual({
      kind: "valid",
      profile: readAuthTokenProfileClaims(jwtPayload),
      tokenExpiresAt: 4100000000 * 1000,
    });
    expect(readAuthTokenProfileClaims(jwtPayload)).toBe(null);
  });

  it("keeps canonical email length aligned with the shared parser", () => {
    const runtime = createRuntime();
    const maximumEmailPayload = {
      accountLabelKind: "email",
      accountLabel: createEmail(ACCOUNT_EMAIL_MAX_LENGTH),
      exp: 4100000000,
    };
    const tooLongEmailPayload = {
      accountLabelKind: "email",
      accountLabel: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1),
      exp: 4100000000,
    };

    expect(runtime.readJwtPayload(createJwt(maximumEmailPayload))).toEqual({
      kind: "valid",
      profile: readAuthTokenProfileClaims(maximumEmailPayload),
      tokenExpiresAt: 4100000000 * 1000,
    });
    expect(runtime.readJwtPayload(createJwt(tooLongEmailPayload))).toEqual({
      kind: "valid",
      profile: null,
      tokenExpiresAt: 4100000000 * 1000,
    });
    expect(readAuthTokenProfileClaims(tooLongEmailPayload)).toBe(null);
  });

  it("reads the local auth presentation hint from storage and search", () => {
    const runtime = createRuntime();
    const jwt = createJwt({
      accountLabelKind: "email",
      accountLabel: "nicu@samebase.com",
      authProvider: "password",
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
        accountPresentation: {
          kind: "email",
          label: "nicu@samebase.com",
        },
        authProvider: "password",
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
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: "password",
        exp: 4100000000,
      },
      {
        accountLabelKind: "displayName",
        accountLabel: "  Nicu  ",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: " ",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: "NICU@SAMEBASE.COM",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: " nicu@samebase.com ",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: 123,
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: "netlify",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: "github",
        exp: 4100000000,
      },
      {
        accountLabelKind: "displayName",
        accountLabel: "first\nsecond",
        exp: 4100000000,
      },
      {
        email: " NICU@SAMEBASE.COM ",
        name: "Provider name",
        exp: 4100000000,
      },
      {
        email: createEmail(ACCOUNT_EMAIL_MAX_LENGTH),
        exp: 4100000000,
      },
      {
        email: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1),
        exp: 4100000000,
      },
      {
        email: 123,
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        email: "nicu@samebase.com",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: 123,
        email: "nicu@samebase.com",
        exp: 4100000000,
      },
      {
        accountLabelKind: "email",
        accountLabel: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1),
        exp: 4100000000,
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
