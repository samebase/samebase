import {
  AppAuthPresentationContext,
  readLocalAppAuthPresentationHint,
  type AppAuthPresentationProfile,
  type AppAuthPresentationState,
} from "@/lib/appAuthPresentationState";
import { clearAppAuthPresentationPrehydration } from "@/lib/appAuthPresentationPrehydration";
import { useConvexAuth } from "convex/react";
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

type LocalAuthHintState = { kind: "unread" } | ReturnType<typeof readLocalAppAuthPresentationHint>;

function readInitialLocalAuthHint(storageNamespace: string): LocalAuthHintState {
  if (typeof window === "undefined") {
    return { kind: "unread" };
  }

  return readLocalAppAuthPresentationHint(storageNamespace);
}

function areProfilesEqual(left: AppAuthPresentationProfile, right: AppAuthPresentationProfile) {
  return left.email === right.email && left.name === right.name;
}

function areLocalAuthHintsEqual(left: LocalAuthHintState, right: LocalAuthHintState) {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "pending":
    case "signedOut":
    case "unread":
      return true;
    case "present":
      return right.kind === "present" && areProfilesEqual(left.profile, right.profile);
  }
}

export function AppAuthPresentationProvider({
  children,
  storageNamespace,
}: {
  children: ReactNode;
  storageNamespace: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [localAuthHint, setLocalAuthHint] = useState<LocalAuthHintState>(() =>
    readInitialLocalAuthHint(storageNamespace),
  );

  // Re-read when the deployment namespace changes after the initial browser render.
  useLayoutEffect(() => {
    const nextLocalAuthHint = readLocalAppAuthPresentationHint(storageNamespace);
    setLocalAuthHint((currentLocalAuthHint) =>
      areLocalAuthHintsEqual(currentLocalAuthHint, nextLocalAuthHint)
        ? currentLocalAuthHint
        : nextLocalAuthHint,
    );
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
