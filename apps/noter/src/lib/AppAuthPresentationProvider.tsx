import {
  AppAuthPresentationContext,
  readLocalAppAuthPresentationHint,
  type AppAuthPresentationState,
} from "@/lib/appAuthPresentationState";
import { useConvexAuth } from "convex/react";
import { useMemo, useState, type ReactNode } from "react";

export function AppAuthPresentationProvider({
  children,
  storageNamespace,
}: {
  children: ReactNode;
  storageNamespace: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [localAuthHint] = useState(() => readLocalAppAuthPresentationHint(storageNamespace));
  const presentationState = useMemo((): AppAuthPresentationState => {
    if (isAuthenticated) {
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
        source: localAuthHint.source,
        tokenExpiresAt: localAuthHint.tokenExpiresAt,
      };
    }

    return { kind: "unknown" };
  }, [isAuthenticated, isLoading, localAuthHint]);

  return (
    <AppAuthPresentationContext.Provider value={presentationState}>
      {children}
    </AppAuthPresentationContext.Provider>
  );
}
