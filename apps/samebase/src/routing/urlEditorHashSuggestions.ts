const ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_SELECTOR = [
  "[data-landing-heading-id]",
  "[data-route-url-hash-suggestion]",
] as const;

export const ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_ATTRIBUTES = [
  "data-landing-heading-id",
  "data-route-url-hash-suggestion",
] as const;

function normalizeRouteUrlEditorHashSuggestionKey(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const key = value.trim().replace(/^#/, "");
  return key.length > 0 ? key : null;
}

function readRouteUrlEditorElementHashSuggestionKey(element: HTMLElement): string | null {
  return (
    normalizeRouteUrlEditorHashSuggestionKey(element.dataset["landingHeadingId"]) ??
    normalizeRouteUrlEditorHashSuggestionKey(element.dataset["routeUrlHashSuggestion"])
  );
}

/**
 * Hash suggestions come from existing page-owned anchor metadata. The URL
 * editor only reads those final IDs so it cannot drift from the page behavior.
 */
export function readRouteUrlEditorDocumentHashSuggestionKeys(root: ParentNode): readonly string[] {
  const keys: string[] = [];
  const seenKeys = new Set<string>();
  const selector = ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_SELECTOR.join(",");

  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const key = readRouteUrlEditorElementHashSuggestionKey(element);
    if (key === null || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    keys.push(key);
  }

  return keys;
}
