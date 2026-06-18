import { describe, expect, it } from "vite-plus/test";
import {
  resolveLandingMarkdownPreviewLanguage,
  validateLandingMarkdownPreviewRouteSearch,
} from "@/routeSearch/landingPreview";

describe("landingMarkdownPreview", () => {
  it("defaults to English without a language query", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({});

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("en");
  });

  it("accepts the Romanian preview language query", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({ lang: "ro" });

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("ro");
  });

  it("keeps hidden mobile pane query flags", () => {
    expect(validateLandingMarkdownPreviewRouteSearch({ left: "", right: undefined })).toEqual({
      left: true,
    });

    expect(validateLandingMarkdownPreviewRouteSearch({ left: undefined, right: "" })).toEqual({
      right: true,
    });
  });

  it("ignores unsupported language query values", () => {
    const search = validateLandingMarkdownPreviewRouteSearch({ lang: "fr" });

    expect(resolveLandingMarkdownPreviewLanguage(search)).toBe("en");
  });
});
