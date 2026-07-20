import { describe, expect, it } from "vite-plus/test";

import {
  buildUrlWithSearchParams,
  createUrlSearchParams,
  readUrlSearchParamsRecord,
} from "./urlSearchParams";

describe("createUrlSearchParams", () => {
  it("serializes defined values and omits undefined values", () => {
    const params = createUrlSearchParams({
      empty: "",
      query: "hello world",
      skip: undefined,
    });

    expect(params.toString()).toBe("empty=&query=hello+world");
  });
});

describe("readUrlSearchParamsRecord", () => {
  it("preserves repeated keys for schema validation", () => {
    expect(readUrlSearchParamsRecord("version=1&teamId=one&teamId=two&empty=")).toEqual({
      version: "1",
      teamId: ["one", "two"],
      empty: "",
    });
  });
});

describe("buildUrlWithSearchParams", () => {
  it("replaces typed params while preserving unrelated existing params", () => {
    expect(
      buildUrlWithSearchParams("https://example.com/path?keep=1&replace=old&skip=old", {
        add: "hello world",
        replace: "new",
        skip: undefined,
      }),
    ).toBe("https://example.com/path?keep=1&skip=old&add=hello+world&replace=new");
  });

  it("serializes root-relative URL inputs as root-relative paths", () => {
    expect(
      buildUrlWithSearchParams("/threads?sortKey=created_at#latest", {
        limit: "100",
        sortKey: "updated_at",
      }),
    ).toBe("/threads?limit=100&sortKey=updated_at#latest");
  });
});
