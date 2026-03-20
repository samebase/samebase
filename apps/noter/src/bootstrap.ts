import { isInIframe, openAuthPopup } from "@/authClient";
import { createLogoThreeSvgMarkup } from "@/components/logoThreeSvgRenderer";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import {
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { createFilledVoxelSet } from "@/components/logoVoxelState";
import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
  isLandingDevModeEnabled,
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
  PUBLIC_LANDING_LOGO_SRC,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_WIDTH,
} from "@/lib/publicLandingLogo";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "@/lib/fastLandingBoot";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { PUBLIC_LANDING_COPY_TEST_ID } from "@/lib/publicLanding";
import { renderLandingCopyShellHtml } from "@/lib/landingCopyShell";
import { writePublicLandingWaitlistDraft } from "@/lib/publicLandingWaitlistDraft";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const CONVEX_AUTH_STORAGE_KEY_PREFIX = "__convexAuth";
const GOOGLE_AUTH_BUTTON_ID = "public-landing-google-button";
const PUBLIC_LANDING_CONTENT_TEST_ID = "public-landing-content";
const THEME_STORAGE_KEY = "theme";
const PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID = "public-landing-waitlist-email";
const PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID =
  "public-landing-waitlist-placeholder";
const PUBLIC_LANDING_WAITLIST_SUBMIT_BUTTON_ID =
  "public-landing-waitlist-submit";
const UNKNOWN_SHORT_COMMIT_PLACEHOLDER = "xxxxxxx";

let appLoadPromise: Promise<void> | null = null;
let restoreHydratedWaitlistFocus = false;

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
  const shortCommit =
    appCommit === "unknown"
      ? UNKNOWN_SHORT_COMMIT_PLACEHOLDER
      : appCommit.length > 12
        ? appCommit.slice(0, 7)
        : appCommit;
  const repoUrl = __APP_REPO_URL__ || "";
  const commitUrl =
    repoUrl && appCommit !== "unknown" ? `${repoUrl}/commit/${appCommit}` : "";

  return { appCommit, shortCommit, commitUrl };
}

function isFastLandingRoute(location: Location): boolean {
  const searchParams = new URLSearchParams(location.search);
  return (
    location.pathname === "/" &&
    !isLandingDevModeEnabled(searchParams) &&
    !searchParams.has("auth") &&
    readLocalStorageValue(AUTH_FLAG_KEY) !== "1" &&
    !hasRestoredAuthTokens()
  );
}

function withLocalStorage<T>(reader: (storage: Storage) => T, fallback: T): T {
  try {
    return reader(window.localStorage);
  } catch {
    return fallback;
  }
}

function readLocalStorageValue(key: string): string | null {
  return withLocalStorage((storage) => storage.getItem(key), null);
}

function resolveBootstrapTheme(): "dark" | "light" {
  const storedTheme = readLocalStorageValue(THEME_STORAGE_KEY);
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

function buildFastLandingLogoSrc(isDarkTheme: boolean): string {
  if (!isDarkTheme) {
    return PUBLIC_LANDING_LOGO_SRC;
  }

  const markup = createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    faceColors: DEFAULT_FACE_COLORS,
    filledVoxels: createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  });

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function hasRestoredAuthTokens(): boolean {
  return withLocalStorage((storage) => {
    for (let index = 0; index < storage.length; index += 1) {
      const storageKey = storage.key(index);
      if (
        storageKey !== null &&
        storageKey.startsWith(CONVEX_AUTH_STORAGE_KEY_PREFIX)
      ) {
        return true;
      }
    }

    return false;
  }, false);
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

function renderFastLandingShell(isDarkTheme: boolean) {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Missing root container");
  }

  const searchParams = new URLSearchParams(window.location.search);
  const landingDevToggleHref = buildLandingDevToggleHref(window.location);
  const landingDevToggleLabel = getLandingDevToggleLabel(searchParams);
  const landingLogoSrc = buildFastLandingLogoSrc(isDarkTheme);
  const { appCommit, shortCommit, commitUrl } = getShellCommitMetadata();
  const commitMarkup = commitUrl
    ? `<a class="font-mono transition-colors hover:text-foreground" href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(appCommit)}">${escapeHtml(shortCommit)}</a>`
    : `<span class="font-mono" title="${escapeHtml(appCommit)}">${escapeHtml(shortCommit)}</span>`;

  root.innerHTML = `
    <div data-testid="public-landing-shell" class="flex h-full w-full flex-col">
      <div class="border-b border-border/50">
        <div class="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground">
          <a href="${escapeHtml(landingDevToggleHref)}" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">
            ${escapeHtml(landingDevToggleLabel)}
          </a>
          <span>Commit</span>
          ${commitMarkup}
        </div>
      </div>
      <main class="flex grow flex-col overflow-hidden">
        <div class="container my-auto">
          <div data-testid="${PUBLIC_LANDING_CONTENT_TEST_ID}" class="mx-auto flex max-w-[384px] flex-col gap-4 pb-8">
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
              <button
                id="${GOOGLE_AUTH_BUTTON_ID}"
                type="button"
                class="inline-flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                ${renderChromeIconSvg()}
                <span>Google</span>
              </button>
            </div>
            <div
              data-testid="${PUBLIC_LANDING_WAITLIST_PLACEHOLDER_TEST_ID}"
              class="flex flex-col gap-2 border-t pt-2"
            >
              <div class="flex gap-2">
                <input
                  id="${PUBLIC_LANDING_WAITLIST_EMAIL_INPUT_ID}"
                  type="email"
                  placeholder="email@example.com"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                />
                <button
                  id="${PUBLIC_LANDING_WAITLIST_SUBMIT_BUTTON_ID}"
                  type="button"
                  class="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  Join Waitlist
                </button>
              </div>
            </div>
            <div class="border-t pt-2 text-center text-xs text-muted-foreground">
              <a href="/privacy" class="transition-colors hover:text-foreground">
                /privacy
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

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

const isBootstrapDarkTheme = applyBootstrapThemeClass();
const fastLandingRoute = isFastLandingRoute(window.location);

applyBootstrapPageMetadata(window.location, fastLandingRoute);

if (fastLandingRoute) {
  renderFastLandingShell(isBootstrapDarkTheme);
  scheduleBackgroundAppLoad();
} else {
  void ensureAppLoaded();
}
