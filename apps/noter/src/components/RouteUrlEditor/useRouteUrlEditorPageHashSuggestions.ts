import { useEffect, useState } from "react";
import {
  ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_ATTRIBUTES,
  readRouteUrlEditorDocumentHashSuggestionKeys,
} from "@/lib/routeUrlEditorHashSuggestions";

function areHashKeysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (const [index, value] of left.entries()) {
    if (value !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
Reads page-owned hash targets for the URL editor.

Pages own their anchor IDs. This hook is the DOM bridge for page content that cannot hand those
IDs to app chrome directly, such as markdown headings or data-loaded dashboard cards. Keep the DOM
observer here so `useRouteEditorVm` only consumes `pageHashKeys`.
*/
export function useRouteUrlEditorPageHashSuggestions(): readonly string[] {
  const [pageHashKeys, setPageHashKeys] = useState<readonly string[]>([]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const refreshPageHashKeys = () => {
      const nextPageHashKeys = readRouteUrlEditorDocumentHashSuggestionKeys(document);
      setPageHashKeys((currentPageHashKeys) =>
        areHashKeysEqual(currentPageHashKeys, nextPageHashKeys)
          ? currentPageHashKeys
          : nextPageHashKeys,
      );
    };

    refreshPageHashKeys();

    if (typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(refreshPageHashKeys);
    observer.observe(document.body, {
      attributeFilter: [...ROUTE_URL_EDITOR_DOCUMENT_HASH_SUGGESTION_ATTRIBUTES],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return pageHashKeys;
}
