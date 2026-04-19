import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Chrome } from "lucide-react";
import { createStaticLogoSvgDataUrl } from "../components/logoStaticSvgAsset";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
} from "./appBuild";
import { landingPageBullets } from "./landingCopy";
import { STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE } from "./staticPublicLandingShared";

export const STATIC_PUBLIC_LANDING_INDEX_TOKEN =
  "<!--__NOTER_STATIC_PUBLIC_LANDING__-->";

type StaticPublicLandingArgs = {
  appCommit: string;
  appCommitNumber: number | null;
  landingPageSlogan: string;
  repoUrl: string;
};

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

function renderStaticGoogleIconMarkup(): string {
  return renderToStaticMarkup(
    createElement(Chrome, { className: "mr-2 h-4 w-4" }),
  );
}

function renderStaticPublicLandingStatusBar(args: {
  appCommit: string;
  appCommitNumber: number | null;
  repoUrl: string;
}): string {
  const buildVersionLabel = formatAppBuildVersionLabel(args.appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(args.appCommit);
  const normalizedRepoUrl = args.repoUrl ? normalizeRepoUrl(args.repoUrl) : "";
  const commitUrl =
    normalizedRepoUrl && args.appCommit !== "unknown"
      ? `${normalizedRepoUrl}/commit/${args.appCommit}`
      : "";

  return `<div data-testid="${APP_BUILD_STATUS_BAR_TEST_ID}" class="flex w-full items-center gap-2"><div class="flex items-center gap-3"><a href="/terms" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">/terms</a><a href="/privacy" class="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground">/privacy</a></div><div class="ml-auto flex items-center gap-2"><div class="inline-flex select-text items-center gap-2 font-mono"><span data-testid="${APP_BUILD_VERSION_TEST_ID}">${escapeHtml(buildVersionLabel)}</span>${commitUrl ? `<a data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text transition-colors hover:text-foreground" href="${escapeHtml(commitUrl)}" target="_blank" rel="noreferrer noopener" draggable="false" title="${escapeHtml(args.appCommit)}">${escapeHtml(commitLabel)}</a>` : `<span data-testid="${APP_BUILD_COMMIT_LINK_TEST_ID}" class="select-text" title="${escapeHtml(args.appCommit)}">${escapeHtml(commitLabel)}</span>`}</div></div></div>`;
}

function renderStaticPublicLandingCopyMarkup(
  landingPageSlogan: string,
): string {
  const bulletMarkup = landingPageBullets
    .map(
      (bullet) =>
        `<li class="flex gap-1"><span aria-hidden="true" class="shrink-0 text-foreground">-</span><span>${escapeHtml(bullet)}</span></li>`,
    )
    .join("");

  return `<div class="text-sm leading-5"><h2 class="text-lg font-medium leading-7 tracking-tight text-primary">${escapeHtml(landingPageSlogan)}</h2><ul class="mt-[9px] space-y-2 text-muted-foreground">${bulletMarkup}</ul></div>`;
}

function renderStaticPublicLandingAuthMarkup(): string {
  return `<div class="flex flex-col gap-2"><button aria-hidden="true" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 corner-notch-1 flex-1 invisible pointer-events-none" disabled="" type="button" tabindex="-1">${renderStaticGoogleIconMarkup()} Google</button></div>`;
}

function renderStaticPublicLandingFooterMarkup(): string {
  return `<div class="flex flex-col gap-2 pt-2"><a class="text-center text-sm text-muted-foreground underline underline-offset-4" href="https://x.com/noter_md" rel="noopener noreferrer" target="_blank">https://x.com/noter_md</a></div>`;
}

function renderStaticPublicLandingLogoMarkup(): string {
  return `<div class="mx-auto w-full max-w-[11rem]"><div data-testid="public-landing-logo-stage" class="relative w-full"><img data-testid="public-landing-logo" src="${escapeHtml(createStaticLogoSvgDataUrl())}" alt="Noter logo" width="360" height="360" loading="eager" decoding="async" fetchpriority="high" class="block h-auto w-full relative z-10 transition-opacity duration-500 ease-out motion-reduce:transition-none opacity-100"/></div></div>`;
}

export function renderStaticPublicLandingMarkup(
  args: StaticPublicLandingArgs,
): string {
  return `<div class="flex min-h-svh w-full flex-col bg-background"><main class="flex min-h-0 flex-1 flex-col"><div data-testid="public-landing-scroll-shell" class="flex min-h-0 flex-1 flex-col"><div class="container my-auto"><div data-testid="public-landing-content" class="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">${renderStaticPublicLandingLogoMarkup()}<div data-testid="public-landing-copy">${renderStaticPublicLandingCopyMarkup(args.landingPageSlogan)}</div>${renderStaticPublicLandingAuthMarkup()}${renderStaticPublicLandingFooterMarkup()}</div></div></div></main><div class="h-5 shrink-0 border-t border-border"><div class="container flex h-full items-center overflow-hidden text-xs leading-none text-muted-foreground">${renderStaticPublicLandingStatusBar(args)}</div></div></div>`;
}

export function injectStaticPublicLandingIntoIndexHtml(args: {
  indexHtml: string;
  staticMarkup: string;
}): string {
  const replacement = `<div id="root" ${STATIC_PUBLIC_LANDING_ROOT_ATTRIBUTE}="true">${args.staticMarkup}</div>`;

  if (!args.indexHtml.includes(STATIC_PUBLIC_LANDING_INDEX_TOKEN)) {
    throw new Error(
      "Missing static public landing token in apps/noter/index.html",
    );
  }

  return args.indexHtml.replace(
    `<div id="root">${STATIC_PUBLIC_LANDING_INDEX_TOKEN}</div>`,
    replacement,
  );
}
