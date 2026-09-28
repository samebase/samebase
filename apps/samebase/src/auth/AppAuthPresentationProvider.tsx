import {
  AppAuthPresentationContext,
  readLocalAppAuthPresentationHint,
  type AppAuthPresentationState,
} from "@/auth/appAuthPresentationState";
import { clearAppAuthPresentationPrehydration } from "@/auth/appAuthPresentationPrehydration";
import { useConvexAuth } from "convex/react";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type LocalAuthHintState = { kind: "unread" } | ReturnType<typeof readLocalAppAuthPresentationHint>;

export function AppAuthPresentationProvider({
  children,
  storageNamespace,
}: {
  children: ReactNode;
  storageNamespace: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [localAuthHint, setLocalAuthHint] = useState<LocalAuthHintState>({ kind: "unread" });

  // The local JWT hint has to land before paint so hydration preserves the head prehydration label.
  useLayoutEffect(() => {
    setLocalAuthHint(readLocalAppAuthPresentationHint(storageNamespace));
  }, [storageNamespace]);

  const presentationState = useMemo((): AppAuthPresentationState => {
    if (isAuthenticated) {
      if (localAuthHint.kind === "unread") {
        return { kind: "unknown" };
      }

      return {
        kind: "confirmedAuthenticated",
        profile: localAuthHint.kind === "present" ? localAuthHint.profile : null,
      };
    }

    if (!isLoading) {
      return { kind: "signedOut" };
    }

    if (localAuthHint.kind === "present") {
      return {
        kind: "temporaryAuthenticated",
        profile: localAuthHint.profile,
      };
    }

    if (localAuthHint.kind === "signedOut") {
      return { kind: "signedOut" };
    }

    return { kind: "unknown" };
  }, [isAuthenticated, isLoading, localAuthHint]);

  // React owns the account label after the first resolved presentation state, so the head CSS must go.
  useLayoutEffect(() => {
    if (presentationState.kind === "unknown") {
      return;
    }

    clearAppAuthPresentationPrehydration();
  }, [presentationState.kind]);

  return (
    <AppAuthPresentationContext.Provider value={presentationState}>
      {children}
    </AppAuthPresentationContext.Provider>
  );
}
