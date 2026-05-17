import { describe, expect, it } from "vite-plus/test";
import {
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "#src/lib/landingMarkdownPreview.ts";

describe("landingMarkdownPreview", () => {
  it("defaults to English without a language query", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({});

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("en");
  });

  it("accepts the Romanian preview language query", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({ lang: "ro" });

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("ro");
  });

  it("ignores unsupported language query values", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({ lang: "fr" });

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("en");
  });
});
