import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import { parseRouteAddress, readSuggestions } from "./RouteUrlEditorSuggestions";

const prefix = "http://localhost:5174/";
const routesByPath = getRouter().routesByPath;

function cursorAfter(routeTextBeforeCursor: string) {
  const position = prefix.length + routeTextBeforeCursor.length - 1;

  return {
    start: position,
  };
}

function readValues(args: {
  routeAddress: string;
  routeTextBeforeCursor?: string;
  viewerIsAdmin?: boolean;
}): readonly string[] {
  return readRows(args).map((suggestion) => suggestion.value);
}

function readRows(args: {
  routeAddress: string;
  routeTextBeforeCursor?: string;
  viewerIsAdmin?: boolean;
}) {
  return readSuggestions({
    prefix,
    routeAddress: args.routeAddress,
    routesByPath,
    selection:
      typeof args.routeTextBeforeCursor === "string"
        ? cursorAfter(args.routeTextBeforeCursor)
        : null,
    viewerIsAdmin: args.viewerIsAdmin ?? true,
  });
}

describe("parseRouteAddress", () => {
  it("parses a route address without query params", () => {
    expect(parseRouteAddress("/logo")).toEqual({
      path: "/logo",
      search: null,
    });
  });

  it("keeps the empty key token after a bare query marker", () => {
    expect(parseRouteAddress("/logo?")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "key",
            key: "",
            tokenEnd: 6,
            tokenStart: 5,
          },
        ],
      },
    });
  });

  it("parses query value tokens with route-address positions", () => {
    expect(parseRouteAddress("/logo?top=blue-500&secondary=rose-500")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "value",
            key: "top",
            tokenEnd: 18,
            tokenStart: 5,
            value: "blue-500",
            valueStart: 10,
          },
          {
            kind: "value",
            key: "secondary",
            tokenEnd: 37,
            tokenStart: 18,
            value: "rose-500",
            valueStart: 29,
          },
        ],
      },
    });
  });

  it("parses query tokens without equals as keys", () => {
    expect(parseRouteAddress("/logo?dev&top")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "key",
            key: "dev",
            tokenEnd: 9,
            tokenStart: 5,
          },
          {
            kind: "key",
            key: "top",
            tokenEnd: 13,
            tokenStart: 9,
          },
        ],
      },
    });
  });

  it("keeps the empty key token after a trailing ampersand", () => {
    expect(parseRouteAddress("/logo?dev&")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "key",
            key: "dev",
            tokenEnd: 9,
            tokenStart: 5,
          },
          {
            kind: "key",
            key: "",
            tokenEnd: 10,
            tokenStart: 9,
          },
        ],
      },
    });
  });

  it("parses equals without value as an empty value", () => {
    expect(parseRouteAddress("/logo?top=")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "value",
            key: "top",
            tokenEnd: 10,
            tokenStart: 5,
            value: "",
            valueStart: 10,
          },
        ],
      },
    });
  });

  it("keeps extra equals signs inside the value", () => {
    expect(parseRouteAddress("/logo?redirect=a=b=c")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "value",
            key: "redirect",
            tokenEnd: 20,
            tokenStart: 5,
            value: "a=b=c",
            valueStart: 15,
          },
        ],
      },
    });
  });

  it("parses an equals token without a key", () => {
    expect(parseRouteAddress("/logo?=blue-500")).toEqual({
      path: "/logo",
      search: {
        start: 5,
        tokens: [
          {
            kind: "value",
            key: "",
            tokenEnd: 15,
            tokenStart: 5,
            value: "blue-500",
            valueStart: 7,
          },
        ],
      },
    });
  });
});

describe("readSuggestions", () => {
  it("shows path suggestions when there is no focused input selection", () => {
    const values = readValues({
      routeAddress: "/logo?",
    });

    expect(values).toContain("/");
    expect(values).toContain("/logo");
    expect(values).not.toContain("?top=");
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

  it("hides query params marked hidden in metadata", () => {
    const values = readValues({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(values).toContain("?dev");
    expect(values).not.toContain("?devtools");
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
      nextSelectionRouteIndex: "/logo?top=".length,
      previewRouteAddress: "/logo?top=sky-500",
      previewSelectionRouteIndex: "/logo?".length,
      sampleValueStart: "?top=".length,
      selectedRouteAddress: "/logo?top=sky-500",
      value: "?top=sky-500",
    });
    expect(keyRows).toContainEqual({
      kind: "search",
      nextSelectionRouteIndex: "/logo?dev&".length,
      previewRouteAddress: "/logo?dev&",
      previewSelectionRouteIndex: "/logo?".length,
      selectedRouteAddress: "/logo?dev&",
      value: "?dev",
    });
  });

  it("selects value-param samples while keeping the cursor in the value slot", () => {
    const rows = readRows({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(rows).toContainEqual({
      kind: "search",
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
});
