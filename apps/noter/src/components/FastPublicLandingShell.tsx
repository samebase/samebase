import { openAuthPopup, isInIframe } from "@/authClient";
import { AppBuildStatusBar } from "@/components/AppBuildStatusBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import { Chrome } from "lucide-react";
import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { renderLandingCopyShellHtml } from "@/lib/landingCopyShell";
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
import type { RootRouteSearch } from "@/lib/rootRouteSearch";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { useLocation, useNavigate } from "@/lib/router";
import { shouldShowGoogleAuthForLocation } from "@/lib/publicLandingAuthState";
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
  rootRouteSearch,
}: {
  onCancelWaitlistFocusRestore: () => void;
  onRequestHydratedLanding: () => void;
  onShellRouteTransitionStart: () => void;
  onScheduleWaitlistFocusRestore: () => void;
  rootRouteSearch: RootRouteSearch;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollShellRef = useRef<HTMLElement | null>(null);
  const routeTransitionStartedRef = useRef(false);
  const [waitlistEmail, setWaitlistEmail] = useState(
    readPublicLandingWaitlistDraft,
  );
  const [shellDisplayState] = useState(() => ({
    landingDevToggleHref: buildLandingDevToggleHref(location),
    landingDevToggleLabel: getLandingDevToggleLabel(rootRouteSearch),
    showGoogleAuth: shouldShowGoogleAuthForLocation(location, rootRouteSearch),
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

  function beginShellRouteTransition(nextHref: string) {
    if (routeTransitionStartedRef.current) {
      return;
    }

    routeTransitionStartedRef.current = true;
    const shellMain = scrollShellRef.current;
    if (shellMain !== null) {
      setPendingPublicLandingScrollTop(shellMain.scrollTop);
    }
    onShellRouteTransitionStart();
    void navigate(nextHref);
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
    beginShellRouteTransition(shellDisplayState.landingDevToggleHref);
  }

  function handleGoogleAuthClick() {
    if (isInIframe()) {
      openAuthPopup("google");
      return;
    }

    beginShellRouteTransition(
      buildPathWithUpdatedQuery(location, (nextSearchParams) => {
        setQueryParam(nextSearchParams, "auth", "google");
      }),
    );
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
            <div
              data-testid={PUBLIC_LANDING_COPY_TEST_ID}
              dangerouslySetInnerHTML={{
                __html: renderLandingCopyShellHtml(landingPageMarkdown),
              }}
            />
            <div className="flex flex-col gap-2">
              {shellDisplayState.showGoogleAuth ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleGoogleAuthClick}
                >
                  <Chrome className="mr-2 h-4 w-4" /> Google
                </Button>
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
