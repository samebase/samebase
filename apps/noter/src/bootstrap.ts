import { isInIframe, openAuthPopup } from "@/authClient";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
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
import { shouldRenderFastLandingShell } from "@/lib/publicLandingAuthState";
import { FAST_LANDING_APP_BOOT_DELAY_MS } from "@/lib/fastLandingBoot";
import { landingPageMarkdown } from "@/lib/landingCopy";
import {
  PUBLIC_LANDING_INTAKE_BUTTON_LABEL,
  PUBLIC_LANDING_INTAKE_EMAIL_LABEL,
  PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID,
  PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER,
  PUBLIC_LANDING_INTAKE_MESSAGE_LABEL,
  PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID,
  PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER,
  PUBLIC_LANDING_INTAKE_PLACEHOLDER_TEST_ID,
  PUBLIC_LANDING_INTAKE_SUBMIT_BUTTON_ID,
} from "@/lib/publicLandingIntake";
import { writePublicLandingIntakeDraft } from "@/lib/publicLandingIntakeDraft";
import { PUBLIC_LANDING_COPY_TEST_ID } from "@/lib/publicLanding";
import { renderLandingCopyShellHtml } from "@/lib/landingCopyShell";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";

const GOOGLE_AUTH_BUTTON_ID = "public-landing-google-button";
const PUBLIC_LANDING_DEV_TOGGLE_ID = "public-landing-dev-toggle";
const PUBLIC_LANDING_CONTENT_TEST_ID = "public-landing-content";
const THEME_STORAGE_KEY = "theme";
const UNKNOWN_SHORT_COMMIT_PLACEHOLDER = "xxxxxxx";

let appLoadPromise: Promise<void> | null = null;
let restoreHydratedLandingIntakeFocusTarget: "message" | "email" | null = null;

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
  if (appLoadPromise === null) {
    appLoadPromise = import("./main")
      .then((module) => {
        module.mountApp();
        flushHydratedLandingIntakeFocusRestore();
      })
      .catch((error: unknown) => {
        appLoadPromise = null;
        throw error;
      });
  }

  return appLoadPromise.then(() => {
    flushHydratedLandingIntakeFocusRestore();
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

function focusHydratedLandingIntakeField(
  target: "message" | "email",
  attempt = 0,
) {
  if (document.querySelector('[data-testid="public-landing-shell"]') !== null) {
    if (attempt < 10) {
      window.setTimeout(() => {
        focusHydratedLandingIntakeField(target, attempt + 1);
      }, 16);
    }
    return;
  }

  const landingIntakeSelector =
    target === "message"
      ? `#${PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID}`
      : `#${PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID}`;
  const landingIntakeField = document.querySelector<
    HTMLTextAreaElement | HTMLInputElement
  >(
    `[data-testid="${PUBLIC_LANDING_CONTENT_TEST_ID}"] ${landingIntakeSelector}`,
  );
  if (!landingIntakeField) {
    if (attempt < 10) {
      window.setTimeout(() => {
        focusHydratedLandingIntakeField(target, attempt + 1);
      }, 16);
    }
    return;
  }

  landingIntakeField.focus();
  if (document.activeElement !== landingIntakeField && attempt < 10) {
    window.setTimeout(() => {
      focusHydratedLandingIntakeField(target, attempt + 1);
    }, 16);
  }
}

function flushHydratedLandingIntakeFocusRestore() {
  const focusTarget = restoreHydratedLandingIntakeFocusTarget;
  if (!focusTarget) {
    return;
  }

  restoreHydratedLandingIntakeFocusTarget = null;
  globalThis.requestAnimationFrame(() => {
    focusHydratedLandingIntakeField(focusTarget);
  });
}

function syncShellLandingIntakeDraft() {
  const shellMessageField = document.getElementById(
    PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID,
  );
  const shellEmailField = document.getElementById(
    PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID,
  );
  writePublicLandingIntakeDraft({
    message:
      shellMessageField instanceof HTMLTextAreaElement
        ? shellMessageField.value
        : "",
    email:
      shellEmailField instanceof HTMLInputElement ? shellEmailField.value : "",
  });
}

function beginLandingIntakeInteraction() {
  syncShellLandingIntakeDraft();
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
  const { appCommit, shortCommit, commitUrl } = getShellCommitMetadata();
  const commitMarkup = commitUrl
    ? `<a class="font-mono transition-colors hover:text-foreground" href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(appCommit)}">${escapeHtml(shortCommit)}</a>`
    : `<span class="font-mono" title="${escapeHtml(appCommit)}">${escapeHtml(shortCommit)}</span>`;

  root.innerHTML = `
    <div data-testid="public-landing-shell" class="flex h-full w-full flex-col">
      <div class="border-b border-border/50">
        <div class="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground">
          <a id="${PUBLIC_LANDING_DEV_TOGGLE_ID}" href="${escapeHtml(landingDevToggleHref)}" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">
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
              data-testid="${PUBLIC_LANDING_INTAKE_PLACEHOLDER_TEST_ID}"
              class="flex flex-col gap-2"
            >
              <textarea
                id="${PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID}"
                aria-label="${escapeHtml(PUBLIC_LANDING_INTAKE_MESSAGE_LABEL)}"
                placeholder="${escapeHtml(PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER)}"
                class="flex min-h-[96px] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              ></textarea>
              <input
                id="${PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID}"
                type="email"
                aria-label="${escapeHtml(PUBLIC_LANDING_INTAKE_EMAIL_LABEL)}"
                placeholder="${escapeHtml(PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER)}"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
              <button
                id="${PUBLIC_LANDING_INTAKE_SUBMIT_BUTTON_ID}"
                type="button"
                class="inline-flex h-9 self-start items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
              >
                ${escapeHtml(PUBLIC_LANDING_INTAKE_BUTTON_LABEL)}
              </button>
            </div>
            <div class="border-t pt-2 text-center text-xs text-muted-foreground">
              <a href="/terms" class="transition-colors hover:text-foreground">
                /terms
              </a>
              <span class="px-2">·</span>
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
    .querySelector<HTMLAnchorElement>(`#${PUBLIC_LANDING_DEV_TOGGLE_ID}`)
    ?.addEventListener("click", beginLandingDevToggleFromShell);
  root
    .querySelector<HTMLButtonElement>(`#${GOOGLE_AUTH_BUTTON_ID}`)
    ?.addEventListener("click", beginGoogleSignInFromShell);
  const shellLandingMessageField = root.querySelector<HTMLTextAreaElement>(
    `#${PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID}`,
  );
  const shellLandingEmailField = root.querySelector<HTMLInputElement>(
    `#${PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID}`,
  );

  shellLandingMessageField?.addEventListener("focus", () => {
    restoreHydratedLandingIntakeFocusTarget = "message";
  });
  shellLandingMessageField?.addEventListener("blur", (event) => {
    if (event.relatedTarget instanceof HTMLElement) {
      restoreHydratedLandingIntakeFocusTarget = null;
    }
  });
  shellLandingMessageField?.addEventListener("input", () => {
    syncShellLandingIntakeDraft();
    void ensureAppLoaded();
  });
  shellLandingEmailField?.addEventListener("focus", () => {
    restoreHydratedLandingIntakeFocusTarget = "email";
  });
  shellLandingEmailField?.addEventListener("blur", (event) => {
    if (event.relatedTarget instanceof HTMLElement) {
      restoreHydratedLandingIntakeFocusTarget = null;
    }
  });
  shellLandingEmailField?.addEventListener("input", () => {
    syncShellLandingIntakeDraft();
    void ensureAppLoaded();
  });
  root
    .querySelector<HTMLButtonElement>(
      `#${PUBLIC_LANDING_INTAKE_SUBMIT_BUTTON_ID}`,
    )
    ?.addEventListener("click", beginLandingIntakeInteraction);
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

applyBootstrapThemeClass();
const fastLandingRoute = shouldRenderFastLandingShell(window.location);

applyBootstrapPageMetadata(window.location, fastLandingRoute);

if (fastLandingRoute) {
  renderFastLandingShell();
  scheduleBackgroundAppLoad();
} else {
  void ensureAppLoaded();
}
