import { describe, expect, it } from "vite-plus/test";
import { getRouter } from "@/router";
import {
  parseRouteAddress,
  readRouteAddressReadiness,
  readSuggestions,
} from "./RouteUrlEditorSuggestions";

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

function readRouteAddressReadinessForTest(args: {
  currentRouteAddress?: string;
  draftRouteAddress: string;
  viewerIsAdmin?: boolean;
}) {
  return readRouteAddressReadiness({
    currentRouteAddress: args.currentRouteAddress ?? "/privacy",
    draftRouteAddress: args.draftRouteAddress,
    origin: "http://localhost:5174",
    routesByPath,
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

describe("readRouteAddressReadiness", () => {
  it("keeps partial known query keys local", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?dar",
      }),
    ).toEqual({
      kind: "local",
      reason: "draftNotReady",
    });
  });

  it("applies complete presence query keys", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?dark",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?dark",
    });
  });

  it("keeps partial suggested query values local", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=s",
      }),
    ).toEqual({
      kind: "local",
      reason: "draftNotReady",
    });
  });

  it("applies complete suggested query values", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/logo",
        draftRouteAddress: "/logo?leftFace=secondary",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo?leftFace=secondary",
    });
  });

  it("keeps partial paths local", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/lo",
      }),
    ).toEqual({
      kind: "local",
      reason: "pathNotReady",
    });
  });

  it("applies loadable paths", () => {
    expect(
      readRouteAddressReadinessForTest({
        draftRouteAddress: "/logo",
      }),
    ).toEqual({
      kind: "readyExact",
      routeAddress: "/logo",
    });
  });

  it("distinguishes ready normalized drafts from exact drafts", () => {
    expect(
      readRouteAddressReadinessForTest({
        currentRouteAddress: "/privacy",
        draftRouteAddress: "/logo?dar",
      }),
    ).toEqual({
      kind: "readyNormalized",
      routeAddress: "/logo",
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

  it("shows query key suggestions when the cursor is after the query marker", () => {
    const values = readValues({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(values).toContain("?top=");
    expect(values).not.toContain("/logo");
  });

  it("filters query key suggestions by the key under the cursor", () => {
    const values = readValues({
      routeAddress: "/logo?to",
      routeTextBeforeCursor: "/logo?to",
    });

    expect(values).toContain("?top=");
    expect(values).not.toContain("?bottom=");
  });

  it("uses the next-param prefix for later query tokens", () => {
    const values = readValues({
      routeAddress: "/logo?top=blue-500&se",
      routeTextBeforeCursor: "/logo?top=blue-500&se",
    });

    expect(values).toContain("&secondary=");
    expect(values).not.toContain("?secondary=");
  });

  it("shows Tailwind color suggestions while the cursor is inside a query value", () => {
    const rows = readRows({
      routeAddress: "/logo?top=blue-2",
      routeTextBeforeCursor: "/logo?top=blue-2",
    });
    const values = rows.map((suggestion) => suggestion.value);

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?top=blue-200&".length,
      routeAddress: "/logo?top=blue-200&",
      value: "blue-200",
    });
    expect(values).not.toContain("/logo");
    expect(values).not.toContain("?top=");
  });

  it("shows Tailwind color families before Tailwind shades", () => {
    const rows = readRows({
      routeAddress: "/logo?top=bl",
      routeTextBeforeCursor: "/logo?top=bl",
    });
    const values = rows.map((suggestion) => suggestion.value);

    expect(rows).toContainEqual({
      kind: "searchValuePrefix",
      nextSelectionRouteIndex: "/logo?top=blue-".length,
      routeAddress: "/logo?top=blue-",
      value: "blue-",
    });
    expect(values).not.toContain("blue-200");
  });

  it("replaces only the active query value when showing value suggestions", () => {
    const rows = readRows({
      routeAddress: "/logo?top=blue-500",
      routeTextBeforeCursor: "/logo?top=blue-",
    });

    expect(rows).toContainEqual({
      kind: "searchValue",
      nextSelectionRouteIndex: "/logo?top=blue-200&".length,
      routeAddress: "/logo?top=blue-200&",
      value: "blue-200",
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
      routeAddress: "/logo?",
      value: "/logo",
    });

    const keyRows = readRows({
      routeAddress: "/logo?",
      routeTextBeforeCursor: "/logo?",
    });

    expect(keyRows).toContainEqual({
      kind: "search",
      nextSelectionRouteIndex: "/logo?top=".length,
      routeAddress: "/logo?top=",
      value: "?top=",
    });
    expect(keyRows).toContainEqual({
      kind: "search",
      nextSelectionRouteIndex: "/logo?dev&".length,
      routeAddress: "/logo?dev&",
      value: "?dev",
    });
  });
});
