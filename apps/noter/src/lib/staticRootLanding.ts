import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
} from "./appBuild";
import { parseLandingCopyMarkdown } from "./landingCopyContent";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "./publicLanding";

const ROOT_PLACEHOLDER_HTML = '<div id="root"></div>';
const STATIC_ROOT_LANDING_JS_CLASS_NAME = "noter-static-js";
const STATIC_ROOT_LANDING_MARKER_ATTRIBUTE = "data-noter-static-root-landing";
const STATIC_ROOT_LANDING_HEAD_FRAGMENT = `
    <style data-noter-static-root-landing-style>
      .noter-static-js-only {
        display: none !important;
      }

      html.${STATIC_ROOT_LANDING_JS_CLASS_NAME} .noter-static-no-js-only {
        display: none !important;
      }

      html.${STATIC_ROOT_LANDING_JS_CLASS_NAME} .noter-static-js-only {
        display: flex !important;
        visibility: visible !important;
      }
    </style>
    <script data-noter-static-root-landing-script>
      document.documentElement.classList.add("${STATIC_ROOT_LANDING_JS_CLASS_NAME}");
    </script>`;
const STATIC_LANDING_CONTENT_TEST_ID = "public-landing-content";
const STATIC_PUBLIC_LANDING_LOGO_ALT = "Noter logo";
const STATIC_PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME =
  "mx-auto w-full max-w-[11rem]";
const STATIC_PUBLIC_LANDING_LOGO_HEIGHT = 360;
const STATIC_PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME = "block h-auto w-full";
const STATIC_PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME = "relative w-full";
const STATIC_PUBLIC_LANDING_LOGO_STAGE_TEST_ID = "public-landing-logo-stage";
const STATIC_PUBLIC_LANDING_LOGO_TEST_ID = "public-landing-logo";
const STATIC_PUBLIC_LANDING_LOGO_WIDTH = 360;
const LANDING_COPY_LIST_PADDING_START_STYLE = "13.7812px";
const LANDING_COPY_LIST_TEXT_INDENT_STYLE = "-7.78125px";
const STATIC_ROOT_LANDING_LOGO_SRC = "/logo-static.svg";
const STATIC_WAITLIST_HINT = "Enable JavaScript to join the waitlist.";
const STATIC_GOOGLE_PLACEHOLDER_LABEL = "Google sign-in requires JS";
// Keep the build-time fallback aligned with the shipped outline button until
// the routed landing replaces it with the interactive React surface.
const STATIC_OUTLINE_BUTTON_CLASS_NAME =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 corner-notch-1";
const STATIC_INPUT_CLASS_NAME =
  "corner-notch-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

function renderStaticLandingCopyHtml(markdown: string): string {
  const { bullets, slogan } = parseLandingCopyMarkdown(markdown);
  const lines: string[] = [];

  if (slogan.length > 0) {
    lines.push(
      `<div class="cm-line cm-landing-copy-heading"><span class="cm-hidden-token" aria-hidden="true" style="font-size: 0; line-height: 1.75rem;">## </span><span>${escapeHtml(
        slogan,
      )}</span></div>`,
    );
  }

  if (slogan.length > 0 && bullets.length > 0) {
    lines.push('<div class="cm-line cm-landing-copy-gap"><br /></div>');
  }

  for (const [index, bullet] of bullets.entries()) {
    const firstListClassName = index === 0 ? " cm-landing-copy-list-first" : "";
    lines.push(
      `<div class="cm-line cm-landing-copy-list${firstListClassName}" style="padding-inline-start: ${LANDING_COPY_LIST_PADDING_START_STYLE}; text-indent: ${LANDING_COPY_LIST_TEXT_INDENT_STYLE};"><span class="cm-rendered-list-mark" aria-hidden="true">•</span> ${escapeHtml(
        bullet,
      )}</div>`,
    );
  }

  return `<div class="min-h-[1rem] text-sm"><div class="cm-editor cm-landing-copy"><div class="cm-scroller"><div spellcheck="false" autocorrect="off" autocapitalize="off" writingsuggestions="false" translate="no" contenteditable="false" class="cm-content cm-lineWrapping" role="textbox" aria-multiline="true" aria-readonly="true" data-language="markdown">${lines.join("")}</div></div></div></div>`;
}

function renderStaticBuildStatusBarHtml(args: {
  appCommit: string;
  appCommitNumber: number | null;
  repoUrl: string;
}) {
  const buildVersionLabel = formatAppBuildVersionLabel(args.appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(args.appCommit);
  const normalizedRepoUrl = args.repoUrl ? normalizeRepoUrl(args.repoUrl) : "";
  const commitUrl =
    normalizedRepoUrl && args.appCommit !== "unknown"
      ? `${normalizedRepoUrl}/commit/${args.appCommit}`
      : "";

  return `<div data-testid="${APP_BUILD_STATUS_BAR_TEST_ID}" class="flex w-full items-center gap-2">
      <div class="flex items-center gap-3">
        <a class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground" href="/terms">/terms</a>
        <a class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground" href="/privacy">/privacy</a>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <div class="inline-flex select-text items-center gap-2 font-mono">
          <span data-testid="${APP_BUILD_VERSION_TEST_ID}">${escapeHtml(buildVersionLabel)}</span>
          ${
            commitUrl
              ? `<a data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text transition-colors hover:text-foreground" href="${escapeHtml(
                  commitUrl,
                )}" target="_blank" rel="noreferrer noopener" draggable="false" title="${escapeHtml(
                  args.appCommit,
                )}">${escapeHtml(commitLabel)}</a>`
              : `<span data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text" title="${escapeHtml(
                  args.appCommit,
                )}">${escapeHtml(commitLabel)}</span>`
          }
        </div>
      </div>
    </div>`;
}

function renderStaticRootLandingShellHtml(args: {
  appCommit: string;
  appCommitNumber: number | null;
  landingMarkdown: string;
  repoUrl: string;
}) {
  return `<div ${STATIC_ROOT_LANDING_MARKER_ATTRIBUTE}="1" class="flex min-h-svh w-full flex-col bg-background">
    <main class="flex min-h-0 flex-1 flex-col">
      <div data-testid="${PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}" class="flex min-h-0 flex-1 flex-col">
        <div class="container my-auto">
          <div data-testid="${STATIC_LANDING_CONTENT_TEST_ID}" class="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
            <div class="${STATIC_PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME}">
              <div data-testid="${STATIC_PUBLIC_LANDING_LOGO_STAGE_TEST_ID}" class="${STATIC_PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}">
                <img data-testid="${STATIC_PUBLIC_LANDING_LOGO_TEST_ID}" src="${STATIC_ROOT_LANDING_LOGO_SRC}" alt="${escapeHtml(
                  STATIC_PUBLIC_LANDING_LOGO_ALT,
                )}" width="${STATIC_PUBLIC_LANDING_LOGO_WIDTH}" height="${STATIC_PUBLIC_LANDING_LOGO_HEIGHT}" loading="eager" decoding="async" fetchpriority="high" class="${STATIC_PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME}" />
              </div>
            </div>
            <div data-testid="${PUBLIC_LANDING_COPY_TEST_ID}">
              ${renderStaticLandingCopyHtml(args.landingMarkdown)}
            </div>
            <div class="flex flex-col gap-2">
              <button type="button" disabled class="noter-static-no-js-only flex-1 ${STATIC_OUTLINE_BUTTON_CLASS_NAME}">
                ${escapeHtml(STATIC_GOOGLE_PLACEHOLDER_LABEL)}
              </button>
              <button type="button" disabled aria-hidden="true" tabindex="-1" class="hidden noter-static-js-only flex-1 invisible pointer-events-none ${STATIC_OUTLINE_BUTTON_CLASS_NAME}">
                Google
              </button>
            </div>
            <div class="flex flex-col gap-2 pt-2">
              <div class="flex gap-2">
                <input type="email" disabled placeholder="email@example.com" class="${STATIC_INPUT_CLASS_NAME}" />
                <button type="button" disabled class="shrink-0 ${STATIC_OUTLINE_BUTTON_CLASS_NAME}">
                  Join Waitlist
                </button>
              </div>
              <p class="noter-static-no-js-only text-xs text-center text-muted-foreground">
                ${escapeHtml(STATIC_WAITLIST_HINT)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
    <div class="h-5 shrink-0 border-t border-border">
      <div class="container flex h-full items-center overflow-hidden text-xs leading-none text-muted-foreground">
        ${renderStaticBuildStatusBarHtml(args)}
      </div>
    </div>
  </div>`;
}

/**
 * The build keeps the existing routed app shell as `app.html`, then injects a
 * visible root-only landing into `index.html` so `/` stays readable with JS
 * blocked while the SPA still boots when scripts are available.
 */
export function renderStaticRootLandingHtml(args: {
  appCommit: string;
  appCommitNumber: number | null;
  appHtml: string;
  landingMarkdown: string;
  repoUrl: string;
}) {
  if (!args.appHtml.includes(ROOT_PLACEHOLDER_HTML)) {
    throw new Error("Missing root placeholder in built app HTML.");
  }

  const appHtmlWithStaticHead = args.appHtml.replace(
    "</head>",
    `${STATIC_ROOT_LANDING_HEAD_FRAGMENT}
  </head>`,
  );

  return appHtmlWithStaticHead.replace(
    ROOT_PLACEHOLDER_HTML,
    `<div id="root">${renderStaticRootLandingShellHtml(args)}</div>`,
  );
}
