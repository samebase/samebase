import {
  type AuthTokenAuthProvider,
  type AuthTokenProfileClaims,
} from "../../shared/authTokenClaims";

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
  // Mirrors DISPLAY_NAME_MAX_CODE_POINTS; appAuthPresentationRuntime.test.ts guards drift.
  const displayNameMaxCodePoints = 64;
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

  function readProfileClaim(
    source: object,
    key: string,
  ):
    | { kind: "absent" }
    | { kind: "invalid" }
    | {
        kind: "present";
        value: string;
      } {
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
    if (trimmedValue.length === 0 || value.length > authTokenProfileClaimMaxLength) {
      return { kind: "invalid" };
    }

    return {
      kind: "present",
      value,
    };
  }

  function readAuthProviderClaim(source: object):
    | { kind: "absent" }
    | { kind: "invalid" }
    | {
        kind: "present";
        value: AuthTokenAuthProvider;
      } {
    const claim = readProfileClaim(source, "authProvider");
    if (claim.kind === "absent") {
      return { kind: "absent" };
    }
    if (claim.kind === "invalid") {
      return { kind: "invalid" };
    }

    switch (claim.value) {
      case "google":
      case "github":
      case "password":
        return {
          kind: "present",
          value: claim.value,
        };
      default:
        return { kind: "invalid" };
    }
  }

  function readProfileClaims(source: object): AuthTokenProfileClaims | null {
    const authProvider = readAuthProviderClaim(source);
    const accountLabelKind = readProfileClaim(source, "accountLabelKind");
    const accountLabel = readProfileClaim(source, "accountLabel");

    if (authProvider.kind === "invalid") {
      return null;
    }

    let accountPresentation: AuthTokenProfileClaims["accountPresentation"];
    if (accountLabelKind.kind === "absent" && accountLabel.kind === "absent") {
      // Convex Auth access JWTs live for at most one hour. This branch only carries tokens issued
      // before the typed pair shipped and can be removed after that format is live for one hour.
      const legacyEmail = readProfileClaim(source, "email");
      if (legacyEmail.kind !== "present") {
        return null;
      }
      const normalizedEmail = legacyEmail.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) {
        return null;
      }
      accountPresentation = {
        kind: "email",
        label: normalizedEmail,
      };
    } else if (accountLabelKind.kind !== "present" || accountLabel.kind !== "present") {
      return null;
    } else {
      switch (accountLabelKind.value) {
        case "displayName": {
          const normalizedDisplayName = accountLabel.value.trim();
          if (
            /[\r\n\u2028\u2029]/u.test(normalizedDisplayName) ||
            Array.from(normalizedDisplayName).length > displayNameMaxCodePoints
          ) {
            return null;
          }
          accountPresentation = {
            kind: "displayName",
            label: normalizedDisplayName,
          };
          break;
        }
        case "email": {
          const normalizedEmail = accountLabel.value.trim().toLowerCase();
          if (
            normalizedEmail !== accountLabel.value ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)
          ) {
            return null;
          }
          accountPresentation = {
            kind: "email",
            label: normalizedEmail,
          };
          break;
        }
        default:
          return null;
      }
    }

    return {
      ...(authProvider.kind === "present" ? { authProvider: authProvider.value } : {}),
      accountPresentation,
    };
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

  function readJwtPresentation(token: string) {
    const payload = readJwtPayload(token);
    if (
      payload.kind === "invalid" ||
      !isTokenExpiresCurrent(payload.tokenExpiresAt) ||
      payload.profile === null
    ) {
      return null;
    }

    return {
      label: payload.profile.accountPresentation.label,
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
