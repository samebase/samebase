export type PageMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  openGraphType?: "website" | "article";
};

const DEFAULT_SITE_NAME = "Noter";
const DEFAULT_SITE_ORIGIN = "https://noter.md";
const DEFAULT_SOCIAL_IMAGE_PATH = "/noter-social-card.png";

export const HOME_PAGE_METADATA: PageMetadata = {
  title: "Noter | GitHub-backed workspace for AI agents",
  description:
    "GitHub-backed workspace for AI agents and human operators. Collaborate in real time, keep code and notes in a real repository, and work from anywhere.",
  canonicalPath: "/",
  robots: "index,follow",
  openGraphType: "website",
};

export const PRIVACY_PAGE_METADATA: PageMetadata = {
  title: "Privacy Policy | Noter",
  description:
    "Privacy Policy for Noter. Describes the data the current Noter app stores, the providers it talks to, and the browser storage it uses.",
  canonicalPath: "/privacy",
  robots: "index,follow",
  openGraphType: "website",
};

export const PITCH_DECK_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck | Noter",
  description:
    "Pitch deck surface for Noter. Public route used for deck review and PDF export.",
  canonicalPath: "/pitch",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const PITCH_DECK_PRINT_PAGE_METADATA: PageMetadata = {
  title: "Pitch Deck Print | Noter",
  description:
    "Print-ready pitch deck surface for Noter. Used for stable PDF export.",
  canonicalPath: "/pitch/print",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export const APP_PAGE_METADATA: PageMetadata = {
  title: "Noter App",
  description: "Private Noter application workspace.",
  canonicalPath: "/",
  robots: "noindex,nofollow",
  openGraphType: "website",
};

export function resolveAppPageTitle(pathname: string): string {
  if (pathname === "/") {
    return "Vaults | Noter";
  }

  if (pathname === "/pricing") {
    return "Pricing | Noter";
  }

  if (pathname === "/privacy") {
    return "Privacy Policy | Noter";
  }

  if (pathname === "/pitch") {
    return PITCH_DECK_PAGE_METADATA.title;
  }

  if (pathname === "/pitch/print") {
    return PITCH_DECK_PRINT_PAGE_METADATA.title;
  }

  if (pathname.startsWith("/vault/")) {
    return "Workspace | Noter";
  }

  return "Noter App";
}

export function resolvePageMetadata(args: {
  pathname: string;
  isAuthenticated: boolean;
}): PageMetadata {
  if (args.pathname === "/privacy") {
    return PRIVACY_PAGE_METADATA;
  }

  if (args.pathname === "/pitch") {
    return PITCH_DECK_PAGE_METADATA;
  }

  if (args.pathname === "/pitch/print") {
    return PITCH_DECK_PRINT_PAGE_METADATA;
  }

  if (!args.isAuthenticated && args.pathname === "/") {
    return HOME_PAGE_METADATA;
  }

  return {
    ...APP_PAGE_METADATA,
    canonicalPath: args.pathname,
    title: resolveAppPageTitle(args.pathname),
  };
}

export function resolveBootstrapPageMetadata(pathname: string): PageMetadata {
  if (pathname === "/privacy") {
    return PRIVACY_PAGE_METADATA;
  }

  if (pathname === "/pitch") {
    return PITCH_DECK_PAGE_METADATA;
  }

  if (pathname === "/pitch/print") {
    return PITCH_DECK_PRINT_PAGE_METADATA;
  }

  return {
    ...APP_PAGE_METADATA,
    canonicalPath: pathname,
    title: resolveAppPageTitle(pathname),
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
  let element = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );

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
  const socialImageUrl = new URL(
    DEFAULT_SOCIAL_IMAGE_PATH,
    resolveSiteOrigin(),
  ).toString();

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
