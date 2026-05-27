import { describe, expect, it } from "vite-plus/test";
import { LOGO_PRESETS } from "@/components/logo/logoPresets";
import { getRouter } from "@/router";
import {
  applyRouteUrlEditorSuggestion,
  isRouteUrlEditorRouteUpdateReady,
  readRouteUrlEditorRouteUpdateDraft,
  readRouteUrlEditorSuggestionKind,
  readRouteUrlEditorSuggestions,
} from "./routeUrlEditorSuggestions";

const ORIGIN = "https://noter.local";
const LOCAL_ORIGIN = "http://localhost:5174";
const DEPLOYED_ORIGIN = "https://preview.noter.md";
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

  it("switches to search value suggestions after =", () => {
    const routeAddress = "/logo?leftFace=";

    expect(readRouteUrlEditorSuggestionKind(routeAddress, routeAddress.length)).toBe(
      "search-value",
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

  it("formats matching search params after an existing token", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?dev&left",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?dev&left".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["&leftFace=secondary"]);
  });

  it("replaces valued search params with one different numeric example", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo?depth=2",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?depth=2&depth",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?depth=2&depth".length,
      viewer: publicViewer,
    });

    expect(
      suggestions.map((suggestion) => ({
        detail: suggestion.detail ?? null,
        value: suggestion.value,
      })),
    ).toEqual([{ detail: "2 +1", value: "&depth=3" }]);
  });

  it("uses static numeric defaults in the search param dropdown", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?d",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?d".length,
      viewer: publicViewer,
    });

    expect(
      suggestions
        .filter((suggestion) => suggestion.detail)
        .map((suggestion) => ({
          detail: suggestion.detail ?? null,
          value: suggestion.value,
        })),
    ).toEqual([
      { detail: "1 +1", value: "?depth=2" },
      { detail: "1 +1", value: "?dist=2" },
    ]);
  });

  it("uses configured sample values in the search param dropdown", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?i",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?i".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual([
      "?isoSide=18",
      "?isoStyle=shaded-edge",
    ]);
  });

  it("does not preview auth-flow values from search param recommendations", () => {
    const authKeySuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/?a",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/?a".length,
      viewer: publicViewer,
    });

    const authKeySuggestion = authKeySuggestions.find((suggestion) => suggestion.key === "auth");
    expect(authKeySuggestion?.value).toBe("?auth=");
    expect(authKeySuggestions.map((suggestion) => suggestion.value)).not.toContain("?auth=google");

    const authValueSuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/?auth=g",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/?auth=g".length,
      viewer: publicViewer,
    });

    expect(authValueSuggestions).toEqual([]);

    const signupKeySuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/?s",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/?s".length,
      viewer: publicViewer,
    });

    const signupKeySuggestion = signupKeySuggestions.find(
      (suggestion) => suggestion.key === "signup",
    );
    expect(signupKeySuggestion?.value).toBe("?signup=");
    expect(signupKeySuggestions.map((suggestion) => suggestion.value)).not.toContain(
      "?signup=google",
    );
  });

  it("keeps numeric examples inside finite numeric value suggestions", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo?gridSize=3",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?gridSize=3&gridSize",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?gridSize=3&gridSize".length,
      viewer: publicViewer,
    });

    expect(
      suggestions.map((suggestion) => ({
        detail: suggestion.detail ?? null,
        value: suggestion.value,
      })),
    ).toEqual([{ detail: "3 -1", value: "&gridSize=2" }]);
  });

  it("keeps bounded numeric examples inside route metadata ranges", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo?stripeG=1",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?stripeG=1&stripeG",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?stripeG=1&stripeG".length,
      viewer: publicViewer,
    });

    expect(
      suggestions.map((suggestion) => ({
        detail: suggestion.detail ?? null,
        value: suggestion.value,
      })),
    ).toEqual([{ detail: "1 -0.01", value: "&stripeG=0.99" }]);
  });

  it("wraps numeric examples that use cyclic sidebar ranges", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo?rot=359",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?rot=359&rot",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?rot=359&rot".length,
      viewer: publicViewer,
    });

    expect(
      suggestions.map((suggestion) => ({
        detail: suggestion.detail ?? null,
        value: suggestion.value,
      })),
    ).toEqual([{ detail: "359 +1", value: "&rot=0" }]);
  });

  it("suggests matching search param values after =", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?leftFace=s",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?leftFace=s".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["secondary", "striped"]);
  });

  it("suggests logo preset voxel states after =", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?vox=",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?vox=".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(
      LOGO_PRESETS.map((preset) => preset.voxelState),
    );
  });

  it("suggests color families before color shades", () => {
    const familySuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?primary=bl",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?primary=bl".length,
      viewer: publicViewer,
    });

    expect(familySuggestions.map((suggestion) => suggestion.value)).toEqual(["blue-500", "black-"]);

    const emeraldFamilySuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?primary=em",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?primary=em".length,
      viewer: publicViewer,
    });

    expect(emeraldFamilySuggestions.map((suggestion) => suggestion.value)).toEqual(["emerald-500"]);

    const shadeSuggestions = readRouteUrlEditorSuggestions({
      currentHref: "/logo",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/logo?primary=blue-",
      hashKeys: [],
      kind: "search-value",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/logo?primary=blue-".length,
      viewer: publicViewer,
    });

    expect(shadeSuggestions.map((suggestion) => suggestion.value)).toEqual([
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "950",
    ]);
  });

  it("hides signed-in dashboard search params from the public landing route", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/?new",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/?new".length,
      viewer: publicViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual([]);
  });

  it("keeps dashboard search params off the public root for admins", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/?add-",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/?add-".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual([]);
  });

  it("keeps signed-in dashboard search params available for admins", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/home",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/home?add-",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/home?add-".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["?add-app-root"]);
  });

  it("keeps local-only route search params on local surfaces", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/visual-fixture",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/visual-fixture?mo",
      hashKeys: [],
      kind: "search",
      origin: LOCAL_ORIGIN,
      routesByPath,
      selectionRouteIndex: "/visual-fixture?mo".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["?mode=route-url-editor"]);
  });

  it("hides local-only route search params on deployed surfaces", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/visual-fixture",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/visual-fixture?mo",
      hashKeys: [],
      kind: "search",
      origin: DEPLOYED_ORIGIN,
      routesByPath,
      selectionRouteIndex: "/visual-fixture?mo".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual([]);
  });

  it("keeps the app root search param available for admins", () => {
    const suggestions = readRouteUrlEditorSuggestions({
      currentHref: "/home",
      draftEditedSinceFocus: true,
      draftRouteAddress: "/home?add-app-r",
      hashKeys: [],
      kind: "search",
      origin: ORIGIN,
      routesByPath,
      selectionRouteIndex: "/home?add-app-r".length,
      viewer: adminViewer,
    });

    expect(suggestions.map((suggestion) => suggestion.value)).toEqual(["?add-app-root"]);
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

describe("isRouteUrlEditorRouteUpdateReady", () => {
  function readRouteUpdateDraft(draftRouteAddress: string): string {
    return readRouteUrlEditorRouteUpdateDraft({
      currentHref: "/logo",
      draftRouteAddress,
      origin: ORIGIN,
      routesByPath,
      viewer: publicViewer,
    });
  }

  function isReady(draftRouteAddress: string): boolean {
    return isRouteUrlEditorRouteUpdateReady({
      currentHref: "/logo",
      draftRouteAddress,
      origin: ORIGIN,
      routesByPath,
      viewer: publicViewer,
    });
  }

  it("keeps unfinished valued search params local", () => {
    expect(isReady("/logo?ro")).toBe(false);
    expect(isReady("/logo?rot")).toBe(false);
    expect(isReady("/logo?rot=")).toBe(false);
    expect(isReady("/logo?left")).toBe(false);
    expect(isReady("/logo?leftFace=s")).toBe(false);
    expect(isReady("/logo?primary=blue-")).toBe(false);
  });

  it("allows presence params and complete valued search params", () => {
    expect(isReady("/logo?dark")).toBe(true);
    expect(isReady("/logo?rot=10")).toBe(true);
    expect(isReady("/logo?leftFace=secondary")).toBe(true);
    expect(isReady("/logo?primary=blue-500")).toBe(true);
  });

  it("removes unfinished known search tokens from route updates", () => {
    expect(readRouteUpdateDraft("/logo?dark&rot=")).toBe("/logo?dark");
    expect(readRouteUpdateDraft("/logo?leftFace=s#top")).toBe("/logo#top");
    expect(readRouteUpdateDraft("/logo?leftFace=secondary&stripeBasis=v")).toBe(
      "/logo?leftFace=secondary",
    );
  });
});

describe("applyRouteUrlEditorSuggestion", () => {
  it("edits only the active URL section", () => {
    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/lo?dev#top",
        selectionRouteIndex: "/lo".length,
        suggestion: { key: "/logo", kind: "path", value: "/logo" },
      }),
    ).toBe("/logo?dev#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?de#top",
        selectionRouteIndex: "/logo?de".length,
        suggestion: {
          key: "devtools",
          kind: "search",
          value: "?devtools",
          valueKind: "presence",
        },
      }),
    ).toBe("/logo?devtools#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "preview",
        routeAddress: "/logo?depth=2&de#top",
        selectionRouteIndex: "/logo?depth=2&de".length,
        suggestion: {
          detail: "2 +1",
          key: "depth",
          kind: "search",
          value: "&depth=3",
          valueKind: "value",
          valueSuggestions: [],
        },
      }),
    ).toBe("/logo?depth=3#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?depth=2&de#top",
        selectionRouteIndex: "/logo?depth=2&de".length,
        suggestion: {
          detail: "2 +1",
          key: "depth",
          kind: "search",
          value: "&depth=3",
          valueKind: "value",
          valueSuggestions: [],
        },
      }),
    ).toBe("/logo?depth=2&depth=#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?border=stone-300",
        selectionRouteIndex: "/logo?border=stone-300".length,
        suggestion: {
          key: "dark",
          kind: "search",
          value: "&dark",
          valueKind: "presence",
        },
      }),
    ).toBe("/logo?border=stone-300&dark");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?",
        selectionRouteIndex: "/logo?".length,
        suggestion: {
          key: "dark",
          kind: "search",
          value: "&dark",
          valueKind: "presence",
        },
      }),
    ).toBe("/logo?dark");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?dark&de",
        selectionRouteIndex: "/logo?dark&de".length,
        suggestion: {
          key: "devtools",
          kind: "search",
          value: "?devtools",
          valueKind: "presence",
        },
      }),
    ).toBe("/logo?dark&devtools");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?leftFace=s#top",
        selectionRouteIndex: "/logo?leftFace=s".length,
        suggestion: {
          key: "leftFace=secondary",
          kind: "search-value",
          replacementValue: "secondary",
          value: "secondary",
        },
      }),
    ).toBe("/logo?leftFace=secondary#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "preview",
        routeAddress: "/logo?primary=blue-#top",
        selectionRouteIndex: "/logo?primary=blue-".length,
        suggestion: {
          key: "primary=blue-500",
          kind: "search-value",
          previewReplacementValue: "blue-500",
          replacementValue: "blue-500",
          value: "blue-500",
        },
      }),
    ).toBe("/logo?primary=blue-500#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/logo?primary=bl#top",
        selectionRouteIndex: "/logo?primary=bl".length,
        suggestion: {
          key: "primary=blue-",
          kind: "search-value",
          previewReplacementValue: "blue-500",
          replacementValue: "blue-",
          sampleValueStart: "blue-".length,
          value: "blue-500",
        },
      }),
    ).toBe("/logo?primary=blue-#top");

    expect(
      applyRouteUrlEditorSuggestion({
        mode: "select",
        routeAddress: "/machines/connect?openedByCli#connected",
        selectionRouteIndex: "/machines/connect?openedByCli#connected".length,
        suggestion: { key: "connected-machines", kind: "hash", value: "#connected-machines" },
      }),
    ).toBe("/machines/connect?openedByCli#connected-machines");
  });
});
