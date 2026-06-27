import { describe, expect, it } from "vite-plus/test";
import { validateLandingMarkdownPreviewRouteSearch } from "@/routeSearch/landingPreview";

describe("landingMarkdownPreview", () => {
  it("ignores unsupported query values", () => {
    expect(validateLandingMarkdownPreviewRouteSearch({ lang: "ro" })).toEqual({});
  });

  it("keeps hidden mobile pane query flags", () => {
    expect(validateLandingMarkdownPreviewRouteSearch({ left: "", right: undefined })).toEqual({
      left: true,
    });

    expect(validateLandingMarkdownPreviewRouteSearch({ left: undefined, right: "" })).toEqual({
      right: true,
    });
  });
});
