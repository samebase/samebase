import { after, bad, good, object, optional, string, type InferGood } from "@samebase/sure";

export const AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH = 256;

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
  email: optional(authTokenProfileClaimValueSchema),
  name: optional(authTokenProfileClaimValueSchema),
});

const authTokenProfileClaimsSchema = after(authTokenProfileClaimFieldsSchema, (claims) => {
  if (claims.name === undefined && claims.email === undefined) {
    return bad("missing-profile-claims");
  }

  return good(claims);
});

export type AuthTokenProfileClaims = InferGood<typeof authTokenProfileClaimsSchema>;

export function readAuthTokenProfileClaims(payload: unknown): AuthTokenProfileClaims | null {
  const [hasProfileClaims, claims] = authTokenProfileClaimsSchema(payload);
  return hasProfileClaims ? claims : null;
}

export function buildAuthTokenProfileCustomClaims(source: unknown): Record<string, string> {
  const profileClaims = readAuthTokenProfileClaims(source);
  if (profileClaims === null) {
    return {};
  }

  const claims: Record<string, string> = {};
  if (profileClaims.name !== undefined) {
    claims.name = profileClaims.name;
  }
  if (profileClaims.email !== undefined) {
    claims.email = profileClaims.email;
  }
  return claims;
}
