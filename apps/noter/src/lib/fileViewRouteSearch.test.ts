import { describe, expect, it } from "vite-plus/test";
import {
  buildFileViewRouteSearch,
  mergeFileViewRouteSearch,
  validateFileViewRouteSearch,
} from "@/lib/fileViewRouteSearch";
import { buildSearchString } from "@/lib/queryParams";

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

  it("drops malformed file-view search values instead of preserving junk", () => {
    expect(
      validateFileViewRouteSearch({
        compare: "1",
        diff: "false",
        mobileLineNumbers: true,
        review: false,
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
      buildSearchString(
        mergeFileViewRouteSearch("?devtools&mobileLineNumbers=1&compare", {
          diff: true,
          mobileLineNumbers: "1",
          review: true,
        }),
      ),
    ).toBe("?devtools&mobileLineNumbers=1&diff&review");
  });
});
