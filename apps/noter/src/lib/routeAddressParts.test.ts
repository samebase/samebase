import { describe, expect, it } from "vite-plus/test";
import {
  appendRouteAddressSearchToken,
  openRouteAddressQuerySlot,
  parseRouteAddress,
  readRouteAddressCursorContext,
  replaceRouteAddressPathAndOpenQuerySlot,
  replaceRouteAddressSearchToken,
  replaceRouteAddressSearchValue,
} from "./routeAddressParts";

describe("parseRouteAddress", () => {
  it("parses a route address without query params", () => {
    expect(parseRouteAddress("/logo")).toEqual({
      hash: null,
      path: "/logo",
      search: null,
    });
  });

  it("keeps the empty key token after a bare query marker", () => {
    expect(parseRouteAddress("/logo?")).toEqual({
      hash: null,
      path: "/logo",
      search: {
        end: 6,
        start: 5,
        suffix: "?",
        tokens: [
          {
            kind: "key",
            delimiter: "?",
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
      hash: null,
      path: "/logo",
      search: {
        end: 37,
        start: 5,
        suffix: "?top=blue-500&secondary=rose-500",
        tokens: [
          {
            kind: "value",
            delimiter: "?",
            key: "top",
            tokenEnd: 18,
            tokenStart: 5,
            value: "blue-500",
            valueStart: 10,
          },
          {
            kind: "value",
            delimiter: "&",
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
      hash: null,
      path: "/logo",
      search: {
        end: 13,
        start: 5,
        suffix: "?dev&top",
        tokens: [
          {
            kind: "key",
            delimiter: "?",
            key: "dev",
            tokenEnd: 9,
            tokenStart: 5,
          },
          {
            kind: "key",
            delimiter: "&",
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
      hash: null,
      path: "/logo",
      search: {
        end: 10,
        start: 5,
        suffix: "?dev&",
        tokens: [
          {
            kind: "key",
            delimiter: "?",
            key: "dev",
            tokenEnd: 9,
            tokenStart: 5,
          },
          {
            kind: "key",
            delimiter: "&",
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
      hash: null,
      path: "/logo",
      search: {
        end: 10,
        start: 5,
        suffix: "?top=",
        tokens: [
          {
            kind: "value",
            delimiter: "?",
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
      hash: null,
      path: "/logo",
      search: {
        end: 20,
        start: 5,
        suffix: "?redirect=a=b=c",
        tokens: [
          {
            kind: "value",
            delimiter: "?",
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
      hash: null,
      path: "/logo",
      search: {
        end: 15,
        start: 5,
        suffix: "?=blue-500",
        tokens: [
          {
            kind: "value",
            delimiter: "?",
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

  it("keeps hash text out of query tokens", () => {
    expect(parseRouteAddress("/logo?dev#top")).toEqual({
      hash: {
        start: 9,
        suffix: "#top",
        value: "top",
      },
      path: "/logo",
      search: {
        end: 9,
        start: 5,
        suffix: "?dev",
        tokens: [
          {
            kind: "key",
            delimiter: "?",
            key: "dev",
            tokenEnd: 9,
            tokenStart: 5,
          },
        ],
      },
    });
  });
});

describe("route address editing", () => {
  it("opens a query slot before hashes", () => {
    expect(openRouteAddressQuerySlot("/logo")).toEqual({
      routeAddress: "/logo?",
      selectionRouteIndex: 6,
    });
    expect(openRouteAddressQuerySlot("/logo#top")).toEqual({
      routeAddress: "/logo?#top",
      selectionRouteIndex: 6,
    });
    expect(openRouteAddressQuerySlot("/logo?dev#top")).toEqual({
      routeAddress: "/logo?dev&#top",
      selectionRouteIndex: 10,
    });
    expect(openRouteAddressQuerySlot("/")).toEqual({
      routeAddress: "/",
      selectionRouteIndex: null,
    });
  });

  it("replaces paths while preserving search and hash text", () => {
    expect(replaceRouteAddressPathAndOpenQuerySlot("/terms#top", "/privacy")).toEqual({
      routeAddress: "/privacy?#top",
      selectionRouteIndex: 9,
    });
    expect(replaceRouteAddressPathAndOpenQuerySlot("/terms?#top", "/privacy")).toEqual({
      routeAddress: "/privacy?#top",
      selectionRouteIndex: 9,
    });
    expect(replaceRouteAddressPathAndOpenQuerySlot("/terms?top=red-500#top", "/privacy")).toEqual({
      routeAddress: "/privacy?top=red-500#top",
      selectionRouteIndex: null,
    });
  });

  it("appends search tokens into empty and existing searches", () => {
    expect(appendRouteAddressSearchToken("/logo", "dark")).toBe("/logo?dark");
    expect(appendRouteAddressSearchToken("/logo?", "dark")).toBe("/logo?dark");
    expect(appendRouteAddressSearchToken("/logo?dev", "dark")).toBe("/logo?dev&dark");
    expect(appendRouteAddressSearchToken("/logo?#top", "dark")).toBe("/logo?dark#top");
  });

  it("replaces a search key token and removes duplicate keys", () => {
    const parts = parseRouteAddress("/terms?border=stone-300&dev&depth=2&light&");
    if (parts.search === null) {
      throw new Error("expected search");
    }

    const token = parts.search.tokens[0];
    if (typeof token === "undefined") {
      throw new Error("expected token");
    }

    expect(
      replaceRouteAddressSearchToken({
        dedupeKey: "dev",
        replacementTokenText: "dev",
        routeAddress: "/terms?border=stone-300&dev&depth=2&light&",
        token,
      }),
    ).toEqual({
      replacementTokenStart: 6,
      routeAddress: "/terms?dev&depth=2&light&",
    });
  });

  it("replaces a search value before a hash", () => {
    const parts = parseRouteAddress("/logo?top=blue#top");
    if (parts.search === null) {
      throw new Error("expected search");
    }

    const token = parts.search.tokens[0];
    if (typeof token === "undefined" || token.kind !== "value") {
      throw new Error("expected value token");
    }

    expect(
      replaceRouteAddressSearchValue({
        routeAddress: "/logo?top=blue#top",
        token,
        value: "red",
      }),
    ).toBe("/logo?top=red#top");
  });
});

describe("readRouteAddressCursorContext", () => {
  it("classifies path, search key, search value, and hash cursor positions", () => {
    const parts = parseRouteAddress("/logo?top=blue#top");

    expect(readRouteAddressCursorContext(parts, 1)).toEqual({
      kind: "path",
    });
    expect(readRouteAddressCursorContext(parts, 8)).toEqual({
      kind: "searchKey",
      token: {
        kind: "value",
        delimiter: "?",
        key: "top",
        tokenEnd: 14,
        tokenStart: 5,
        value: "blue",
        valueStart: 10,
      },
    });
    expect(readRouteAddressCursorContext(parts, 13)).toEqual({
      kind: "searchValue",
      token: {
        kind: "value",
        delimiter: "?",
        key: "top",
        tokenEnd: 14,
        tokenStart: 5,
        value: "blue",
        valueStart: 10,
      },
      valuePrefix: "blu",
    });
    expect(readRouteAddressCursorContext(parts, 16)).toEqual({
      hash: {
        start: 14,
        suffix: "#top",
        value: "top",
      },
      kind: "hash",
    });
  });
});
