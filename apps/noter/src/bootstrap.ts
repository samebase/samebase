import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
  isLandingDevModeEnabled,
} from "@/lib/landingDevMode";
import { landingPageBullets, landingPageSlogan } from "@/lib/landingCopy";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const GOOGLE_AUTH_BUTTON_ID = "public-landing-google-button";
const FAST_LANDING_APP_BOOT_DELAY_MS = 150;

let appLoadPromise: Promise<void> | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isFastLandingRoute(location: Location): boolean {
  const searchParams = new URLSearchParams(location.search);
  return (
    location.pathname === "/" &&
    !isLandingDevModeEnabled(searchParams) &&
    !searchParams.has("auth") &&
    localStorage.getItem(AUTH_FLAG_KEY) !== "1"
  );
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
    appLoadPromise = import("./main").then((module) => {
      module.mountApp();
    });
  }

  return appLoadPromise;
}

function renderFastLandingShell() {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("Missing root container");
  }

  const searchParams = new URLSearchParams(window.location.search);
  const landingDevToggleHref = buildLandingDevToggleHref(window.location);
  const landingDevToggleLabel = getLandingDevToggleLabel(searchParams);

  root.innerHTML = `
    <div data-testid="public-landing-shell" class="flex h-full w-full flex-col">
      <div class="border-b border-border/50">
        <div class="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground">
          <a href="${escapeHtml(landingDevToggleHref)}" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">
            ${escapeHtml(landingDevToggleLabel)}
          </a>
        </div>
      </div>
      <main class="flex grow flex-col overflow-hidden">
        <div class="container my-auto">
          <div class="mx-auto flex max-w-[384px] flex-col gap-4 pb-8">
            <div class="space-y-4 text-sm">
              <div class="space-y-2">
                <h1 class="text-pretty text-lg font-medium tracking-tight">${escapeHtml(
                  landingPageSlogan,
                )}</h1>
              </div>
              <ul class="space-y-2 text-muted-foreground">
                ${landingPageBullets
                  .map(
                    (bullet) => `
                      <li class="flex gap-2">
                        <span aria-hidden="true" class="text-foreground">-</span>
                        <span>${escapeHtml(bullet)}</span>
                      </li>
                    `,
                  )
                  .join("")}
              </ul>
            </div>
            <button
              id="${GOOGLE_AUTH_BUTTON_ID}"
              type="button"
              class="inline-flex h-10 items-center justify-center whitespace-nowrap border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Google
            </button>
          </div>
        </div>
      </main>
    </div>
  `;

  root
    .querySelector<HTMLButtonElement>(`#${GOOGLE_AUTH_BUTTON_ID}`)
    ?.addEventListener("click", () => {
      const nextUrl = buildPathWithUpdatedQuery(
        window.location,
        (nextSearchParams) => {
          setQueryParam(nextSearchParams, "auth", "google");
        },
      );

      window.history.replaceState({}, "", nextUrl);
      void ensureAppLoaded();
    });
}

if (isFastLandingRoute(window.location)) {
  renderFastLandingShell();
  scheduleBackgroundAppLoad();
} else {
  void ensureAppLoaded();
}
