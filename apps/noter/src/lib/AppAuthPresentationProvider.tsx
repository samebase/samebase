import {
  AppAuthPresentationContext,
  readLocalAppAuthPresentationHint,
  type AppAuthPresentationState,
} from "@/lib/appAuthPresentationState";
import { clearAppAuthPresentationPrehydration } from "@/lib/appAuthPresentationPrehydration";
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
