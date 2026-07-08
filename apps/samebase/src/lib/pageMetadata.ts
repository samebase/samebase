import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/codex/appServerResearch";
import { DASHBOARD_ROUTE } from "./dashboardRoute";
import { INDEXED_DB_ROUTE } from "./indexedDbRoute";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ROUTE,
} from "@/routeSearch/landingPreview";
import { LOCAL_STORAGE_ROUTE } from "./localStorageRoute";
import { MACHINES_ROUTE, MACHINE_CONNECT_ROUTE } from "./samebaseSync";
import { SAMEBASE_BRAND_COPY } from "./samebaseBrandCopy";

export type PageMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  openGraphType?: "website" | "article";
};

const DEFAULT_SITE_NAME = SAMEBASE_BRAND_COPY.productName;
const DEFAULT_SITE_ORIGIN = "https://samebase.com";
const DEFAULT_SOCIAL_IMAGE_PATH = "/samebase-social-card.png";

export const HOME_PAGE_METADATA: PageMetadata = {
  title: SAMEBASE_BRAND_COPY.homepage.title,
  description: SAMEBASE_BRAND_COPY.homepage.description,
  canonicalPath: "/",
  robots: "index,follow",
  openGraphType: "website",
};

export const PRIVACY_PAGE_METADATA: PageMetadata = {
  title: "Privacy Policy | Samebase",
  description:
    "Privacy Policy for Samebase. Describes the data the current app stores, the providers it talks to, and the browser storage it uses.",
  canonicalPath: "/privacy",
  robots: "index,follow",
  openGraphType: "website",
};

export const TERMS_PAGE_METADATA: PageMetadata = {
  title: "Terms of Service | Samebase",
  description:
    "Terms of Service for Samebase. Describes the rules, responsibilities, and legal terms for using Samebase and samebase.com.",
  canonicalPath: "/terms",
  robots: "index,follow",
  openGraphType: "website",
};

export const PITCH_DECK_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck | Samebase",
  description: "Pitch deck surface for Samebase. Public route used for deck review and PDF export.",
  canonicalPath: "/pitch",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const PITCH_DECK_PRINT_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck Print | Samebase",
  description: "Print-ready pitch deck surface for Samebase. Used for stable PDF export.",
  canonicalPath: "/pitch/print",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const PITCH_DECK_MOBILE_PRINT_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck Mobile Print | Samebase",
  description: "Mobile print-ready pitch deck surface for Samebase. Used for vertical PDF export.",
  canonicalPath: "/pitch/print/mobile",
  robots: "noindex,nofollow",
  openGraphType: "website",
};
export const APP_PAGE_METADATA: PageMetadata = {
  title: "Samebase App",
  description: "Private Samebase application workspace.",
  canonicalPath: DASHBOARD_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const NOT_FOUND_PAGE_METADATA: PageMetadata = {
  title: "Page not found | Samebase",
  description: "The requested Samebase page could not be found.",
  canonicalPath: "/",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const MACHINE_CONNECT_PAGE_METADATA: PageMetadata = {
  title: "Connect This Machine | Samebase",
  description: "Connect a Codex machine to Samebase with a deploy-scoped bootstrap command.",
  canonicalPath: MACHINE_CONNECT_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const MACHINES_PAGE_METADATA: PageMetadata = {
  title: "Machines | Samebase",
  description: "Browse connected machines and continue machine-local Codex threads from Samebase.",
  canonicalPath: MACHINES_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const LOCAL_STORAGE_PAGE_METADATA: PageMetadata = {
  title: "localStorage | Samebase",
  description: "Browser localStorage diagnostic route for Samebase.",
  canonicalPath: LOCAL_STORAGE_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const INDEXED_DB_PAGE_METADATA: PageMetadata = {
  title: "indexedDB | Samebase",
  description: "Browser indexedDB diagnostic route for Samebase.",
  canonicalPath: INDEXED_DB_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const LANDING_PREVIEW_PAGE_METADATA: PageMetadata = {
  title: "Landing Preview | Samebase",
  description: "Landing page preview for Samebase.",
  canonicalPath: LANDING_PREVIEW_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const DOCS_DO_IT_YOURSELF_PAGE_METADATA: PageMetadata = {
  title: "Do it yourself | Samebase",
  description: "Deploy the Samebase stack by hand, with no Samebase account.",
  canonicalPath: DOCS_DO_IT_YOURSELF_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const DOCS_THE_STACK_PAGE_METADATA: PageMetadata = {
  title: "The stack | Samebase",
  description: "What the Samebase template ships and why each piece was chosen.",
  canonicalPath: DOCS_THE_STACK_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const DOCS_RECEIPTS_PAGE_METADATA: PageMetadata = {
  title: "Receipts | Samebase",
  description: "Every factual Samebase claim with its primary source and check date.",
  canonicalPath: DOCS_RECEIPTS_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const DOCS_PRICING_PAGE_METADATA: PageMetadata = {
  title: "Pricing | Samebase",
  description: "What stays free, what will be metered, and why there is no price list yet.",
  canonicalPath: DOCS_PRICING_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export function resolveAppPageTitle(pathname: string): string {
  if (pathname === DASHBOARD_ROUTE) {
    return "Vaults | Samebase";
  }

  if (pathname === "/pricing") {
    return "Pricing | Samebase";
  }

  if (pathname === "/privacy") {
    return "Privacy Policy | Samebase";
  }

  if (pathname === "/terms") {
    return "Terms of Service | Samebase";
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
    return "Codex App Server Research | Samebase";
  }

  if (pathname === CODEX_APP_SERVER_THREAD_BROWSER_ROUTE) {
    return "Codex Thread Browser Research | Samebase";
  }

  if (pathname === MACHINE_CONNECT_ROUTE) {
    return MACHINE_CONNECT_PAGE_METADATA.title;
  }

  if (pathname === MACHINES_ROUTE) {
    return MACHINES_PAGE_METADATA.title;
  }

  if (pathname === LANDING_PREVIEW_ROUTE) {
    return LANDING_PREVIEW_PAGE_METADATA.title;
  }

  if (pathname === DOCS_DO_IT_YOURSELF_ROUTE) {
    return DOCS_DO_IT_YOURSELF_PAGE_METADATA.title;
  }

  if (pathname === DOCS_THE_STACK_ROUTE) {
    return DOCS_THE_STACK_PAGE_METADATA.title;
  }

  if (pathname === DOCS_RECEIPTS_ROUTE) {
    return DOCS_RECEIPTS_PAGE_METADATA.title;
  }

  if (pathname === LOCAL_STORAGE_ROUTE) {
    return LOCAL_STORAGE_PAGE_METADATA.title;
  }

  if (pathname === INDEXED_DB_ROUTE) {
    return INDEXED_DB_PAGE_METADATA.title;
  }

  if (pathname.startsWith("/vault/")) {
    return "Workspace | Samebase";
  }

  return "Samebase App";
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

  if (args.pathname === LANDING_PREVIEW_ROUTE) {
    return LANDING_PREVIEW_PAGE_METADATA;
  }

  if (args.pathname === DOCS_DO_IT_YOURSELF_ROUTE) {
    return DOCS_DO_IT_YOURSELF_PAGE_METADATA;
  }

  if (args.pathname === DOCS_THE_STACK_ROUTE) {
    return DOCS_THE_STACK_PAGE_METADATA;
  }

  if (args.pathname === DOCS_RECEIPTS_ROUTE) {
    return DOCS_RECEIPTS_PAGE_METADATA;
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
