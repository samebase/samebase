import { describe, expect, it } from "vite-plus/test";
import {
  buildFileViewSearchHref,
  buildFileViewRouteSearch,
  mergeFileViewRouteSearch,
  validateFileViewRouteSearch,
} from "@/routeSearch/fileView";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";

describe("fileViewRouteSearch", () => {
  it("accepts routed file-view flags and mobile line numbers", () => {
    expect(
      validateFileViewRouteSearch({
        compare: "",
        diff: "true",
        mobileLineNumbers: "1",
      }),
    ).toEqual({
      compare: true,
      diff: true,
      mobileLineNumbers: "1",
    });
  });

  it("treats present file-view flags as enabled regardless of value", () => {
    expect(
      validateFileViewRouteSearch({
        compare: "1",
        diff: "false",
        mobileLineNumbers: true,
      }),
    ).toEqual({
      compare: true,
      diff: true,
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
        Object.fromEntries(new URLSearchParams("?compare&diff&mobileLineNumbers=1").entries()),
      ),
    ).toEqual({
      compare: true,
      diff: true,
      mobileLineNumbers: "1",
    });
  });

  it("builds file-view search patches", () => {
    expect(
      buildFileViewRouteSearch({
        compare: true,
        diff: false,
      }),
    ).toEqual({
      compare: true,
      diff: null,
    });
  });

  it("updates file-view keys while preserving unrelated query params", () => {
    expect(
      stringifyTanStackSearch(
        mergeFileViewRouteSearch(parseTanStackSearch("?devtools&mobileLineNumbers=1&compare"), {
          diff: true,
          mobileLineNumbers: "1",
        }),
      ),
    ).toBe("?devtools&mobileLineNumbers=1&diff");
  });

  it("builds file-view hrefs without decoding encoded branch slashes", () => {
    expect(
      buildFileViewSearchHref({
        pathname: "/repo/samebase/samebase/fs/codex%2Fintegrate-new-skill-files/README.md",
        search: parseTanStackSearch("?dev"),
        fileViewSearch: {
          diff: true,
          compare: true,
        },
      }),
    ).toBe(
      "/repo/samebase/samebase/fs/codex%2Fintegrate-new-skill-files/README.md?dev&diff&compare",
    );
  });
});
