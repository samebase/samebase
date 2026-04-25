type EditableRouteHrefResult =
  | {
      href: string;
      ok: true;
    }
  | {
      ok: false;
    };

/**
 * Keep the editable route field inside the app: app-relative paths and
 * same-origin absolute URLs can become TanStack hrefs, external URLs cannot.
 */
export function resolveEditableRouteHref(
  input: string,
  origin?: string,
): EditableRouteHrefResult {
  const trimmedInput = input.trim();

  if (trimmedInput.length === 0 || trimmedInput.startsWith("//")) {
    return { ok: false };
  }

  if (trimmedInput.startsWith("/")) {
    return { href: trimmedInput, ok: true };
  }

  if (origin === undefined) {
    return { ok: false };
  }

  try {
    const url = new URL(trimmedInput);
    if (url.origin !== origin) {
      return { ok: false };
    }

    return {
      href: `${url.pathname}${url.search}${url.hash}`,
      ok: true,
    };
  } catch {
    return { ok: false };
  }
}
