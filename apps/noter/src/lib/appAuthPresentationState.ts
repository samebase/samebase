import { AUTH_FLAG_STORAGE_KEY } from "@/lib/authStorageKeys";
import { isRecord } from "@noter-md/dependent";
import { useConvexAuth } from "convex/react";
import { createContext, useContext } from "react";

const CONVEX_AUTH_JWT_STORAGE_KEY = "__convexAuthJWT";

export type AppAuthPresentationProfile = {
  email?: string;
  image?: string;
  name?: string;
};
type LocalAppAuthPresentationHint =
  | { kind: "absent" }
  | {
      kind: "present";
      profile: AppAuthPresentationProfile | null;
      source: "jwt" | "remembered";
      tokenExpiresAt: number | null;
    };
type ConvexAuthJwtPayload =
  | { kind: "invalid" }
  | {
      kind: "valid";
      profile: AppAuthPresentationProfile | null;
      tokenExpiresAt: number | null;
    };

export type AppAuthPresentationState =
  | { kind: "unknown" }
  | {
      kind: "temporaryAuthenticated";
      profile: AppAuthPresentationProfile | null;
      source: "jwt" | "remembered";
      tokenExpiresAt: number | null;
    }
  | { kind: "confirmedAuthenticated"; profile: AppAuthPresentationProfile | null }
  | { kind: "signedOut" };

export const AppAuthPresentationContext = createContext<AppAuthPresentationState | null>(null);

function convexAuthStorageSuffix(storageNamespace: string) {
  // Match @convex-dev/auth's useNamespacedStorage key so this pre-auth read sees the same JWT.
  return storageNamespace.replace(/[^a-zA-Z0-9]/g, "");
}

export function convexAuthJwtStorageKey(storageNamespace: string) {
  return `${CONVEX_AUTH_JWT_STORAGE_KEY}_${convexAuthStorageSuffix(storageNamespace)}`;
}

function readRememberedAuthHint(storage: Storage): LocalAppAuthPresentationHint {
  return storage.getItem(AUTH_FLAG_STORAGE_KEY) === "1"
    ? { kind: "present", profile: null, source: "remembered", tokenExpiresAt: null }
    : { kind: "absent" };
}

function decodeBase64UrlJson(base64UrlValue: string) {
  const base64 = base64UrlValue.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return window.atob(paddedBase64);
}

function readOptionalStringClaim(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readJwtProfile(payload: Record<string, unknown>): AppAuthPresentationProfile | null {
  const name = readOptionalStringClaim(payload, "name");
  const email = readOptionalStringClaim(payload, "email");
  const image =
    readOptionalStringClaim(payload, "picture") ?? readOptionalStringClaim(payload, "image");
  const profile: AppAuthPresentationProfile = {};

  if (name !== undefined) {
    profile.name = name;
  }
  if (email !== undefined) {
    profile.email = email;
  }
  if (image !== undefined) {
    profile.image = image;
  }

  return Object.keys(profile).length > 0 ? profile : null;
}

function readJwtPayload(token: string): ConvexAuthJwtPayload {
  const [, payload] = token.split(".");
  if (!payload) {
    return { kind: "invalid" };
  }

  try {
    const parsedPayload: unknown = JSON.parse(decodeBase64UrlJson(payload));
    if (!isRecord(parsedPayload)) {
      return { kind: "invalid" };
    }

    if (!("exp" in parsedPayload)) {
      return { kind: "valid", profile: readJwtProfile(parsedPayload), tokenExpiresAt: null };
    }

    if (typeof parsedPayload.exp !== "number" || !Number.isFinite(parsedPayload.exp)) {
      return { kind: "invalid" };
    }

    return {
      kind: "valid",
      profile: readJwtProfile(parsedPayload),
      tokenExpiresAt: parsedPayload.exp * 1000,
    };
  } catch {
    return { kind: "invalid" };
  }
}

export function readLocalAppAuthPresentationHint(
  storageNamespace: string,
): LocalAppAuthPresentationHint {
  if (typeof window === "undefined") {
    return { kind: "absent" };
  }

  try {
    const storage = window.localStorage;
    const token = storage.getItem(convexAuthJwtStorageKey(storageNamespace));
    if (!token) {
      return readRememberedAuthHint(storage);
    }

    const tokenPayload = readJwtPayload(token);
    if (tokenPayload.kind === "invalid") {
      return readRememberedAuthHint(storage);
    }

    if (tokenPayload.tokenExpiresAt !== null && tokenPayload.tokenExpiresAt <= Date.now()) {
      return readRememberedAuthHint(storage);
    }

    return {
      kind: "present",
      profile: tokenPayload.profile,
      source: "jwt",
      tokenExpiresAt: tokenPayload.tokenExpiresAt,
    };
  } catch {
    return { kind: "absent" };
  }
}

export function useAppAuthPresentation() {
  const contextState = useContext(AppAuthPresentationContext);
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (contextState) {
    return contextState;
  }

  if (isAuthenticated) {
    return { kind: "confirmedAuthenticated", profile: null } satisfies AppAuthPresentationState;
  }

  if (isLoading) {
    return { kind: "unknown" } satisfies AppAuthPresentationState;
  }

  return { kind: "signedOut" } satisfies AppAuthPresentationState;
}

export function isAppPresentationAuthenticated(state: AppAuthPresentationState) {
  return state.kind === "confirmedAuthenticated" || state.kind === "temporaryAuthenticated";
}
