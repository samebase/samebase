// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import { readRouteUrlEditorDocumentHashSuggestionKeys } from "./urlEditorHashSuggestions";

describe("readRouteUrlEditorDocumentHashSuggestionKeys", () => {
  it("reads existing landing and dashboard hash ids in document order", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <h2 data-landing-heading-id="deploy-a-production-app">Deploy a production app</h2>
      <section data-vault-dashboard-repository-hash-id="noter-md/noter"></section>
      <section data-route-url-hash-suggestion="#connected-machines"></section>
      <h3 data-landing-heading-id="deploy-a-production-app">Duplicate heading mirror</h3>
      <section data-vault-dashboard-repository-hash-id=""></section>
    `;

    expect(readRouteUrlEditorDocumentHashSuggestionKeys(root)).toEqual([
      "deploy-a-production-app",
      "noter-md/noter",
      "connected-machines",
    ]);
  });
});
