import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "./codexAppServerResearch";
import { DASHBOARD_ROUTE } from "./dashboardRoute";
import { INDEXED_DB_ROUTE } from "./indexedDbRoute";
import { LANDING_MARKDOWN_PREVIEW_ROUTE } from "./landingMarkdownPreview";
import { LOCAL_STORAGE_ROUTE } from "./localStorageRoute";
import { MACHINES_ROUTE, MACHINE_CONNECT_ROUTE } from "./noterSync";

export type PageMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  openGraphType?: "website" | "article";
};

const DEFAULT_SITE_NAME = "noter";
const DEFAULT_SITE_ORIGIN = "https://noter.md";
const DEFAULT_SOCIAL_IMAGE_PATH = "/noter-social-card.png";

export const HOME_PAGE_METADATA: PageMetadata = {
  title: "noter | GitHub-backed markdown notes and AI workspace",
  description:
    "GitHub-backed markdown notes and AI workspace. Keep notes and code in a real repository, collaborate in real time, and ship small apps from the same workspace.",
  canonicalPath: "/",
  robots: "index,follow",
  openGraphType: "website",
};

export const PRIVACY_PAGE_METADATA: PageMetadata = {
  title: "Privacy Policy | noter",
  description:
    "Privacy Policy for noter. Describes the data the current app stores, the providers it talks to, and the browser storage it uses.",
  canonicalPath: "/privacy",
  robots: "index,follow",
  openGraphType: "website",
};

export const TERMS_PAGE_METADATA: PageMetadata = {
  title: "Terms of Service | noter",
  description:
    "Terms of Service for noter. Describes the rules, responsibilities, and legal terms for using noter and noter.md.",
  canonicalPath: "/terms",
  robots: "index,follow",
  openGraphType: "website",
};

export const PITCH_DECK_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck | Noter",
  description: "Pitch deck surface for Noter. Public route used for deck review and PDF export.",
  canonicalPath: "/pitch",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const PITCH_DECK_PRINT_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck Print | Noter",
  description: "Print-ready pitch deck surface for Noter. Used for stable PDF export.",
  canonicalPath: "/pitch/print",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const PITCH_DECK_MOBILE_PRINT_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck Mobile Print | Noter",
  description: "Mobile print-ready pitch deck surface for Noter. Used for vertical PDF export.",
  canonicalPath: "/pitch/print/mobile",
  robots: "noindex,nofollow",
  openGraphType: "website",
};
export const APP_PAGE_METADATA: PageMetadata = {
  title: "noter App",
  description: "Private noter application workspace.",
  canonicalPath: DASHBOARD_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const NOT_FOUND_PAGE_METADATA: PageMetadata = {
  title: "Page not found | noter",
  description: "The requested noter page could not be found.",
  canonicalPath: "/",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const MACHINE_CONNECT_PAGE_METADATA: PageMetadata = {
  title: "Connect This Machine | noter",
  description: "Connect a Codex machine to noter with a deploy-scoped bootstrap command.",
  canonicalPath: MACHINE_CONNECT_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const MACHINES_PAGE_METADATA: PageMetadata = {
  title: "Machines | noter",
  description: "Browse connected machines and continue machine-local Codex threads from noter.",
  canonicalPath: MACHINES_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const LOCAL_STORAGE_PAGE_METADATA: PageMetadata = {
  title: "localStorage | noter",
  description: "Browser localStorage diagnostic route for noter.",
  canonicalPath: LOCAL_STORAGE_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const INDEXED_DB_PAGE_METADATA: PageMetadata = {
  title: "indexedDB | noter",
  description: "Browser indexedDB diagnostic route for noter.",
  canonicalPath: INDEXED_DB_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const LANDING_MARKDOWN_PREVIEW_PAGE_METADATA: PageMetadata = {
  title: "Landing Preview | noter",
  description: "Markdown landing preview for noter.",
  canonicalPath: LANDING_MARKDOWN_PREVIEW_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export function resolveAppPageTitle(pathname: string): string {
  if (pathname === DASHBOARD_ROUTE) {
    return "Vaults | noter";
  }

  if (pathname === "/pricing") {
    return "Pricing | noter";
  }

  if (pathname === "/privacy") {
    return "Privacy Policy | noter";
  }

  if (pathname === "/terms") {
    return "Terms of Service | noter";
  }

  if (pathname === "/pitch") {
    return PITCH_DECK_PAGE_METADATA.title;
  }

  if (pathname === "/pitch/print") {
    return PITCH_DECK_PRINT_PAGE_METADATA.title;
  }

  if (pathname === "/pitch/print/mobile") {
    return PITCH_DECK_MOBILE_PRINT_PAGE_METADATA.title;
  }

  if (pathname === CODEX_APP_SERVER_RESEARCH_ROUTE) {
    return "Codex App Server Research | noter";
  }

  if (pathname === CODEX_APP_SERVER_THREAD_BROWSER_ROUTE) {
    return "Codex Thread Browser Research | noter";
  }

  if (pathname === MACHINE_CONNECT_ROUTE) {
    return MACHINE_CONNECT_PAGE_METADATA.title;
  }

  if (pathname === MACHINES_ROUTE) {
    return MACHINES_PAGE_METADATA.title;
  }

  if (pathname === LANDING_MARKDOWN_PREVIEW_ROUTE) {
    return LANDING_MARKDOWN_PREVIEW_PAGE_METADATA.title;
  }

  if (pathname === LOCAL_STORAGE_ROUTE) {
    return LOCAL_STORAGE_PAGE_METADATA.title;
  }

  if (pathname === INDEXED_DB_ROUTE) {
    return INDEXED_DB_PAGE_METADATA.title;
  }

  if (pathname.startsWith("/vault/")) {
    return "Workspace | noter";
  }

  return "noter App";
}

export function resolvePageMetadata(args: {
  pathname: string;
  isAuthenticated: boolean;
}): PageMetadata {
  if (args.pathname === "/privacy") {
    return PRIVACY_PAGE_METADATA;
  }

  if (args.pathname === "/terms") {
    return TERMS_PAGE_METADATA;
  }

  if (args.pathname === "/pitch") {
    return PITCH_DECK_PAGE_METADATA;
  }

  if (args.pathname === "/pitch/print") {
    return PITCH_DECK_PRINT_PAGE_METADATA;
  }

  if (args.pathname === "/pitch/print/mobile") {
    return PITCH_DECK_MOBILE_PRINT_PAGE_METADATA;
  }

  if (args.pathname === MACHINE_CONNECT_ROUTE) {
    return MACHINE_CONNECT_PAGE_METADATA;
  }

  if (args.pathname === MACHINES_ROUTE) {
    return MACHINES_PAGE_METADATA;
  }

  if (args.pathname === LANDING_MARKDOWN_PREVIEW_ROUTE) {
    return LANDING_MARKDOWN_PREVIEW_PAGE_METADATA;
  }

  if (args.pathname === LOCAL_STORAGE_ROUTE) {
    return LOCAL_STORAGE_PAGE_METADATA;
  }

  if (args.pathname === INDEXED_DB_ROUTE) {
    return INDEXED_DB_PAGE_METADATA;
  }

  if (args.pathname === "/") {
    return HOME_PAGE_METADATA;
  }

  return {
    ...APP_PAGE_METADATA,
    canonicalPath: args.pathname,
    title: resolveAppPageTitle(args.pathname),
  };
}

export function resolveNotFoundPageMetadata(pathname: string): PageMetadata {
  return {
    ...NOT_FOUND_PAGE_METADATA,
    canonicalPath: pathname,
  };
}

function resolveSiteOrigin(): string {
  return DEFAULT_SITE_ORIGIN;
}

function resolveCanonicalUrl(canonicalPath: string): string {
  return new URL(canonicalPath, resolveSiteOrigin()).toString();
}

function upsertMetaTag({
  key,
  value,
  content,
}: {
  key: "name" | "property";
  value: string;
  content: string;
}): void {
  const selector = `meta[${key}="${value}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(key, value);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertCanonicalLink(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

export function applyPageMetadata(metadata: PageMetadata): void {
  if (typeof document === "undefined") {
    return;
  }

  const canonicalUrl = resolveCanonicalUrl(metadata.canonicalPath);
  const socialImageUrl = new URL(DEFAULT_SOCIAL_IMAGE_PATH, resolveSiteOrigin()).toString();

  document.title = metadata.title;

  upsertMetaTag({
    key: "name",
    value: "description",
    content: metadata.description,
  });
  upsertMetaTag({
    key: "name",
    value: "robots",
    content: metadata.robots,
  });
  upsertMetaTag({
    key: "property",
    value: "og:site_name",
    content: DEFAULT_SITE_NAME,
  });
  upsertMetaTag({
    key: "property",
    value: "og:type",
    content: metadata.openGraphType ?? "website",
  });
  upsertMetaTag({
    key: "property",
    value: "og:title",
    content: metadata.title,
  });
  upsertMetaTag({
    key: "property",
    value: "og:description",
    content: metadata.description,
  });
  upsertMetaTag({
    key: "property",
    value: "og:url",
    content: canonicalUrl,
  });
  upsertMetaTag({
    key: "property",
    value: "og:image",
    content: socialImageUrl,
  });
  upsertMetaTag({
    key: "name",
    value: "twitter:card",
    content: "summary_large_image",
  });
  upsertMetaTag({
    key: "name",
    value: "twitter:title",
    content: metadata.title,
  });
  upsertMetaTag({
    key: "name",
    value: "twitter:description",
    content: metadata.description,
  });
  upsertMetaTag({
    key: "name",
    value: "twitter:image",
    content: socialImageUrl,
  });
  upsertCanonicalLink(canonicalUrl);
}
