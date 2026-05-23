type NormalizeRouteUrlEditorHrefInput = {
  currentHref: string;
  origin: string;
  rawHref: string;
};

export function normalizeRouteUrlEditorHref({
  currentHref,
  origin,
  rawHref,
}: NormalizeRouteUrlEditorHrefInput): string | null {
  const trimmedHref = rawHref.trim();
  if (!trimmedHref) {
    return null;
  }

  if (
    !trimmedHref.startsWith("/") &&
    !trimmedHref.startsWith("?") &&
    !trimmedHref.startsWith("#")
  ) {
    return null;
  }

  try {
    const appOrigin = new URL(origin);
    const currentUrl = new URL(currentHref, appOrigin);
    const nextUrl = new URL(trimmedHref, currentUrl);

    if (nextUrl.origin !== appOrigin.origin) {
      return null;
    }

    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return null;
  }
}
