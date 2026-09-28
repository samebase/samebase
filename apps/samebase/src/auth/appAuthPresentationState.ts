import { createContext, useContext } from "react";
import { Inlineable_createAppAuthPresentationRuntime } from "@/auth/appAuthPresentationRuntime";
import { type AuthTokenProfileClaims } from "../../shared/authTokenClaims";

export type AppAuthPresentationProfile = AuthTokenProfileClaims;
type LocalAppAuthPresentationHint =
  | { kind: "pending" }
  | {
      kind: "present";
      profile: AppAuthPresentationProfile;
    }
  | { kind: "signedOut" };

export type AppAuthPresentationState =
  | { kind: "unknown" }
  | {
      kind: "temporaryAuthenticated";
      profile: AppAuthPresentationProfile;
    }
  | { kind: "confirmedAuthenticated"; profile: AppAuthPresentationProfile | null }
  | { kind: "signedOut" };

export const AppAuthPresentationContext = createContext<AppAuthPresentationState | null>(null);
const appAuthPresentationRuntime = Inlineable_createAppAuthPresentationRuntime();

export function convexAuthJwtStorageKey(storageNamespace: string) {
  return appAuthPresentationRuntime.convexAuthJwtStorageKey(storageNamespace);
}

export function convexAuthRefreshTokenStorageKey(storageNamespace: string) {
  return appAuthPresentationRuntime.convexAuthRefreshTokenStorageKey(storageNamespace);
}

export function readLocalAppAuthPresentationHint(
  storageNamespace: string,
): LocalAppAuthPresentationHint {
  if (typeof window === "undefined") {
    return { kind: "pending" };
  }

  try {
    const authPresentationHint = appAuthPresentationRuntime.readLocalAppAuthPresentationHint({
      search: window.location.search,
      storage: window.localStorage,
      storageNamespace,
    });
    if (authPresentationHint.kind === "present") {
      return {
        kind: "present",
        profile: authPresentationHint.profile,
      };
    }
    return authPresentationHint;
  } catch {
    return { kind: "pending" };
  }
}

export function useAppAuthPresentation() {
  const contextState = useContext(AppAuthPresentationContext);
  if (contextState === null) {
    throw new Error("AppAuthPresentationProvider is required.");
  }

  return contextState;
}

export function isAppPresentationAuthenticated(state: AppAuthPresentationState) {
  return state.kind === "confirmedAuthenticated" || state.kind === "temporaryAuthenticated";
}
