import { describe, expect, it } from "vite-plus/test";
import {
  AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH,
  buildAuthTokenProfileCustomClaims,
  readAuthTokenProfileClaims,
  type AuthTokenProfileClaims,
} from "./authTokenClaims";

const CLAIM_VALUES = {
  blank: " ",
  invalid: 123,
  tooLong: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
  trimmed: "  Nicu  ",
  valid: "Nicu",
} as const;

const PROFILE_CLAIM_CASES: {
  expected: AuthTokenProfileClaims | null;
  input: {
    email?: unknown;
    name?: unknown;
  };
  name: string;
}[] = [
  {
    name: "keeps valid email and name claims",
    input: {
      email: "nicu@samebase.com",
      name: CLAIM_VALUES.valid,
    },
    expected: {
      email: "nicu@samebase.com",
      name: "Nicu",
    },
  },
  {
    name: "trims usable claims before putting them in JWTs",
    input: {
      email: "  nicu@samebase.com  ",
      name: CLAIM_VALUES.trimmed,
    },
    expected: {
      email: "nicu@samebase.com",
      name: "Nicu",
    },
  },
  {
    name: "keeps a valid name when email is missing",
    input: {
      name: CLAIM_VALUES.valid,
    },
    expected: {
      name: "Nicu",
    },
  },
  {
    name: "keeps a valid email when name is missing",
    input: {
      email: "nicu@samebase.com",
    },
    expected: {
      email: "nicu@samebase.com",
    },
  },
  {
    name: "rejects missing claims",
    input: {},
    expected: null,
  },
  {
    name: "rejects blank claims",
    input: {
      email: CLAIM_VALUES.blank,
      name: CLAIM_VALUES.valid,
    },
    expected: null,
  },
  {
    name: "rejects invalid claims",
    input: {
      email: CLAIM_VALUES.invalid,
      name: CLAIM_VALUES.valid,
    },
    expected: null,
  },
  {
    name: "rejects too-long claims",
    input: {
      email: CLAIM_VALUES.tooLong,
      name: CLAIM_VALUES.valid,
    },
    expected: null,
  },
];

describe("auth token claims", () => {
  it.each(PROFILE_CLAIM_CASES)("$name", ({ expected, input }) => {
    expect(readAuthTokenProfileClaims(input)).toEqual(expected);
  });

  it("builds flat Convex Auth custom claims without avatar fields", () => {
    expect(
      buildAuthTokenProfileCustomClaims({
        email: "  nicu@samebase.com  ",
        name: "Nicu",
      }),
    ).toEqual({
      email: "nicu@samebase.com",
      name: "Nicu",
    });
  });

  it("omits custom claims when a profile field is outside the JWT display contract", () => {
    expect(
      buildAuthTokenProfileCustomClaims({
        email: "nicu@samebase.com",
        name: CLAIM_VALUES.tooLong,
      }),
    ).toEqual({});
  });

  it("rejects non-object profile claim sources", () => {
    expect(readAuthTokenProfileClaims(null)).toBe(null);
  });
});
