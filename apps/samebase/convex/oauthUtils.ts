import { bytesToBase64Url } from "../shared/base64";

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function randomToken(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function readOptionalEnv(key: string): string | null {
  const value = process.env[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readRequiredEnv(key: string): string {
  const value = readOptionalEnv(key);
  if (value === null) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
