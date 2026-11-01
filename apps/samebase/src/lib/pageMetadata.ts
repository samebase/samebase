import { DASHBOARD_ROUTE } from "./dashboardRoute";
import { INDEXED_DB_ROUTE } from "./indexedDbRoute";
import {
  DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE,
  DOCS_CLOUDFLARE_SETUP_ROUTE,
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_INDEX_ROUTE,
  DOCS_CHANGELOG_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_THE_BIG_MIGRATION_ROUTE,
  DOCS_THE_STACK_ROUTE,
} from "@/routeSearch/landingPreview";
import { LOCAL_STORAGE_ROUTE } from "./localStorageRoute";
import { SAMEBASE_BRAND_COPY } from "./samebaseBrandCopy";
import {
  AGENT_BROWSER_HANDOFF_ROUTE,
  isAgentBrowserHandoffRoute,
} from "../../shared/agentBrowserHandoff";
import { ORGANIZATIONS_ROUTE } from "../organization/organizationRoutes";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

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
    "How Samebase handles personal information, including why it is used, who receives it, how long it is kept, and your rights.",
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
  title: "Page not available | Samebase",
  description: "The requested Samebase page is not available.",
  canonicalPath: "/",
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

export const DOCS_INDEX_PAGE_METADATA: PageMetadata = {
  title: "Docs | Samebase",
  description: "Samebase product, setup, stack, pricing, and source documentation.",
  canonicalPath: DOCS_INDEX_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_DO_IT_YOURSELF_PAGE_METADATA: PageMetadata = {
  title: "Do it yourself | Samebase",
  description: "Deploy the Samebase stack by hand, with no Samebase account.",
  canonicalPath: DOCS_DO_IT_YOURSELF_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_CLOUDFLARE_SETUP_PAGE_METADATA: PageMetadata = {
  title: "Set up Cloudflare for your first Samebase app | Samebase",
  description:
    "Create the first Cloudflare Workers Builds API token, then let Samebase create the real Worker.",
  canonicalPath: DOCS_CLOUDFLARE_SETUP_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_THE_BIG_MIGRATION_PAGE_METADATA: PageMetadata = {
  title: "The big migration | Samebase",
  description: "How Samebase works with Alchemy, and how to move a Worker or Convex app.",
  canonicalPath: DOCS_THE_BIG_MIGRATION_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_THE_STACK_PAGE_METADATA: PageMetadata = {
  title: "The stack | Samebase",
  description: "What the Samebase template ships and why each piece was chosen.",
  canonicalPath: DOCS_THE_STACK_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_PAGE_METADATA: PageMetadata = {
  title: "Migrate to Cloudflare Worker Previews | Samebase",
  description: "Update an existing Samebase app to use Cloudflare Worker Previews.",
  canonicalPath: DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_RECEIPTS_PAGE_METADATA: PageMetadata = {
  title: "Receipts | Samebase",
  description: "Every factual Samebase claim with its primary source and check date.",
  canonicalPath: DOCS_RECEIPTS_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_PRICING_PAGE_METADATA: PageMetadata = {
  title: "Pricing | Samebase",
  description: "The Free and Pro connection limits, member limits, and monthly prices.",
  canonicalPath: DOCS_PRICING_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const DOCS_CHANGELOG_PAGE_METADATA: PageMetadata = {
  title: "Changelog | Samebase",
  description: "What changed in Samebase, newest first.",
  canonicalPath: DOCS_CHANGELOG_ROUTE,
  robots: "index,follow",
  openGraphType: "website",
};

export const AGENT_BROWSER_HANDOFF_PAGE_METADATA: PageMetadata = {
  title: "Connect Samebase | Samebase",
  description: "One-time browser connection route for Samebase MCP clients.",
  canonicalPath: AGENT_BROWSER_HANDOFF_ROUTE,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const MCP_CONSENT_PAGE_METADATA: PageMetadata = {
  title: "Authorize MCP client | Samebase",
  description: "Authorization route for a Samebase MCP client.",
  canonicalPath: MCP_CONSENT_APP_PATH,
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const LOGO_PAGE_METADATA: PageMetadata = {
  title: "Logo Preview | Samebase",
  description: "Developer preview for exploring Samebase logo rendering.",
  canonicalPath: "/logo",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export function resolveAppPageTitle(pathname: string): string {
  if (pathname === DASHBOARD_ROUTE || pathname === `${DASHBOARD_ROUTE}/`) {
    return "Repositories | Samebase";
  }

  if (pathname === ORGANIZATIONS_ROUTE || pathname === `${ORGANIZATIONS_ROUTE}/`) {
    return "Organizations | Samebase";
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

  if (pathname === DOCS_INDEX_ROUTE) {
    return DOCS_INDEX_PAGE_METADATA.title;
  }

  if (pathname === DOCS_DO_IT_YOURSELF_ROUTE) {
    return DOCS_DO_IT_YOURSELF_PAGE_METADATA.title;
  }

  if (pathname === DOCS_CLOUDFLARE_SETUP_ROUTE) {
    return DOCS_CLOUDFLARE_SETUP_PAGE_METADATA.title;
  }

  if (pathname === DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE) {
    return DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_PAGE_METADATA.title;
  }

  if (pathname === DOCS_THE_BIG_MIGRATION_ROUTE) {
    return DOCS_THE_BIG_MIGRATION_PAGE_METADATA.title;
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

  if (pathname.startsWith("/repo/")) {
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

  if (args.pathname === DOCS_INDEX_ROUTE) {
    return DOCS_INDEX_PAGE_METADATA;
  }

  if (args.pathname === DOCS_DO_IT_YOURSELF_ROUTE) {
    return DOCS_DO_IT_YOURSELF_PAGE_METADATA;
  }

  if (args.pathname === DOCS_CLOUDFLARE_SETUP_ROUTE) {
    return DOCS_CLOUDFLARE_SETUP_PAGE_METADATA;
  }

  if (args.pathname === DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_ROUTE) {
    return DOCS_CLOUDFLARE_PREVIEWS_MIGRATION_PAGE_METADATA;
  }

  if (args.pathname === DOCS_THE_BIG_MIGRATION_ROUTE) {
    return DOCS_THE_BIG_MIGRATION_PAGE_METADATA;
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

  if (args.pathname === MCP_CONSENT_APP_PATH) {
    return MCP_CONSENT_PAGE_METADATA;
  }

  if (args.pathname === "/logo") {
    return LOGO_PAGE_METADATA;
  }

  if (isAgentBrowserHandoffRoute(args.pathname)) {
    return AGENT_BROWSER_HANDOFF_PAGE_METADATA;
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

export function buildPageHead(metadata: PageMetadata) {
  const canonicalUrl = resolveCanonicalUrl(metadata.canonicalPath);

  return {
    links: [
      {
        rel: "canonical",
        href: canonicalUrl,
      },
    ],
    meta: [
      {
        title: metadata.title,
      },
      {
        name: "description",
        content: metadata.description,
      },
      {
        name: "robots",
        content: metadata.robots,
      },
      {
        property: "og:type",
        content: metadata.openGraphType ?? "website",
      },
      {
        property: "og:title",
        content: metadata.title,
      },
      {
        property: "og:description",
        content: metadata.description,
      },
      {
        property: "og:url",
        content: canonicalUrl,
      },
      {
        name: "twitter:title",
        content: metadata.title,
      },
      {
        name: "twitter:description",
        content: metadata.description,
      },
    ],
  };
}

export function buildLogoLabPageHead(canonicalPath: "/logo" | `/logo/${string}`, title: string) {
  return buildPageHead({
    title: `${title} | Samebase`,
    description: "Developer preview for exploring Samebase logo rendering.",
    canonicalPath,
    robots: "noindex,nofollow",
    openGraphType: "website",
  });
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
