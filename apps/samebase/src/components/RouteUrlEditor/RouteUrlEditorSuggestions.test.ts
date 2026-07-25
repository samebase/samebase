import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  readCurrentRouteUrlEditorSuggestionIndex,
  readSuggestions,
} from "./RouteUrlEditorSuggestions";
import type { RouteAccessViewer } from "@/routing/permissions";
import { ROLE_ACCESS_GRANTS } from "../../../shared/accessModel";

const prefix = "http://localhost:5174/";
const routesByPath = getRouter().routesByPath;
const staffViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_staff,
} as const satisfies RouteAccessViewer;
const memberViewer = {
  accessKeys: ROLE_ACCESS_GRANTS.role_member,
} as const satisfies RouteAccessViewer;

function cursorAfter(routeTextBeforeCursor: string) {
  const position = prefix.length + routeTextBeforeCursor.length - 1;

  return {
    start: position,
  };
}

function readValues(args: {
  currentRouteAddress?: string;
  pageHashKeys?: readonly string[];
  routeAddress: string;
  routeTextBeforeCursor?: string;
  viewer?: RouteAccessViewer;
}): readonly string[] {
  return readRows(args).map((suggestion) => suggestion.value);
}

function readRows(args: {
  currentRouteAddress?: string;
  pageHashKeys?: readonly string[];
  routeAddress: string;
  routeTextBeforeCursor?: string;
  viewer?: RouteAccessViewer;
}) {
  return readSuggestions({
    currentRouteAddress: args.currentRouteAddress ?? args.routeAddress,
    pageHashKeys: args.pageHashKeys ?? [],
    prefix,
    routeAddress: args.routeAddress,
    routesByPath,
    selection:
      typeof args.routeTextBeforeCursor === "string"
        ? cursorAfter(args.routeTextBeforeCursor)
        : null,
    viewer: args.viewer ?? staffViewer,
  });
}

function readCurrentSuggestionValue(args: {
  currentRouteAddress?: string;
  pageHashKeys?: readonly string[];
  routeAddress: string;
  routeTextBeforeCursor?: string;
  viewer?: RouteAccessViewer;
}): string | null {
  const suggestions = readRows(args);
  const suggestionIndex = readCurrentRouteUrlEditorSuggestionIndex({
    prefix,
    routeAddress: args.routeAddress,
    selection:
      typeof args.routeTextBeforeCursor === "string"
        ? cursorAfter(args.routeTextBeforeCursor)
        : null,
    suggestions,
  });
  const suggestion = suggestionIndex === null ? undefined : suggestions[suggestionIndex];

  return suggestion?.value ?? null;
}

describe("readSuggestions", () => {
  it("identifies the current path suggestion from a path cursor", () => {
    expect(
      readCurrentSuggestionValue({
        routeAddress: "/logo?",
        routeTextBeforeCursor: "/lo",
      }),
    ).toBe("/logo");
  });

  it("identifies the current query-key suggestion from the active token", () => {
    expect(
      readCurrentSuggestionValue({
        routeAddress: "/logo?depth=2&",
        routeTextBeforeCursor: "/logo?de",
      }),
    ).toBe("?depth=2");
  });

  it("identifies the current value suggestion from the active value", () => {
    expect(
      readCurrentSuggestionValue({
        routeAddress: "/logo?zoom=0.5&",
        routeTextBeforeCursor: "/logo?zoom=0.",
      }),
    ).toBe("0.5");
  });

  it("identifies the current color family suggestion from the active value", () => {
    expect(
      readCurrentSuggestionValue({
        routeAddress: "/logo?top=blue-200&",
        routeTextBeforeCursor: "/logo?top=bl",
      }),
    ).toBe("blue-500");
  });

  it("identifies the current color shade suggestion from the active value", () => {
    expect(
      readCurrentSuggestionValue({
        routeAddress: "/logo?top=blue-200&",
        routeTextBeforeCursor: "/logo?top=blue-",
      }),
    ).toBe("200");
  });

  it("shows path suggestions when there is no focused input selection", () => {
    const values = readValues({
      routeAddress: "/logo?",
    });

    expect(values).toContain("/");
    expect(values).toContain("/logo");
    expect(values).not.toContain("?top=");
  });

  it("shows marked developer logo paths only while ?dev is present", () => {
    const standardRows = readRows({
      routeAddress: "/",
    });
    const developerRows = readRows({
      routeAddress: "/?dev",
    });
    const developerPaths = developerRows
      .filter((row) => row.kind === "path" && row.dev)
      .map((row) => row.value);

    expect(standardRows.some((row) => row.kind === "path" && row.dev)).toBe(false);
    expect(standardRows.map((row) => row.value)).not.toContain("/logo/iso");
    expect(developerPaths).toEqual([
      "/logo/iso",
      "/logo/raster",
      "/logo/raster-seams",
      "/logo/single-cube",
      "/logo/svg",
      "/logo/transition",
      "/logo/transition/menger",
      "/logo/transition/transforms",
    ]);
    expect(developerRows).toContainEqual(
      expect.objectContaining({
        kind: "path",
        value: "/logo",
      }),
    );
    expect(
      developerRows.find((row) => row.kind === "path" && row.value === "/logo"),
    ).not.toHaveProperty("dev");
  });

  it("preserves query text when building path suggestion rows", () => {
    const rows = readRows({
      routeAddress: "/terms?top=red-",
      routeTextBeforeCursor: "/te",
    });

    expect(rows).toContainEqual({
      kind: "path",
      nextSelectionRouteIndex: "/privacy?top=red-".length,
      previewRouteAddress: "/privacy?top=red-",
      previewSelectionRouteIndex: 1,
      selectedRouteAddress: "/privacy?top=red-",
      value: "/privacy",
    });
  });

  it("preserves hash text when building path suggestion rows", () => {
    const rows = readRows({
      routeAddress: "/terms?top=red-#top",
      routeTextBeforeCursor: "/te",
    });

    expect(rows).toContainEqual({
      kind: "path",
      nextSelectionRouteIndex: "/privacy?top=red-#top".length,
      previewRouteAddress: "/privacy?top=red-#top",
      previewSelectionRouteIndex: 1,
      selectedRouteAddress: "/privacy?top=red-#top",
      value: "/privacy",
    });
  });

  it("places the cursor before the hash when path rows open a query slot", () => {
    const rows = readRows({
      routeAddress: "/terms#top",
      routeTextBeforeCursor: "/te",
    });
    const focusedDraftRows = readRows({
      routeAddress: "/terms?#top",
      routeTextBeforeCursor: "/te",
    });

    expect(rows).toContainEqual({
      kind: "path",
      nextSelectionRouteIndex: "/privacy?".length,
      previewRouteAddress: "/privacy?#top",
      previewSelectionRouteIndex: 1,
      selectedRouteAddress: "/privacy?#top",
      value: "/privacy",
    });
    expect(focusedDraftRows).toContainEqual({
      kind: "path",
      nextSelectionRouteIndex: "/privacy?".length,
      previewRouteAddress: "/privacy?#top",
      previewSelectionRouteIndex: 1,
      selectedRouteAddress: "/privacy?#top",
      value: "/privacy",
    });
  });

  it("hides router template paths from clickable path rows", () => {
    const values = readValues({
      routeAddress: "/vault?",
      routeTextBeforeCursor: "/v",
    });

    expect(Object.keys(routesByPath)).toContain("/vault/$");
    expect(values).not.toContain("/vault/$");
    expect(values.some((value) => value.includes("$"))).toBe(false);
  });

  it("shows query key suggestions when the cursor is after the query marker", () => {
    const values = readValues({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(values).toContain("?top=sky-500");
    expect(values).not.toContain("/logo");
  });

  it("orders functional and scoped query suggestion groups", () => {
    const logoRows = readRows({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });
    const termsRows = readRows({
      routeAddress: "/terms?",
      routeTextBeforeCursor: "/terms?",
    });

    expect(
      logoRows.slice(0, 3).map((row) => [row.kind === "search" ? row.group : null, row.value]),
    ).toEqual([
      [null, "?prod-ui"],
      [null, "?reset"],
      ["theme", "?background=stone-50"],
    ]);
    expect(
      logoRows.map((row) => (row.kind === "search" ? row.group : null)).filter(Boolean),
    ).toEqual([
      ...Array(6).fill("theme"),
      ...Array(12).fill("logo"),
      ...Array(6).fill("logo-motion"),
      ...Array(5).fill("logo-view"),
    ]);
    expect(logoRows.map((row) => row.value)).toEqual(
      expect.arrayContaining(["?dark", "?top=sky-500", "?auto-rotate", "?rot=46"]),
    );

    expect(
      termsRows.map((row) => (row.kind === "search" ? row.group : null)).filter(Boolean),
    ).toEqual(Array(6).fill("theme"));
    expect(termsRows.map((row) => row.value)).toEqual(
      expect.arrayContaining(["?dark", "?primary=emerald-500"]),
    );
    expect(termsRows.map((row) => row.value)).not.toContain("?dev");
    expect(termsRows.map((row) => row.value)).not.toEqual(
      expect.arrayContaining(["?top=sky-500", "?auto-rotate", "?rot=46"]),
    );
  });

  it("keeps the next query slot before an existing hash", () => {
    const rows = readRows({
      routeAddress: "/logo?da#top",
      routeTextBeforeCursor: "/logo?da",
    });

    expect(rows).toContainEqual({
      kind: "search",
      group: "theme",
      nextSelectionRouteIndex: "/logo?dark&".length,
      previewRouteAddress: "/logo?dark&#top",
      previewSelectionRouteIndex: "/logo?".length,
      selectedRouteAddress: "/logo?dark&#top",
      value: "?dark",
    });
  });

  it("shows all query key suggestions for the key under the cursor", () => {
    const values = readValues({
      routeAddress: "/logo?to",
      routeTextBeforeCursor: "/logo?to",
    });

    expect(values).toContain("?top=sky-500");
    expect(values).toContain("?border=stone-300");
  });

  it("replaces the active key-value token when selecting a query key", () => {
    const rows = readRows({
      routeAddress: "/logo?dark&depth=2&top=blue-200",
      routeTextBeforeCursor: "/logo?dark&de",
    });

    expect(rows).toContainEqual({
      kind: "search",
      group: "theme",
      nextSelectionRouteIndex: "/logo?dark&border=".length,
      previewRouteAddress: "/logo?dark&border=stone-300&top=blue-200",
      previewSelectionRouteIndex: "/logo?dark&".length,
      sampleValueStart: "&border=".length,
      selectedRouteAddress: "/logo?dark&border=stone-300&top=blue-200",
      value: "&border=stone-300",
    });
  });

  it("hides query keys that are already present outside the active token", () => {
    const values = readValues({
      routeAddress: "/terms?border=stone-300&dev&depth=2&gridSize=2&light&",
      routeTextBeforeCursor: "/terms?bo",
    });

    expect(values).toContain("?border=stone-300");
    expect(values).not.toContain("?dev");
    expect(values).not.toContain("?depth=2");
  });

  it("hides already present query keys from the next empty query slot", () => {
    const values = readValues({
      routeAddress: "/logo?dev&top=blue-500&",
      routeTextBeforeCursor: "/logo?dev&top=blue-500&",
    });

    expect(values).not.toContain("&dev");
    expect(values).not.toContain("&top=sky-500");
    expect(values).toContain("&secondary=rose-500");
  });

  it("hides developer query params marked hidden in metadata", () => {
    const values = readValues({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(values).not.toContain("?dev");
    expect(values).not.toContain("?devtools");
  });

  it("uses member access for route and query suggestions", () => {
    const pathValues = readValues({
      routeAddress: "/v",
      routeTextBeforeCursor: "/v",
      viewer: memberViewer,
    });
    const rootDashboardValues = readValues({
      routeAddress: "/vault?",
      routeTextBeforeCursor: "/vault?",
      viewer: memberViewer,
    });
    const selectedDashboardValues = readValues({
      routeAddress: "/vault/samebase/samebase?",
      routeTextBeforeCursor: "/vault/samebase/samebase?",
      viewer: memberViewer,
    });
    expect(pathValues).toContain("/vault");
    expect(rootDashboardValues).not.toContain("?delete");
    expect(selectedDashboardValues).toContain("?delete");
  });

  it("uses the next-param prefix for later query tokens", () => {
    const values = readValues({
      routeAddress: "/logo?top=blue-500&se",
      routeTextBeforeCursor: "/logo?top=blue-500&se",
    });

    expect(values).toContain("&secondary=rose-500");
    expect(values).not.toContain("?secondary=");
  });

  it("shows Tailwind color shade suggestions while the cursor is after the family dash", () => {
    const rows = readRows({
      routeAddress: "/logo?top=blue-2",
      routeTextBeforeCursor: "/logo?top=blue-2",
    });
    const values = rows.map((suggestion) => suggestion.value);

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?top=blue-200&".length,
      previewRouteAddress: "/logo?top=blue-200",
      previewSelectionRouteIndex: "/logo?top=blue-".length,
      selectedRouteAddress: "/logo?top=blue-200&",
      value: "200",
    });
    expect(values).not.toContain("/logo");
    expect(values).not.toContain("?top=sky-500");
  });

  it("shows all Tailwind color families while the cursor is before the family dash", () => {
    const rows = readRows({
      routeAddress: "/logo?top=blue-200",
      routeTextBeforeCursor: "/logo?top=bl",
    });
    const values = rows.map((suggestion) => suggestion.value);

    expect(rows).toContainEqual({
      kind: "searchValuePrefix",
      nextSelectionRouteIndex: "/logo?top=blue-".length,
      previewRouteAddress: "/logo?top=blue-500",
      previewSelectionRouteIndex: "/logo?top=".length,
      sampleValueStart: "blue-".length,
      selectedRouteAddress: "/logo?top=blue-500",
      value: "blue-500",
    });
    expect(rows).toContainEqual({
      kind: "searchValuePrefix",
      nextSelectionRouteIndex: "/logo?top=red-".length,
      previewRouteAddress: "/logo?top=red-500",
      previewSelectionRouteIndex: "/logo?top=".length,
      sampleValueStart: "red-".length,
      selectedRouteAddress: "/logo?top=red-500",
      value: "red-500",
    });
    expect(values).not.toContain("blue-");
  });

  it("replaces the whole active query value when showing family suggestions", () => {
    const rows = readRows({
      routeAddress: "/logo?dark&top=blue-200&secondary=rose-500",
      routeTextBeforeCursor: "/logo?dark&top=bl",
    });

    expect(rows).toContainEqual({
      kind: "searchValuePrefix",
      nextSelectionRouteIndex: "/logo?dark&top=red-".length,
      previewRouteAddress: "/logo?dark&top=red-500&secondary=rose-500",
      previewSelectionRouteIndex: "/logo?dark&top=".length,
      sampleValueStart: "red-".length,
      selectedRouteAddress: "/logo?dark&top=red-500&secondary=rose-500",
      value: "red-500",
    });
  });

  it("replaces the whole active query value when showing shade suggestions", () => {
    const rows = readRows({
      routeAddress: "/logo?dark&top=blue-500&secondary=rose-500",
      routeTextBeforeCursor: "/logo?dark&top=blue-",
    });

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?dark&top=blue-200".length,
      previewRouteAddress: "/logo?dark&top=blue-200&secondary=rose-500",
      previewSelectionRouteIndex: "/logo?dark&top=blue-".length,
      selectedRouteAddress: "/logo?dark&top=blue-200&secondary=rose-500",
      value: "200",
    });
  });

  it("keeps enough cursor information to continue editing after selection", () => {
    const pathRows = readRows({
      routeAddress: "/privacy?",
      routeTextBeforeCursor: "/pri",
    });

    expect(pathRows).toContainEqual({
      kind: "path",
      nextSelectionRouteIndex: "/logo?".length,
      previewRouteAddress: "/logo?",
      previewSelectionRouteIndex: 1,
      selectedRouteAddress: "/logo?",
      value: "/logo",
    });

    const keyRows = readRows({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(keyRows).toContainEqual({
      kind: "search",
      group: "logo",
      nextSelectionRouteIndex: "/logo?top=".length,
      previewRouteAddress: "/logo?top=sky-500",
      previewSelectionRouteIndex: "/logo?".length,
      sampleValueStart: "?top=".length,
      selectedRouteAddress: "/logo?top=sky-500",
      value: "?top=sky-500",
    });
    expect(keyRows).toContainEqual({
      kind: "search",
      group: "logo-motion",
      nextSelectionRouteIndex: "/logo?auto-rotate&".length,
      previewRouteAddress: "/logo?auto-rotate&",
      previewSelectionRouteIndex: "/logo?".length,
      selectedRouteAddress: "/logo?auto-rotate&",
      value: "?auto-rotate",
    });
  });

  it("selects value-param samples while keeping the cursor in the value slot", () => {
    const rows = readRows({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(rows).toContainEqual({
      kind: "search",
      group: "logo-view",
      nextSelectionRouteIndex: "/logo?zoom=".length,
      previewRouteAddress: "/logo?zoom=0.5",
      previewSelectionRouteIndex: "/logo?".length,
      sampleValueStart: "?zoom=".length,
      selectedRouteAddress: "/logo?zoom=0.5",
      value: "?zoom=0.5",
    });
  });

  it("shows zoom value rows from metadata", () => {
    const rows = readRows({
      routeAddress: "/logo?zoom=0.5",
      routeTextBeforeCursor: "/logo?zoom=",
    });

    expect(rows.map((row) => row.value)).toEqual([
      "0.1",
      "0.2",
      "0.3",
      "0.4",
      "0.5",
      "0.6",
      "0.7",
      "0.8",
      "0.9",
      "1",
    ]);
    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?zoom=0.7&".length,
      previewRouteAddress: "/logo?zoom=0.7",
      previewSelectionRouteIndex: "/logo?zoom=".length,
      selectedRouteAddress: "/logo?zoom=0.7&",
      value: "0.7",
    });
  });

  it("shows value rows for metadata options after selecting the key", () => {
    const rows = readRows({
      routeAddress: "/logo?axis=",
      routeTextBeforeCursor: "/logo?axis=",
    });

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?axis=screen-vertical&".length,
      previewRouteAddress: "/logo?axis=screen-vertical",
      previewSelectionRouteIndex: "/logo?axis=".length,
      selectedRouteAddress: "/logo?axis=screen-vertical&",
      value: "screen-vertical",
    });
  });

  it("shows numeric value rows from metadata range after selecting the key", () => {
    const rows = readRows({
      routeAddress: "/logo?depth=",
      routeTextBeforeCursor: "/logo?depth=",
    });

    expect(rows.map((row) => row.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?depth=5&".length,
      previewRouteAddress: "/logo?depth=5",
      previewSelectionRouteIndex: "/logo?depth=".length,
      selectedRouteAddress: "/logo?depth=5&",
      value: "5",
    });
  });

  it("shows distance value rows from metadata range", () => {
    const rows = readRows({
      routeAddress: "/logo?dist=",
      routeTextBeforeCursor: "/logo?dist=",
    });

    expect(rows.map((row) => row.value)).toEqual(["1", "1.2", "1.4", "1.6", "1.8", "2"]);
    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?dist=1.4&".length,
      previewRouteAddress: "/logo?dist=1.4",
      previewSelectionRouteIndex: "/logo?dist=".length,
      selectedRouteAddress: "/logo?dist=1.4&",
      value: "1.4",
    });
  });

  it("shows sample value rows for metadata freeform params after selecting the key", () => {
    const rows = readRows({
      routeAddress: "/visual-fixture?mode=",
      routeTextBeforeCursor: "/visual-fixture?mode=",
    });

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/visual-fixture?mode=route-url-editor&".length,
      previewRouteAddress: "/visual-fixture?mode=route-url-editor",
      previewSelectionRouteIndex: "/visual-fixture?mode=".length,
      selectedRouteAddress: "/visual-fixture?mode=route-url-editor&",
      value: "route-url-editor",
    });
  });

  it("adds page hash suggestions only for the current route path", () => {
    const currentRouteRows = readRows({
      currentRouteAddress: "/",
      pageHashKeys: ["intro", "pricing"],
      routeAddress: "/#intro",
      routeTextBeforeCursor: "/#i",
    });
    const differentRouteRows = readRows({
      currentRouteAddress: "/",
      pageHashKeys: ["intro", "pricing"],
      routeAddress: "/logo#intro",
      routeTextBeforeCursor: "/logo#i",
    });

    expect(currentRouteRows.map((row) => row.value)).toEqual(["#intro", "#pricing"]);
    expect(differentRouteRows.map((row) => row.value)).toEqual([]);
  });
});
