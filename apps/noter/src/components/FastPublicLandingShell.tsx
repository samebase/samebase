import { openAuthPopup, isInIframe } from "@/authClient";
import { AppBuildStatusBar } from "@/components/AppBuildStatusBar";
import { LandingCopy } from "@/components/LandingCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { Chrome } from "lucide-react";
import {
  buildLandingDevToggleSearch,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { landingPageMarkdown } from "@/lib/landingCopy";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SHELL_MAIN_TEST_ID,
} from "@/lib/publicLanding";
import {
  PUBLIC_LANDING_LOGO_ALT,
  PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME,
  PUBLIC_LANDING_LOGO_HEIGHT,
  PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_WIDTH,
} from "@/lib/publicLandingLogo";
import { setPendingPublicLandingScrollTop } from "@/lib/publicLandingScrollState";
import {
  readPublicLandingWaitlistDraft,
  writePublicLandingWaitlistDraft,
} from "@/lib/publicLandingWaitlistDraft";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { shouldShowGoogleAuthForPathname } from "@/lib/publicLandingAuthState";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import {
  type FocusEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const PUBLIC_LANDING_CONTENT_TEST_ID = "public-landing-content";
const PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID =
  "public-landing-waitlist-placeholder";
const FAST_LANDING_LOGO_SRC = createStaticLogoSvgDataUrl();

/**
 * Keep the temporary routed fast shell aligned with the hydrated landing route
 * while the bootstrap-era handoff contract still exists.
 *
 * This component owns shell-only scroll carryover, waitlist focus handoff, and
 * one-shot route transitions until the hydrated landing surface takes over.
 */
export function FastPublicLandingShell({
  onCancelWaitlistFocusRestore,
  onRequestHydratedLanding,
  onShellRouteTransitionStart,
  onScheduleWaitlistFocusRestore,
}: {
  onCancelWaitlistFocusRestore: () => void;
  onRequestHydratedLanding: () => void;
  onShellRouteTransitionStart: () => void;
  onScheduleWaitlistFocusRestore: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const rootRouteSearch = useRootRouteSearch();
  const scrollShellRef = useRef<HTMLElement | null>(null);
  const routeTransitionStartedRef = useRef(false);
  const [waitlistEmail, setWaitlistEmail] = useState(
    readPublicLandingWaitlistDraft,
  );
  const [shellDisplayState] = useState(() => ({
    landingDevToggleHref: router.buildLocation({
      to: "/",
      search: buildLandingDevToggleSearch(rootRouteSearch),
      hash: true,
    }).href,
    landingDevToggleLabel: getLandingDevToggleLabel(rootRouteSearch),
    landingDevToggleSearch: buildLandingDevToggleSearch(rootRouteSearch),
    googleAuthSearch: {
      ...rootRouteSearch,
      auth: "google" as const,
    },
    showGoogleAuth: shouldShowGoogleAuthForPathname(
      location.pathname,
      rootRouteSearch,
    ),
    showPasswordAuthPlaceholder:
      import.meta.env.DEV && !isProdUiModeEnabled(rootRouteSearch),
  }));

  useEffect(() => {
    const shellMain = scrollShellRef.current;
    if (shellMain === null) {
      return;
    }

    setPendingPublicLandingScrollTop(shellMain.scrollTop);
    const syncScrollTop = () => {
      setPendingPublicLandingScrollTop(shellMain.scrollTop);
    };

    shellMain.addEventListener("scroll", syncScrollTop, { passive: true });
    return () => {
      shellMain.removeEventListener("scroll", syncScrollTop);
    };
  }, []);

  function requestHydratedLanding() {
    const shellMain = scrollShellRef.current;
    if (shellMain !== null) {
      setPendingPublicLandingScrollTop(shellMain.scrollTop);
    }
    onRequestHydratedLanding();
  }

  function beginShellRouteTransition(navigateTo: () => void) {
    if (routeTransitionStartedRef.current) {
      return;
    }

    routeTransitionStartedRef.current = true;
    const shellMain = scrollShellRef.current;
    if (shellMain !== null) {
      setPendingPublicLandingScrollTop(shellMain.scrollTop);
    }
    onShellRouteTransitionStart();
    navigateTo();
  }

  function handleLandingDevToggleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.currentTarget.target === "_blank"
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.blur();
    beginShellRouteTransition(() => {
      void navigate({
        to: "/",
        search: shellDisplayState.landingDevToggleSearch,
        hash: true,
      });
    });
  }

  function handleGoogleAuthClick() {
    if (isInIframe()) {
      openAuthPopup("google");
      return;
    }

    beginShellRouteTransition(() => {
      void navigate({
        to: "/",
        search: shellDisplayState.googleAuthSearch,
        hash: true,
      });
    });
  }

  function handleWaitlistFocus() {
    onScheduleWaitlistFocusRestore();
  }

  function handleWaitlistBlur(event: FocusEvent<HTMLInputElement>) {
    if (event.relatedTarget instanceof HTMLElement) {
      onCancelWaitlistFocusRestore();
    }
  }

  function handleWaitlistChange(nextValue: string) {
    setWaitlistEmail(nextValue);
    writePublicLandingWaitlistDraft(nextValue);
    requestHydratedLanding();
  }

  function handleWaitlistSubmit() {
    writePublicLandingWaitlistDraft(waitlistEmail);
    requestHydratedLanding();
  }

  return (
    <div
      data-testid="public-landing-shell"
      className="flex h-full w-full flex-col"
    >
      <AppBuildStatusBar
        appCommit={__APP_COMMIT__ || "unknown"}
        appCommitNumber={__APP_COMMIT_NUMBER__}
        landingDevToggleHref={shellDisplayState.landingDevToggleHref}
        landingDevToggleLabel={shellDisplayState.landingDevToggleLabel}
        onLandingDevToggleClick={handleLandingDevToggleClick}
        repoUrl={__APP_REPO_URL__ || ""}
        showLandingDevToggle
        showLandingLegalLinks
      />
      <main
        ref={scrollShellRef}
        data-testid={PUBLIC_LANDING_SHELL_MAIN_TEST_ID}
        className="flex grow min-h-0 flex-col overflow-x-hidden overflow-y-auto"
      >
        <div className="container my-auto">
          <div
            data-testid={PUBLIC_LANDING_CONTENT_TEST_ID}
            className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8"
          >
            <div className={PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME}>
              <div
                data-testid={PUBLIC_LANDING_LOGO_STAGE_TEST_ID}
                className={PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}
              >
                <img
                  data-testid={PUBLIC_LANDING_LOGO_TEST_ID}
                  src={FAST_LANDING_LOGO_SRC}
                  alt={PUBLIC_LANDING_LOGO_ALT}
                  width={PUBLIC_LANDING_LOGO_WIDTH}
                  height={PUBLIC_LANDING_LOGO_HEIGHT}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  className={PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME}
                />
                <div
                  aria-hidden="true"
                  data-testid={PUBLIC_LANDING_LOGO_SCENE_TEST_ID}
                  data-state="loading"
                  className="pointer-events-none absolute inset-0 z-0"
                />
              </div>
            </div>
            <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>
              <LandingCopy className="text-sm" markdown={landingPageMarkdown} />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                aria-hidden={!shellDisplayState.showGoogleAuth}
                type="button"
                variant="outline"
                className={
                  shellDisplayState.showGoogleAuth
                    ? "flex-1"
                    : "flex-1 invisible pointer-events-none"
                }
                disabled={!shellDisplayState.showGoogleAuth}
                tabIndex={shellDisplayState.showGoogleAuth ? undefined : -1}
                onClick={handleGoogleAuthClick}
              >
                <Chrome className="mr-2 h-4 w-4" /> Google
              </Button>
              {shellDisplayState.showPasswordAuthPlaceholder ? (
                <ShellPasswordAuthPlaceholder />
              ) : null}
            </div>
            <div
              data-testid={PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID}
              className="flex flex-col gap-2 pt-2"
            >
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={waitlistEmail}
                  onFocus={handleWaitlistFocus}
                  onBlur={handleWaitlistBlur}
                  onChange={(event) => {
                    handleWaitlistChange(event.currentTarget.value);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleWaitlistSubmit}
                >
                  Join Waitlist
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ShellPasswordAuthPlaceholder() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Password auth (dev)</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-2 py-1 text-xs"
          disabled
        >
          Need an account?
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value=""
          disabled
          readOnly
        />
        <Input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value=""
          disabled
          readOnly
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="shrink-0" disabled>
            Autofill & sign in
          </Button>
          <Button type="button" disabled className="flex-1">
            Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
