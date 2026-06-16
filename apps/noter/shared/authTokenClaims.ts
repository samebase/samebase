import { isRecord } from "@noter-md/dependent/main";

export type AuthTokenProfileClaims = {
  email?: string;
  name?: string;
};

function readAuthTokenStringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function readAuthTokenProfileClaims(payload: unknown): AuthTokenProfileClaims | null {
  if (!isRecord(payload)) {
    return null;
  }

  const claims: AuthTokenProfileClaims = {};
  const name = readAuthTokenStringClaim(payload.name);
  const email = readAuthTokenStringClaim(payload.email);

  if (name !== undefined) {
    claims.name = name;
  }
  if (email !== undefined) {
    claims.email = email;
  }

  return Object.keys(claims).length > 0 ? claims : null;
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
