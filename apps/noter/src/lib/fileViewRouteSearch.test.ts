import { describe, expect, it } from "vite-plus/test";
import {
  buildFileViewRouteSearch,
  mergeFileViewRouteSearch,
  validateFileViewRouteSearch,
} from "@/lib/fileViewRouteSearch";
import {
  parseTanStackSearch,
  stringifyTanStackSearch,
} from "@/lib/tanstackSearchParams";

describe("fileViewRouteSearch", () => {
  it("accepts routed file-view flags and mobile line numbers", () => {
    expect(
      validateFileViewRouteSearch({
        compare: "",
        diff: "true",
        mobileLineNumbers: "1",
        review: true,
      }),
    ).toEqual({
      compare: true,
      diff: true,
      mobileLineNumbers: "1",
      review: true,
    });
  });

  it("treats present file-view flags as enabled regardless of value", () => {
    expect(
      validateFileViewRouteSearch({
        compare: "1",
        diff: "false",
        mobileLineNumbers: true,
        review: false,
      }),
    ).toEqual({
      compare: true,
      diff: true,
      review: true,
    });
    expect(
      validateFileViewRouteSearch({
        compare: undefined,
        diff: null,
      }),
    ).toEqual({});
  });

  it("accepts parsed search params for the file-view contract", () => {
    expect(
      validateFileViewRouteSearch(
        Object.fromEntries(
          new URLSearchParams("?compare&review&mobileLineNumbers=1").entries(),
        ),
      ),
    ).toEqual({
      compare: true,
      mobileLineNumbers: "1",
      review: true,
    });
  });

  it("builds sparse file-view search objects", () => {
    expect(
      buildFileViewRouteSearch({
        compare: true,
        diff: false,
        review: true,
      }),
    ).toEqual({
      compare: true,
      review: true,
    });
  });

  it("updates file-view keys while preserving unrelated query params", () => {
    expect(
      stringifyTanStackSearch(
        mergeFileViewRouteSearch(
          parseTanStackSearch("?devtools&mobileLineNumbers=1&compare"),
          {
            diff: true,
            mobileLineNumbers: "1",
            review: true,
          },
        ),
      ),
    ).toBe("?devtools&mobileLineNumbers=1&diff&review");
  });
});
