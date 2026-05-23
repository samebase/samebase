export type RouteUrlEditorHrefInputResult =
  | {
      status: "valid";
      href: string;
    }
  | {
      status: "invalid";
      reason: "empty" | "external-origin" | "malformed";
    };

type NormalizeRouteUrlEditorHrefInput = {
  currentHref: string;
  origin: string;
  rawHref: string;
};

export function normalizeRouteUrlEditorHref({
  currentHref,
  origin,
  rawHref,
}: NormalizeRouteUrlEditorHrefInput): RouteUrlEditorHrefInputResult {
  const trimmedHref = rawHref.trim();
  if (!trimmedHref) {
    return {
      status: "invalid",
      reason: "empty",
    };
  }

  if (
    !trimmedHref.startsWith("/") &&
    !trimmedHref.startsWith("?") &&
    !trimmedHref.startsWith("#")
  ) {
    return {
      status: "invalid",
      reason: "malformed",
    };
  }

  try {
    const appOrigin = new URL(origin);
    const currentUrl = new URL(currentHref, appOrigin);
    const nextUrl = new URL(trimmedHref, currentUrl);

    if (nextUrl.origin !== appOrigin.origin) {
      return {
        status: "invalid",
        reason: "external-origin",
      };
    }

    return {
      status: "valid",
      href: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
    };
  } catch {
    return {
      status: "invalid",
      reason: "malformed",
    };
  }
}
