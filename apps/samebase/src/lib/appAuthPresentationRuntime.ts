import { type AuthTokenProfileClaims } from "../../shared/authTokenClaims";

type AppAuthPresentationSearchParams = {
  get(name: string): string | null;
};
type AppAuthPresentationSearchParamsConstructor = new (
  search: string,
) => AppAuthPresentationSearchParams;

export type AppAuthPresentationRuntimeHost = {
  atob?: (value: string) => string;
  now?: () => number;
  textDecoder?: { decode(bytes: Uint8Array): string };
  URLSearchParams?: AppAuthPresentationSearchParamsConstructor;
};

export type AppAuthPresentationRuntimeJwtPayload =
  | { kind: "invalid" }
  | {
      kind: "valid";
      profile: AuthTokenProfileClaims | null;
      tokenExpiresAt: number | null;
    };

export type AppAuthPresentationRuntimeLocalHint =
  | { kind: "pending" }
  | {
      kind: "present";
      label: string;
      profile: AuthTokenProfileClaims;
    }
  | { kind: "signedOut" };

/**
 * Inline-safe auth presentation runtime.
 *
 * This factory is serialized into the document head with `Function#toString`
 * by `buildAppAuthPresentationPrehydrationScript`, and is also imported by the
 * hydrated React app. Keep it self-contained: no runtime imports, no closed-over
 * module values, and no dependencies on bundled code. Any value it needs before
 * hydration must come from the optional `host` argument, browser globals, or
 * functions defined inside this factory.
 *
 * Returning the helpers lets the prehydration script and React auth state share
 * storage-key derivation, JWT decoding, expiry handling, profile-label reading,
 * and active auth-flow detection without duplicating the parser in two places.
 */
export function Inlineable_createAppAuthPresentationRuntime(
  host: AppAuthPresentationRuntimeHost = {},
) {
  // Mirrors AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH; appAuthPresentationRuntime.test.ts guards drift.
  const authTokenProfileClaimMaxLength = 256;
  const convexAuthJwtStorageKeyPrefix = "__convexAuthJWT";
  const convexAuthRefreshTokenStorageKeyPrefix = "__convexAuthRefreshToken";

  function getStorageSuffix(storageNamespace: string) {
    return storageNamespace.replace(/[^a-zA-Z0-9]/g, "");
  }

  function getStorageKey(prefix: string, storageNamespace: string) {
    return prefix + "_" + getStorageSuffix(storageNamespace);
  }

  function convexAuthJwtStorageKey(storageNamespace: string) {
    return getStorageKey(convexAuthJwtStorageKeyPrefix, storageNamespace);
  }

  function convexAuthRefreshTokenStorageKey(storageNamespace: string) {
    return getStorageKey(convexAuthRefreshTokenStorageKeyPrefix, storageNamespace);
  }

  function decodeBase64UrlJson(base64UrlValue: string) {
    const base64 = base64UrlValue.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = (host.atob ?? ((value: string) => window.atob(value)))(paddedBase64);
    const decoder = host.textDecoder ?? new TextDecoder();
    return decoder.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }

  function readProperty(source: object, key: string) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return undefined;
    }

    const value: unknown = descriptor.value;
    return value;
  }

  function readProfileClaim(source: object, key: string) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor === undefined) {
      return { kind: "absent" };
    }
    if (!("value" in descriptor)) {
      return { kind: "invalid" };
    }

    const value: unknown = descriptor.value;
    if (typeof value !== "string") {
      return { kind: "invalid" };
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0 || trimmedValue.length > authTokenProfileClaimMaxLength) {
      return { kind: "invalid" };
    }

    return {
      kind: "present",
      value: trimmedValue,
    };
  }

  function readProfileClaims(source: object): AuthTokenProfileClaims | null {
    const profileClaims: AuthTokenProfileClaims = {};
    const authProvider = readProfileClaim(source, "authProvider");
    const name = readProfileClaim(source, "name");
    const email = readProfileClaim(source, "email");

    if (authProvider.kind === "invalid" || name.kind === "invalid" || email.kind === "invalid") {
      return null;
    }

    if (authProvider.kind === "present") {
      profileClaims.authProvider = authProvider.value;
    }
    if (name.kind === "present") {
      profileClaims.name = name.value;
    }
    if (email.kind === "present") {
      profileClaims.email = email.value;
    }

    return Object.keys(profileClaims).length > 0 ? profileClaims : null;
  }

  function readJwtPayload(token: string): AppAuthPresentationRuntimeJwtPayload {
    const [, payload] = token.split(".");
    if (!payload) {
      return { kind: "invalid" };
    }

    try {
      const parsedPayload: unknown = JSON.parse(decodeBase64UrlJson(payload));
      if (parsedPayload === null || typeof parsedPayload !== "object") {
        return { kind: "invalid" };
      }

      const exp = readProperty(parsedPayload, "exp");
      if (exp !== undefined) {
        if (typeof exp !== "number" || !Number.isFinite(exp)) {
          return { kind: "invalid" };
        }
      }

      return {
        kind: "valid",
        profile: readProfileClaims(parsedPayload),
        tokenExpiresAt: exp === undefined ? null : exp * 1000,
      };
    } catch {
      return { kind: "invalid" };
    }
  }

  function isTokenExpiresCurrent(tokenExpiresAt: number | null) {
    return tokenExpiresAt === null || tokenExpiresAt > (host.now ?? Date.now)();
  }

  function readProfileLabel(profile: AuthTokenProfileClaims) {
    return profile.email ?? profile.name ?? null;
  }

  function readJwtPresentation(token: string) {
    const payload = readJwtPayload(token);
    if (
      payload.kind === "invalid" ||
      !isTokenExpiresCurrent(payload.tokenExpiresAt) ||
      payload.profile === null
    ) {
      return null;
    }

    const label = readProfileLabel(payload.profile);
    if (label === null) {
      return null;
    }

    return {
      label,
      profile: payload.profile,
    };
  }

  function readJwtPresentationLabel(token: string) {
    const presentation = readJwtPresentation(token);
    return presentation === null ? null : presentation.label;
  }

  function hasActiveAuthFlow(search: string) {
    if (!search) return false;

    const SearchParams = host.URLSearchParams ?? window.URLSearchParams;
    const searchParams = new SearchParams(search);
    return searchParams.get("auth") === "google" || Boolean(searchParams.get("code"));
  }

  function readLocalAppAuthPresentationHint({
    search,
    storage,
    storageNamespace,
  }: {
    search: string;
    storage: Pick<Storage, "getItem">;
    storageNamespace: string;
  }): AppAuthPresentationRuntimeLocalHint {
    try {
      const token = storage.getItem(convexAuthJwtStorageKey(storageNamespace));
      const refreshToken = storage.getItem(convexAuthRefreshTokenStorageKey(storageNamespace));

      if (token) {
        const presentation = readJwtPresentation(token);
        if (presentation !== null) {
          return {
            kind: "present",
            label: presentation.label,
            profile: presentation.profile,
          };
        }
      }

      if (refreshToken !== null && refreshToken.length > 0) {
        return { kind: "pending" };
      }

      return hasActiveAuthFlow(search) ? { kind: "pending" } : { kind: "signedOut" };
    } catch {
      return { kind: "pending" };
    }
  }

  return {
    convexAuthJwtStorageKey,
    convexAuthRefreshTokenStorageKey,
    hasActiveAuthFlow,
    readJwtPayload,
    readJwtPresentationLabel,
    readLocalAppAuthPresentationHint,
  };
}
