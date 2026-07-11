import {
  after,
  bad,
  good,
  literal,
  object,
  optional,
  string,
  union,
  type InferGood,
} from "@samebase/sure";
import {
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
} from "./accountPresentation";

export const AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH = 256;

const authTokenAuthProviderSchema = union(
  literal("google"),
  union(literal("github"), literal("password")),
);

const authTokenProfileClaimValueSchema = after(string, (value) => {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return bad("blank-string");
  }
  if (trimmedValue.length > AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH) {
    return bad("too-long-string");
  }
  return good(trimmedValue);
});

const authTokenProfileClaimFieldsSchema = object({
  authProvider: optional(authTokenAuthProviderSchema),
  accountLabelKind: union(literal("displayName"), literal("email")),
  accountLabel: authTokenProfileClaimValueSchema,
});

const authTokenProfileClaimsSchema = after(authTokenProfileClaimFieldsSchema, (claims) => {
  try {
    const accountPresentation =
      claims.accountLabelKind === "displayName"
        ? {
            kind: "displayName" as const,
            label: normalizeDisplayName(claims.accountLabel),
          }
        : {
            kind: "email" as const,
            label: normalizeAccountEmail(claims.accountLabel),
          };
    return good({
      ...(claims.authProvider === undefined ? {} : { authProvider: claims.authProvider }),
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

export type AuthTokenAuthProvider = InferGood<typeof authTokenAuthProviderSchema>;
export type AuthTokenProfileClaims = InferGood<typeof authTokenProfileClaimsSchema>;

export function readAuthTokenProfileClaims(payload: unknown): AuthTokenProfileClaims | null {
  const [hasProfileClaims, claims] = authTokenProfileClaimsSchema(payload);
  return hasProfileClaims ? claims : null;
}

export function buildAuthTokenProfileCustomClaims(
  source: unknown,
  authProvider?: AuthTokenAuthProvider | null,
): Record<string, string> {
  const [hasProfileSource, profileSource] = authTokenProfileSourceSchema(source);
  if (!hasProfileSource) {
    return {};
  }

  try {
    const accountPresentation = resolveAccountPresentation({
      email: normalizeAccountEmail(profileSource.email),
      ...(profileSource.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(profileSource.displayName) }),
    });
    return {
      accountLabelKind: accountPresentation.kind,
      accountLabel: accountPresentation.label,
      ...(authProvider === undefined || authProvider === null ? {} : { authProvider }),
    };
  } catch {
    return {};
  }
}
