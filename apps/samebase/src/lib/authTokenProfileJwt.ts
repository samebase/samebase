import {
  readAuthTokenProfileClaims,
  type AuthTokenProfileClaims,
} from "../../shared/authTokenClaims";

function decodeBase64UrlJson(base64UrlValue: string) {
  const base64 = base64UrlValue.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = window.atob(paddedBase64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function readCurrentAuthTokenProfileClaims(token: string): AuthTokenProfileClaims | null {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(decodeBase64UrlJson(segments[1]));
    if (payload === null || typeof payload !== "object") {
      return null;
    }

    const expDescriptor = Object.getOwnPropertyDescriptor(payload, "exp");
    if (expDescriptor !== undefined) {
      if (!("value" in expDescriptor)) {
        return null;
      }
      const exp: unknown = expDescriptor.value;
      if (typeof exp !== "number" || !Number.isFinite(exp) || exp * 1000 <= Date.now()) {
        return null;
      }
    }

    return readAuthTokenProfileClaims(payload);
  } catch {
    return null;
  }
}
