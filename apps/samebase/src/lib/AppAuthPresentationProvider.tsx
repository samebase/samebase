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

  // The local session hint has to land before paint so hydration keeps the head prehydration state.
  useLayoutEffect(() => {
    setLocalAuthHint(readLocalAppAuthPresentationHint(storageNamespace));
  }, [storageNamespace]);

  const presentationState = useMemo((): AppAuthPresentationState => {
    if (isAuthenticated) {
      return { kind: "confirmedAuthenticated" };
    }

    if (!isLoading || localAuthHint.kind === "signedOut") {
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
