import { Layout } from "@/Layout";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { FastPublicLandingShell } from "@/components/FastPublicLandingShell";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { shouldRenderPublicLandingWithoutAuthGate } from "@/lib/publicLandingAuthState";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAppAuthRuntimeEffects } from "@/lib/useAppAuthRuntimeEffects";
import { useLocation } from "@/lib/router";
import {
  readRootRouteSearchFromLocation,
  useRootRouteSearch,
} from "@/lib/rootRouteSearch";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "@/lib/fastLandingBoot";
import { useConvexAuth, Authenticated, Unauthenticated } from "convex/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/VaultDashboard");
  return { default: module.VaultDashboard };
});

// Keep the fast landing shell as a once-per-page-load experience even though
// the app now mounts through `main.tsx` immediately. Once the routed shell
// hands off to the full app, back/forward within the same SPA session should
// not resurrect it.
let hasCompletedFastLandingShellSession = false;

function readOptionalStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function shouldRenderInitialFastLandingShell(location: Location): boolean {
  const rootRouteSearch = readRootRouteSearchFromLocation(location);
  return (
    location.pathname === "/" &&
    rootRouteSearch.auth !== "google" &&
    !isLandingDevModeEnabled(rootRouteSearch) &&
    readOptionalStorageValue("noter_was_authenticated") !== "1" &&
    readOptionalStorageValue("noter_auth_provider") === null
  );
}

const initialFastLandingPath =
  typeof window !== "undefined" &&
  shouldRenderInitialFastLandingShell(window.location)
    ? `${window.location.pathname}${window.location.search}${window.location.hash}`
    : null;

function markFastLandingShellSessionComplete() {
  hasCompletedFastLandingShellSession = true;
}

export function RootIndexRoutePage() {
  const location = useLocation();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated } = useConvexAuth();
  const [showFastLandingShell, setShowFastLandingShell] = useState(
    () =>
      initialFastLandingPath !== null &&
      `${location.pathname}${location.search}${location.hash}` ===
        initialFastLandingPath &&
      !hasCompletedFastLandingShellSession,
  );
  const [shouldRestoreWaitlistFocus, setShouldRestoreWaitlistFocus] =
    useState(false);
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated &&
    shouldRenderPublicLandingWithoutAuthGate(location, rootRouteSearch);
  const currentPathWithSearch = `${location.pathname}${location.search}${location.hash}`;
  const shouldOfferFastLandingShell =
    initialFastLandingPath !== null &&
    currentPathWithSearch === initialFastLandingPath &&
    !hasCompletedFastLandingShellSession;

  useAppAuthRuntimeEffects(location.pathname, rootRouteSearch.auth);
  usePageMetadata(
    useMemo(
      () =>
        resolvePageMetadata({
          pathname: location.pathname,
          isAuthenticated,
        }),
      [isAuthenticated, location.pathname],
    ),
  );

  useEffect(() => {
    if (!shouldOfferFastLandingShell) {
      setShowFastLandingShell(false);
      return;
    }

    setShowFastLandingShell(true);
    let timeoutId: number | null = null;

    const beginScheduledHandoff = () => {
      timeoutId = window.setTimeout(() => {
        markFastLandingShellSessionComplete();
        setShowFastLandingShell(false);
      }, FAST_LANDING_APP_BOOT_DELAY_MS);
    };

    if (document.readyState === "complete") {
      beginScheduledHandoff();
    } else {
      window.addEventListener("load", beginScheduledHandoff, { once: true });
    }

    return () => {
      window.removeEventListener("load", beginScheduledHandoff);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldOfferFastLandingShell]);

  useEffect(() => {
    if (showFastLandingShell || !shouldRestoreWaitlistFocus) {
      return;
    }

    let cancelled = false;
    const focusHydratedWaitlistInput = (attempt = 0) => {
      if (cancelled) {
        return;
      }

      const waitlistInput = document.querySelector<HTMLInputElement>(
        '[data-testid="public-landing-content"] input[placeholder="email@example.com"]',
      );
      if (waitlistInput === null) {
        if (attempt < 10) {
          window.setTimeout(() => {
            focusHydratedWaitlistInput(attempt + 1);
          }, 16);
        }
        return;
      }

      waitlistInput.focus();
      if (document.activeElement !== waitlistInput && attempt < 10) {
        window.setTimeout(() => {
          focusHydratedWaitlistInput(attempt + 1);
        }, 16);
      }
    };

    setShouldRestoreWaitlistFocus(false);
    const animationFrameId = window.requestAnimationFrame(() => {
      focusHydratedWaitlistInput();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [shouldRestoreWaitlistFocus, showFastLandingShell]);

  function requestHydratedLanding() {
    markFastLandingShellSessionComplete();
    setShowFastLandingShell(false);
  }

  if (showFastLandingShell) {
    return (
      <FastPublicLandingShell
        onCancelWaitlistFocusRestore={() => {
          setShouldRestoreWaitlistFocus(false);
        }}
        onRequestHydratedLanding={requestHydratedLanding}
        onScheduleWaitlistFocusRestore={() => {
          setShouldRestoreWaitlistFocus(true);
        }}
        rootRouteSearch={rootRouteSearch}
      />
    );
  }

  return (
    <Layout>
      {showPublicLandingWithoutAuthGate ? (
        <SignInForm />
      ) : (
        <>
          <Authenticated>
            <ApprovalGate>
              <Suspense fallback={null}>
                <VaultDashboard />
              </Suspense>
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </Unauthenticated>
        </>
      )}
    </Layout>
  );
}
