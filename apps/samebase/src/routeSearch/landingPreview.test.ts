import { describe, expect, it } from "vite-plus/test";
import { validateLandingPageRouteSearch } from "@/routeSearch/landingPreview";

describe("landing page route search", () => {
  it("ignores unsupported query values", () => {
    expect(validateLandingPageRouteSearch({ lang: "ro" })).toEqual({});
  });

  it("keeps hidden mobile pane query flags", () => {
    expect(validateLandingPageRouteSearch({ left: "", right: undefined })).toEqual({
      left: true,
    });

    expect(validateLandingPageRouteSearch({ left: undefined, right: "" })).toEqual({
      right: true,
    });
  });
});
