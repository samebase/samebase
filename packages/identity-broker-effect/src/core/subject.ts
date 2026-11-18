import { Effect } from "effect";
import { base64url } from "jose";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { Random } from "./services.ts";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** `sha256Hex` in the core's programs. WebCrypto's digest does not fail on a string. */
export const sha256HexEffect = (input: string) => Effect.promise(() => sha256Hex(input));

/**
 * The S256 PKCE challenge of the app's verifier (RFC 7636 section 4.2), which the core computes so
 * the raw verifier never crosses the command boundary (design section 2.2).
 */
export const s256Challenge = (verifier: string) =>
  Effect.promise(() => calculatePKCECodeChallenge(verifier));

/** URL-safe random token of `bytes` random bytes. */
export const randomToken = (bytes = 32) =>
  Effect.gen(function* () {
    const random = yield* Random;
    return base64url.encode(yield* random.bytes(bytes));
  });
