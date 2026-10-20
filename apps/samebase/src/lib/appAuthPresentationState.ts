import { createContext, useContext } from "react";
import {
  Inlineable_createAppAuthPresentationRuntime,
  type AppAuthPresentationRuntimeLocalHint,
} from "@/lib/appAuthPresentationRuntime";

export type AppAuthPresentationState =
  | { kind: "unknown" }
  | { kind: "confirmedAuthenticated" }
  | { kind: "signedOut" };

export const AppAuthPresentationContext = createContext<AppAuthPresentationState | null>(null);
const appAuthPresentationRuntime = Inlineable_createAppAuthPresentationRuntime();

export function readLocalAppAuthPresentationHint(
  storageNamespace: string,
): AppAuthPresentationRuntimeLocalHint {
  if (typeof window === "undefined") {
    return { kind: "pending" };
  }

  try {
    return appAuthPresentationRuntime.readLocalAppAuthPresentationHint({
      search: window.location.search,
      storage: window.localStorage,
      storageNamespace,
    });
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
  return state.kind === "confirmedAuthenticated";
}
