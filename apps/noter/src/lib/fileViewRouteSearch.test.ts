import { describe, expect, it } from "vitest";
import {
  buildFileViewRouteSearch,
  readFileViewRouteSearch,
  validateFileViewRouteSearch,
} from "@/lib/fileViewRouteSearch";

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

  it("reads the file-view contract from a search string", () => {
    expect(
      readFileViewRouteSearch("?compare&review&mobileLineNumbers=1"),
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
});
