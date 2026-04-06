import React from "react";
import ReactDOM from "react-dom/client";
import { isInIframe, openAuthPopup } from "@/authClient";
import { GlobalGestureDebugOverlay } from "@/components/GlobalGestureDebugOverlay";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
  installAppBuildMarkdownCopy,
} from "@/lib/appBuild";
import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import {
  applyPageMetadata,
  resolveBootstrapPageMetadata,
} from "@/lib/pageMetadata";
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
import {
  shouldRenderFastLandingShell,
  shouldShowGoogleAuthForLocation,
} from "@/lib/publicLandingAuthState";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "@/lib/fastLandingBoot";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { isMobileSidebarDebugEnabled } from "@/lib/mobileSidebarGestureDebug";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SHELL_MAIN_TEST_ID,
} from "@/lib/publicLanding";
import { setPendingPublicLandingScrollTop } from "@/lib/publicLandingScrollState";
import { renderLandingCopyShellHtml } from "@/lib/landingCopyShell";
import { writePublicLandingWaitlistDraft } from "@/lib/publicLandingWaitlistDraft";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";

const GOOGLE_AUTH_BUTTON_ID = "public-landing-google-button";
const PUBLIC_LANDING_DEV_TOGGLE_ID = "public-landing-dev-toggle";
const PUBLIC_LANDING_CONTENT_TEST_ID = "public-landing-content";
const THEME_STORAGE_KEY = "theme";
const PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID = "public-landing-waitlist-email";
const PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID =
  "public-landing-waitlist-placeholder";
const PUBLIC_LANDING_WAITLIST_SUBMIT_BUTTON_ID =
  "public-landing-waitlist-submit";
const GLOBAL_GESTURE_DEBUG_OVERLAY_ROOT_ID =
  "global-gesture-debug-overlay-root";
const GESTURE_DEBUG_OVERLAY_LOCATION_EVENT =
  "noter:gesture-debug-location-change";

let appLoadPromise: Promise<void> | null = null;
let restoreHydratedWaitlistFocus = false;
let gestureDebugOverlayMounted = false;
let gestureDebugOverlayRoot: ReactDOM.Root | null = null;
let gestureDebugHistoryPatched = false;
let disposeBootstrapBuildVersionCopy: (() => void) | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderChromeIconSvg() {
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="lucide lucide-chrome mr-2 h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="4"></circle>
      <line x1="21.17" x2="12" y1="8" y2="8"></line>
      <line x1="3.95" x2="8.54" y1="6.06" y2="14"></line>
      <line x1="10.88" x2="15.46" y1="21.94" y2="14"></line>
    </svg>
  `;
}

function getShellCommitMetadata() {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const repoUrl = __APP_REPO_URL__ || "";
  const commitUrl =
    repoUrl && appCommit !== "unknown" ? `${repoUrl}/commit/${appCommit}` : "";

  return { appCommit, buildVersionLabel, commitLabel, commitUrl };
}

function resolveBootstrapTheme(): "dark" | "light" {
  const storedTheme = (() => {
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyBootstrapThemeClass(): boolean {
  const isDarkTheme = resolveBootstrapTheme() === "dark";
  document.documentElement.classList.toggle("dark", isDarkTheme);
  return isDarkTheme;
}

function buildFastLandingLogoSrc(): string {
  return createStaticLogoSvgDataUrl();
}

function scheduleBackgroundAppLoad() {
  const load = () => {
    void ensureAppLoaded();
  };

  const requestIdleCallback =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback.bind(window)
      : null;

  window.setTimeout(() => {
    if (requestIdleCallback !== null) {
      requestIdleCallback(load, { timeout: 1500 });
      return;
    }

    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(load);
    });
  }, FAST_LANDING_APP_BOOT_DELAY_MS);
}

function ensureAppLoaded(): Promise<void> {
  syncPendingPublicLandingScrollTop();
  if (disposeBootstrapBuildVersionCopy !== null) {
    disposeBootstrapBuildVersionCopy();
    disposeBootstrapBuildVersionCopy = null;
  }
  if (appLoadPromise === null) {
    appLoadPromise = import("./main")
      .then((module) => {
        module.mountApp();
        flushHydratedWaitlistFocusRestore();
      })
      .catch((error: unknown) => {
        appLoadPromise = null;
        throw error;
      });
  }

  return appLoadPromise.then(() => {
    flushHydratedWaitlistFocusRestore();
  });
}

/**
 * Capture the fast-shell scroll offset right before hydration so the mounted
 * landing route can restore the same position without reading from a missing
 * pre-hydration node.
 */
function syncPendingPublicLandingScrollTop() {
  const shellMain = document.querySelector(
    `[data-testid="${PUBLIC_LANDING_SHELL_MAIN_TEST_ID}"]`,
  );
  if (!(shellMain instanceof HTMLElement)) {
    return;
  }

  setPendingPublicLandingScrollTop(shellMain.scrollTop);
}

function beginGoogleSignInFromShell() {
  if (isInIframe()) {
    openAuthPopup("google");
    return;
  }

  const nextUrl = buildPathWithUpdatedQuery(
    window.location,
    (nextSearchParams) => {
      setQueryParam(nextSearchParams, "auth", "google");
    },
  );

  window.history.replaceState(window.history.state, "", nextUrl);
  void ensureAppLoaded();
}

function beginLandingDevToggleFromShell(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return;
  }

  const toggleLink = event.currentTarget;
  if (!(toggleLink instanceof HTMLAnchorElement)) {
    return;
  }
  if (toggleLink.target === "_blank") {
    return;
  }

  const nextUrl = new URL(toggleLink.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  event.preventDefault();
  // Keep the shell mounted while the app hydrates, but avoid leaving the
  // toggle focused: mobile browsers can nudge the centered landing card,
  // duplicate pre-hydration taps must not add duplicate history entries, and
  // any already-mounted BrowserRouter still needs a popstate notification.
  toggleLink.blur();
  if (
    nextUrl.pathname !== currentUrl.pathname ||
    nextUrl.search !== currentUrl.search ||
    nextUrl.hash !== currentUrl.hash
  ) {
    const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    window.history.pushState(window.history.state, "", nextPath);
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: window.history.state,
      }),
    );
  }
  void ensureAppLoaded();
}

function focusHydratedWaitlistInput(attempt = 0) {
  if (document.querySelector('[data-testid="public-landing-shell"]') !== null) {
    if (attempt < 10) {
      window.setTimeout(() => {
        focusHydratedWaitlistInput(attempt + 1);
      }, 16);
    }
    return;
  }

  const waitlistInput = document.querySelector<HTMLInputElement>(
    `[data-testid="${PUBLIC_LANDING_CONTENT_TEST_ID}"] input[placeholder="email@example.com"]`,
  );
  if (!waitlistInput) {
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
}

function flushHydratedWaitlistFocusRestore() {
  if (!restoreHydratedWaitlistFocus) {
    return;
  }

  restoreHydratedWaitlistFocus = false;
  globalThis.requestAnimationFrame(() => {
    focusHydratedWaitlistInput();
  });
}

function beginWaitlistInteraction() {
  const shellInput = document.getElementById(
    PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID,
  );
  if (shellInput instanceof HTMLInputElement) {
    writePublicLandingWaitlistDraft(shellInput.value);
  }

  void ensureAppLoaded();
}

function renderFastLandingShell() {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Missing root container");
  }

  const searchParams = new URLSearchParams(window.location.search);
  const landingDevToggleHref = buildLandingDevToggleHref(window.location);
  const landingDevToggleLabel = getLandingDevToggleLabel(searchParams);
  const landingLogoSrc = buildFastLandingLogoSrc();
  const showGoogleAuth = shouldShowGoogleAuthForLocation(window.location);
  const { appCommit, buildVersionLabel, commitLabel, commitUrl } =
    getShellCommitMetadata();
  const commitMarkup = commitUrl
    ? `<a data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text transition-colors hover:text-foreground" href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer noopener" draggable="false" title="${escapeHtml(appCommit)}">${escapeHtml(commitLabel)}</a>`
    : `<span data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text" title="${escapeHtml(appCommit)}">${escapeHtml(commitLabel)}</span>`;
  const googleAuthButtonMarkup = showGoogleAuth
    ? `
              <button
                id="${GOOGLE_AUTH_BUTTON_ID}"
                type="button"
                class="inline-flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                ${renderChromeIconSvg()}
                <span>Google</span>
              </button>
      `
    : "";

  root.innerHTML = `
    <div data-testid="public-landing-shell" class="flex h-full w-full flex-col">
      <div class="h-[19px] shrink-0 border-b border-border/50">
        <div data-testid="${APP_BUILD_STATUS_BAR_TEST_ID}" class="container flex h-full items-center overflow-hidden px-3 text-[11px] leading-none text-muted-foreground">
          <div class="flex w-full items-center gap-2">
            <div class="flex items-center text-muted-foreground">
              <a href="/terms" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">
                /terms
              </a>
              <span class="px-1">·</span>
              <a href="/privacy" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">
                /privacy
              </a>
            </div>
            <div class="ml-auto flex items-center gap-2">
              <a id="${PUBLIC_LANDING_DEV_TOGGLE_ID}" href="${escapeHtml(landingDevToggleHref)}" class="inline-flex min-w-[3ch] items-center justify-center corner-notch-1 px-1 transition-colors hover:text-foreground">
                ${escapeHtml(landingDevToggleLabel)}
              </a>
              <div class="inline-flex select-text items-center gap-2 font-mono">
                <span data-testid="${APP_BUILD_VERSION_TEST_ID}">${escapeHtml(buildVersionLabel)}</span>
                ${commitMarkup}
              </div>
            </div>
          </div>
        </div>
      </div>
      <main data-testid="${PUBLIC_LANDING_SHELL_MAIN_TEST_ID}" class="flex grow min-h-0 flex-col overflow-x-hidden overflow-y-auto">
        <div class="container my-auto">
          <div data-testid="${PUBLIC_LANDING_CONTENT_TEST_ID}" class="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
            <div class="${PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME}">
              <div data-testid="${PUBLIC_LANDING_LOGO_STAGE_TEST_ID}" class="${PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}">
                <img
                  data-testid="${PUBLIC_LANDING_LOGO_TEST_ID}"
                  src="${escapeHtml(landingLogoSrc)}"
                  alt="${escapeHtml(PUBLIC_LANDING_LOGO_ALT)}"
                  width="${String(PUBLIC_LANDING_LOGO_WIDTH)}"
                  height="${String(PUBLIC_LANDING_LOGO_HEIGHT)}"
                  loading="eager"
                  decoding="async"
                  fetchpriority="high"
                  class="${PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME}"
                />
                <div
                  aria-hidden="true"
                  data-testid="${PUBLIC_LANDING_LOGO_SCENE_TEST_ID}"
                  data-state="loading"
                  class="pointer-events-none absolute inset-0 z-0"
                ></div>
              </div>
            </div>
            <div data-testid="${PUBLIC_LANDING_COPY_TEST_ID}">
              ${renderLandingCopyShellHtml(landingPageMarkdown)}
            </div>
            <div class="flex flex-col gap-2">
              ${googleAuthButtonMarkup}
            </div>
            <div
              data-testid="${PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID}"
              class="flex flex-col gap-2 pt-2"
            >
              <input
                id="${PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID}"
                type="email"
                placeholder="email@example.com"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
              <button
                id="${PUBLIC_LANDING_WAITLIST_SUBMIT_BUTTON_ID}"
                type="button"
                class="inline-flex h-9 self-start items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                Join Waitlist
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  if (disposeBootstrapBuildVersionCopy !== null) {
    disposeBootstrapBuildVersionCopy();
    disposeBootstrapBuildVersionCopy = null;
  }

  const commitLinkElement = root.querySelector(
    `[data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}"]`,
  );
  if (commitLinkElement instanceof HTMLElement) {
    disposeBootstrapBuildVersionCopy = installAppBuildMarkdownCopy(
      commitLinkElement,
      {
        appBuildCopyLabel: commitLabel,
        commitUrl,
      },
    );
  }
  if (commitLinkElement instanceof HTMLAnchorElement) {
    commitLinkElement.addEventListener("dragstart", (event) => {
      event.preventDefault();
    });
    commitLinkElement.addEventListener("click", (event) => {
      if (!hasSelectedAppBuildVersion(commitLinkElement)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    });
  }

  const shellMain = root.querySelector<HTMLElement>(
    `[data-testid="${PUBLIC_LANDING_SHELL_MAIN_TEST_ID}"]`,
  );
  if (shellMain !== null) {
    setPendingPublicLandingScrollTop(shellMain.scrollTop);
    shellMain.addEventListener(
      "scroll",
      () => {
        setPendingPublicLandingScrollTop(shellMain.scrollTop);
      },
      { passive: true },
    );
  }

  root
    .querySelector<HTMLAnchorElement>(`#${PUBLIC_LANDING_DEV_TOGGLE_ID}`)
    ?.addEventListener("click", beginLandingDevToggleFromShell);
  root
    .querySelector<HTMLButtonElement>(`#${GOOGLE_AUTH_BUTTON_ID}`)
    ?.addEventListener("click", beginGoogleSignInFromShell);
  const shellWaitlistInput = root.querySelector<HTMLInputElement>(
    `#${PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID}`,
  );

  shellWaitlistInput?.addEventListener("focus", () => {
    restoreHydratedWaitlistFocus = true;
  });
  shellWaitlistInput?.addEventListener("blur", (event) => {
    if (event.relatedTarget instanceof HTMLElement) {
      restoreHydratedWaitlistFocus = false;
    }
  });
  shellWaitlistInput?.addEventListener("input", (event) => {
    const shellInput = event.currentTarget;
    if (!(shellInput instanceof HTMLInputElement)) {
      return;
    }

    writePublicLandingWaitlistDraft(shellInput.value);
    void ensureAppLoaded();
  });
  root
    .querySelector<HTMLButtonElement>(
      `#${PUBLIC_LANDING_WAITLIST_SUBMIT_BUTTON_ID}`,
    )
    ?.addEventListener("click", beginWaitlistInteraction);
}

function applyBootstrapPageMetadata(
  location: Location,
  fastLandingRoute: boolean,
) {
  if (fastLandingRoute) {
    return;
  }

  applyPageMetadata(resolveBootstrapPageMetadata(location.pathname));
}

function mountBootstrapGestureDebugOverlay() {
  if (gestureDebugOverlayMounted) {
    return;
  }

  const isLocalDebugHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!import.meta.env.DEV && !isLocalDebugHost) {
    return;
  }

  let overlayRoot = document.getElementById(
    GLOBAL_GESTURE_DEBUG_OVERLAY_ROOT_ID,
  );
  if (overlayRoot === null) {
    overlayRoot = document.createElement("div");
    overlayRoot.id = GLOBAL_GESTURE_DEBUG_OVERLAY_ROOT_ID;
    document.body.appendChild(overlayRoot);
  }

  gestureDebugOverlayRoot = ReactDOM.createRoot(overlayRoot);
  // Keep the bootstrap-owned React root mounted and toggle the overlay with the
  // query param so debug sessions can turn it on and off without a full reload.
  const renderGestureDebugOverlay = () => {
    gestureDebugOverlayRoot?.render(
      React.createElement(
        React.StrictMode,
        null,
        isMobileSidebarDebugEnabled(window.location.search)
          ? React.createElement(GlobalGestureDebugOverlay)
          : null,
      ),
    );
  };

  if (!gestureDebugHistoryPatched) {
    // React Router navigation updates history without triggering popstate, so
    // mirror those writes into a custom event for this bootstrap-mounted overlay.
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(
      window.history,
    );
    const dispatchGestureDebugLocationChange = () => {
      window.dispatchEvent(new Event(GESTURE_DEBUG_OVERLAY_LOCATION_EVENT));
    };

    window.history.pushState = function pushState(...args) {
      originalPushState(...args);
      dispatchGestureDebugLocationChange();
    };
    window.history.replaceState = function replaceState(...args) {
      originalReplaceState(...args);
      dispatchGestureDebugLocationChange();
    };
    gestureDebugHistoryPatched = true;
  }

  window.addEventListener("popstate", renderGestureDebugOverlay);
  window.addEventListener(
    GESTURE_DEBUG_OVERLAY_LOCATION_EVENT,
    renderGestureDebugOverlay,
  );
  renderGestureDebugOverlay();
  gestureDebugOverlayMounted = true;
}

applyBootstrapThemeClass();
mountBootstrapGestureDebugOverlay();
const fastLandingRoute = shouldRenderFastLandingShell(window.location);

applyBootstrapPageMetadata(window.location, fastLandingRoute);

if (fastLandingRoute) {
  renderFastLandingShell();
  scheduleBackgroundAppLoad();
} else {
  void ensureAppLoaded();
}
