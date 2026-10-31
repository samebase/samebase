import { base64url } from "jose";

/**
 * The pairwise subject of OIDC Core 8.1 with the app as the sector: deterministic, not reversible,
 * and the same for every deployment of an app.
 */
export async function pairwiseSubject(args: {
  appId: string;
  connector: string;
  upstreamId: string;
  salt: string;
}): Promise<string> {
  const input = `${args.appId}\u0000${args.connector}\u0000${args.upstreamId}\u0000${args.salt}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url.encode(new Uint8Array(digest));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** URL-safe random token of `bytes` random bytes. */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return base64url.encode(buffer);
}
