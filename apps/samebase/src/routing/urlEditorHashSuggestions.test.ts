// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import { readRouteUrlEditorDocumentHashSuggestionKeys } from "./urlEditorHashSuggestions";

describe("readRouteUrlEditorDocumentHashSuggestionKeys", () => {
  it("reads existing page-owned hash ids in document order", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <h2 data-landing-heading-id="deploy-a-production-app">Deploy a production app</h2>
      <section data-route-url-hash-suggestion="#connected-machines"></section>
      <h3 data-landing-heading-id="deploy-a-production-app">Duplicate heading mirror</h3>
    `;

    expect(readRouteUrlEditorDocumentHashSuggestionKeys(root)).toEqual([
      "deploy-a-production-app",
      "connected-machines",
    ]);
  });
});
