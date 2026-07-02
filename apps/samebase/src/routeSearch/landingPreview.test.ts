import { describe, expect, it } from "vite-plus/test";
import { validateLandingPreviewRouteSearch } from "@/routeSearch/landingPreview";

describe("landingPreview", () => {
  it("ignores unsupported query values", () => {
    expect(validateLandingPreviewRouteSearch({ lang: "ro" })).toEqual({});
  });

  it("keeps hidden mobile pane query flags", () => {
    expect(validateLandingPreviewRouteSearch({ left: "", right: undefined })).toEqual({
      left: true,
    });

    expect(validateLandingPreviewRouteSearch({ left: undefined, right: "" })).toEqual({
      right: true,
    });
  });
});
