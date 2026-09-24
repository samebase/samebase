import {
  after,
  bad,
  fail,
  good,
  literal,
  object,
  optional,
  string,
  unknown as unknownValue,
  union,
  type InferGood,
} from "@samebase/sure";
import {
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
  type AccountPresentation,
} from "./accountPresentation";

export const AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH = 256;

const authTokenProfileClaimValueSchema = after(string, (value) => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fail("blank-string");
  }
  if (value.length > AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH) {
    return fail("too-long-string");
  }
  return good(value);
});

const authTokenProfileClaimFieldsSchema = object({
  authProvider: optional(unknownValue),
  accountLabelKind: union(literal("displayName"), literal("email")),
  accountLabel: authTokenProfileClaimValueSchema,
  email: optional(unknownValue),
  githubUsername: optional(unknownValue),
  name: optional(unknownValue),
});

const authTokenProfileClaimsSchema = after(authTokenProfileClaimFieldsSchema, (claims) => {
  try {
    if (
      claims.email !== undefined ||
      claims.githubUsername !== undefined ||
      claims.name !== undefined
    ) {
      return bad("legacy-account-presentation");
    }

    let accountPresentation: AccountPresentation;
    if (claims.accountLabelKind === "displayName") {
      accountPresentation = {
        kind: "displayName",
        label: normalizeDisplayName(claims.accountLabel),
      };
    } else {
      const normalizedEmail = normalizeAccountEmail(claims.accountLabel);
      if (normalizedEmail !== claims.accountLabel) {
        return bad("noncanonical-account-email");
      }
      accountPresentation = {
        kind: "email",
        label: normalizedEmail,
      };
    }
    return good({
      accountPresentation,
    });
  } catch {
    return bad("invalid-account-presentation");
  }
});

const authTokenProfileSourceSchema = object({
  displayName: optional(string),
  email: string,
});

export type AuthTokenProfileClaims = InferGood<typeof authTokenProfileClaimsSchema>;

export function readAuthTokenProfileClaims(payload: unknown): AuthTokenProfileClaims | null {
  const [hasProfileClaims, claims] = authTokenProfileClaimsSchema(payload);
  return hasProfileClaims ? claims : null;
}

export function buildAuthTokenProfileCustomClaims(source: unknown): Record<string, string> {
  const [hasProfileSource, profileSource] = authTokenProfileSourceSchema(source);
  if (!hasProfileSource) {
    throw new Error("Account presentation source is invalid.");
  }

  const accountPresentation = resolveAccountPresentation(profileSource);
  return {
    accountLabelKind: accountPresentation.kind,
    accountLabel: accountPresentation.label,
  };
}
