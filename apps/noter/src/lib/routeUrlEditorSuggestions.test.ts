import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  applyRouteUrlEditorSuggestion,
  readRouteUrlEditorSuggestionKind,
  readRouteUrlEditorSuggestions,
} from "./routeUrlEditorSuggestions";

const ORIGIN = "https://noter.local";
const routesByPath = getRouter().routesByPath;
const adminViewer = { isAdmin: true };
const publicViewer = { isAdmin: false };

describe("readRouteUrlEditorSuggestionKind", () => {
  it("switches suggestions by the focused URL section", () => {
    const routeAddress = "/logo?dev#top";

    expect(readRouteUrlEditorSuggestionKind(routeAddress, routeAddress.indexOf("?"))).toBe("path");
    expect(readRouteUrlEditorSuggestionKind(routeAddress, routeAddress.indexOf("?") + 1)).toBe(
      "search",
    );
    expect(readRouteUrlEditorSuggestionKind(routeAddress, routeAddress.indexOf("#") + 1)).toBe(
      "hash",
    );
  });
});

describe("readRouteUrlEditorSuggestions", () => {
  it("keeps path suggestions available when the draft has search and hash text", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/lo?dev#top",
      hashKeys: [],
      kind: "path",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/lo".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toContain("/logo");
  });

  it("suggests matching search params for the current route", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?dev#top",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?dev".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["?dev", "?devtools"]);
  });

  it("suggests route-specific hashes when the route is accessible", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/machines/connect",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/machines/connect#connected",
      hashKeys: [],
      kind: "hash",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/machines/connect#connected".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["#connected-machines"]);
  });

  it("suggests document hashes for the current route", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/#not",
      hashKeys: ["tmp-flow", "noter-md/noter"],
      kind: "hash",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/#not".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["#noter-md/noter"]);
  });

  it("does not suggest current document hashes for a different draft route", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo#not",
      hashKeys: ["noter-md/noter"],
      kind: "hash",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo#not".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual([]);
  });
});

describe("applyRouteUrlEditorSuggestion", () => {
  it("edits only the active URL section", () => {
    expect(
      applyRouteUrlEditorSuggestion({
        routeAddress: "/lo?dev#top",
        selectionRouteIndex: "/lo".length,
        suggestion: { key: "/logo", kind: "path", value: "/logo" },
      }),
    ).toBe("/logo?dev#top");

    expect(
      applyRouteUrlEditorSuggestion({
        routeAddress: "/logo?de#top",
        selectionRouteIndex: "/logo?de".length,
        suggestion: { key: "devtools", kind: "search", value: "?devtools" },
      }),
    ).toBe("/logo?devtools#top");

    expect(
      applyRouteUrlEditorSuggestion({
        routeAddress: "/machines/connect?openedByCli#connected",
        selectionRouteIndex: "/machines/connect?openedByCli#connected".length,
        suggestion: { key: "connected-machines", kind: "hash", value: "#connected-machines" },
      }),
    ).toBe("/machines/connect?openedByCli#connected-machines");
  });
});
