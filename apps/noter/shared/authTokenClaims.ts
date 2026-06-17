import { after, bad, good, object, optional, string, sure, type InferGood } from "@samebase/sure";

const nonBlankAuthTokenStringClaim = after(string, (value) =>
  value.trim().length > 0 ? good(value) : bad("blank-string"),
);

const optionalAuthTokenStringClaim = sure(
  (value) => {
    const [isStringClaim, claim] = nonBlankAuthTokenStringClaim(value);
    return isStringClaim ? good(claim) : good(undefined);
  },
  {
    type: "auth-token-optional-string-claim" as const,
  },
);

const authTokenProfileClaimFieldsSchema = object({
  email: optional(optionalAuthTokenStringClaim),
  name: optional(optionalAuthTokenStringClaim),
});

type AuthTokenProfileClaimFields = InferGood<typeof authTokenProfileClaimFieldsSchema>;

const authTokenProfileClaimsSchema = after(authTokenProfileClaimFieldsSchema, (claims) => {
  const profileClaims: AuthTokenProfileClaimFields = {};

  if (claims.name !== undefined) {
    profileClaims.name = claims.name;
  }
  if (claims.email !== undefined) {
    profileClaims.email = claims.email;
  }

  return Object.keys(profileClaims).length > 0
    ? good(profileClaims)
    : bad("missing-profile-claims");
});

export type AuthTokenProfileClaims = InferGood<typeof authTokenProfileClaimsSchema>;

export function readAuthTokenProfileClaims(payload: unknown): AuthTokenProfileClaims | null {
  const [hasProfileClaims, claims] = authTokenProfileClaimsSchema(payload);
  return hasProfileClaims ? claims : null;
}

export function buildAuthTokenProfileCustomClaims(source: unknown): Record<string, string> {
  const profileClaims = readAuthTokenProfileClaims(source);
  const claims: Record<string, string> = {};
  if (profileClaims?.name !== undefined) {
    claims.name = profileClaims.name;
  }
  if (profileClaims?.email !== undefined) {
    claims.email = profileClaims.email;
  }
  return claims;
}
