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

export function isRouteUrlEditorHostSegment(value: string): boolean {
  return (
    value === "localhost" || value.startsWith("[") || value.includes(".") || value.includes(":")
  );
}

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

  try {
    const appOrigin = new URL(origin);
    const currentUrl = new URL(currentHref, appOrigin);
    const sameOriginAddress =
      trimmedHref === appOrigin.host ||
      trimmedHref.startsWith(`${appOrigin.host}/`) ||
      trimmedHref.startsWith(`${appOrigin.host}?`) ||
      trimmedHref.startsWith(`${appOrigin.host}#`);
    const firstAddressSegment = trimmedHref.split(/[/?#]/, 1)[0] ?? "";
    const hostLikeAddress =
      /^[a-z0-9.[\]-]+(?::\d+)?$/i.test(firstAddressSegment) &&
      isRouteUrlEditorHostSegment(firstAddressSegment);
    const nextUrl = new URL(
      sameOriginAddress || hostLikeAddress ? `//${trimmedHref}` : trimmedHref,
      currentUrl,
    );

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
