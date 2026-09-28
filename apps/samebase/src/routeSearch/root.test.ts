import { describe, expect, it } from "vite-plus/test";
import { MAX_LOGO_FRACTAL_DEPTH } from "@/logo/logoDepthLimits";
import {
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_4,
  MAX_LOGO_GRID_SIZE,
} from "@samebase/logo-model/voxel";
import {
  applyRepositoryDashboardProviderAddSearch,
  clearRepositoryDashboardQueryDialogSearch,
  readCanonicalRouteAddressForRootSearch,
  readRootRouteSearch,
  replaceRootLogoRouteSearch,
  type RootRouteSearch,
  validateRootRouteSearch,
} from "./root";

describe("rootRouteSearch", () => {
  it("opens one provider dialog while keeping independent root search", () => {
    const currentSearch = {
      "add-convex": true,
      delete: true,
      "prod-ui": true,
    } satisfies RootRouteSearch;

    expect(
      applyRepositoryDashboardProviderAddSearch({ currentSearch, provider: "cloudflare" }),
    ).toEqual({
      "add-cloudflare": true,
      "add-convex": undefined,
      delete: undefined,
      "prod-ui": true,
    });
  });

  it("clears only the selected repository dashboard dialog search", () => {
    const currentSearch = {
      "add-cloudflare": true,
      "add-convex": true,
      delete: true,
      devtools: true,
    } satisfies RootRouteSearch;

    expect(clearRepositoryDashboardQueryDialogSearch(currentSearch, "add-cloudflare")).toEqual({
      ...currentSearch,
      "add-cloudflare": undefined,
    });
    expect(clearRepositoryDashboardQueryDialogSearch(currentSearch, "add-convex")).toEqual({
      ...currentSearch,
      "add-convex": undefined,
    });
    expect(clearRepositoryDashboardQueryDialogSearch(currentSearch, "delete")).toEqual({
      ...currentSearch,
      delete: undefined,
    });
  });

  it("drops conflicting dashboard modal flags while keeping independent root search", () => {
    expect(
      validateRootRouteSearch({
        "add-cloudflare": "",
        "add-convex": "",
        auth: "google",
        "auth-return": "dashboard",
        background: "#ffffff",
        border: "stone-300",
        delete: "",
        depth: "2",
        dist: "1.25",
        dark: "",
        dev: "",
        devtools: "true",
        primary: "red-600",
        "prod-ui": "",
        secondary: "cyan-500",
        signup: "google",
        "swipe-debug": "",
        top: "white-base",
      }),
    ).toEqual({
      auth: "google",
      "auth-return": "dashboard",
      background: "#ffffff",
      border: "stone-300",
      depth: 2,
      dist: 1.25,
      dark: true,
      dev: true,
      devtools: true,
      primary: "red-600",
      "prod-ui": true,
      secondary: "cyan-500",
      signup: "google",
      "swipe-debug": true,
      top: "white-base",
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "netlify",
        "auth-return": "home",
        background: "bad",
        border: "nope-500",
        depth: "nope",
        dist: "nope",
        primary: "nope-500",
        secondary: 3,
        signup: "apple",
      }),
    ).toEqual({});
  });

  it("accepts only allowlisted authorization completion values", () => {
    expect(
      validateRootRouteSearch({
        "authorization-provider": "convex",
        "authorization-error": "target-mismatch",
        "prod-ui": "",
      }),
    ).toEqual({
      "authorization-provider": "convex",
      "authorization-error": "target-mismatch",
      "prod-ui": true,
    });
    expect(
      validateRootRouteSearch({
        "authorization-provider": "provider-response",
        "authorization-error": "secret-detail",
      }),
    ).toEqual({});
    expect(
      validateRootRouteSearch({
        "authorization-provider": "github-app",
        "authorization-error": "organization-owner-required",
      }),
    ).toEqual({
      "authorization-provider": "github-app",
      "authorization-error": "organization-owner-required",
    });
  });

  it("treats present root flags as enabled regardless of value", () => {
    expect(
      validateRootRouteSearch({
        dark: "false",
        dev: "1",
        devtools: "false",
        light: 0,
        "prod-ui": false,
        "swipe-debug": "false",
      }),
    ).toEqual({
      dark: true,
      dev: true,
      devtools: true,
      light: true,
      "prod-ui": true,
      "swipe-debug": true,
    });
  });

  it("keeps a bare provider dashboard intent", () => {
    expect(
      validateRootRouteSearch({
        "add-convex": "",
      }),
    ).toEqual({
      "add-convex": true,
    });
    expect(validateRootRouteSearch({ "add-cloudflare": "" })).toEqual({
      "add-cloudflare": true,
    });
  });

  it("drops conflicting provider dashboard intents", () => {
    expect(
      validateRootRouteSearch({
        "add-cloudflare": "",
        "add-convex": "",
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch("?prod-ui&dev&auth=google&signup=google&primary=red-600&delete"),
    ).toEqual({
      auth: "google",
      delete: true,
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      signup: "google",
    });
  });

  it("parses GitHub OAuth entry and return markers", () => {
    expect(readRootRouteSearch("?auth=github&signup=github&auth-return=dashboard")).toEqual({
      auth: "github",
      "auth-return": "dashboard",
      signup: "github",
    });
  });

  it("parses the one-shot dashboard auth return marker", () => {
    expect(readRootRouteSearch("?auth-return=dashboard")).toEqual({
      "auth-return": "dashboard",
    });
  });

  it("parses the Convex Auth callback code as hidden root search", () => {
    expect(readRootRouteSearch("?code= oauth-code ")).toEqual({
      code: "oauth-code",
    });
  });

  it("parses the global workspace debug flag", () => {
    expect(readRootRouteSearch("?swipe-debug")).toEqual({
      "swipe-debug": true,
    });
  });

  it("caps root logo depth at the shared route recovery max", () => {
    expect(readRootRouteSearch("?depth=99")).toEqual({
      depth: MAX_LOGO_FRACTAL_DEPTH,
    });
  });

  it("normalizes root logo distance without capping deliberate values", () => {
    expect(readRootRouteSearch("?dist=3")).toEqual({
      dist: 3,
    });
    expect(readRootRouteSearch("?dist=-1")).toEqual({
      dist: 0,
    });
  });

  it("normalizes root logo preview zoom inside the supported range", () => {
    expect(readRootRouteSearch("?zoom=2")).toEqual({
      zoom: 1,
    });
    expect(readRootRouteSearch("?zoom=-1")).toEqual({
      zoom: 0,
    });
  });

  it("parses root logo motion and opacity controls", () => {
    expect(readRootRouteSearch("?auto-rotate&auto-shuffle&shuffleMoves=2&opacity=0.5")).toEqual({
      "auto-rotate": true,
      "auto-shuffle": true,
      opacity: 0.5,
      shuffleMoves: 2,
    });
  });

  it("ignores the unsupported base query key", () => {
    expect(readRootRouteSearch("?base=%23112233")).toEqual({});
  });

  it("preserves explicit supported root logo grid sizes", () => {
    expect(readRootRouteSearch("?gridSize=2")).toEqual({
      gridSize: LOGO_GRID_SIZE_2,
    });
    expect(readRootRouteSearch("?gridSize=3")).toEqual({});
    expect(readRootRouteSearch("?gridSize=4")).toEqual({
      gridSize: LOGO_GRID_SIZE_4,
    });
    expect(readRootRouteSearch("?gridSize=10")).toEqual({
      gridSize: MAX_LOGO_GRID_SIZE,
    });
    expect(readRootRouteSearch("?gridSize=11")).toEqual({});
  });

  it("accepts logo route params on root surfaces", () => {
    expect(
      validateRootRouteSearch({
        axis: "screen-vertical",
        elev: "32.4",
        freeView: "",
        leftFace: "striped",
        rot: "721",
        stripeG: "0.4",
        stripeLink: "",
        vox: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      axis: "screen-vertical",
      elev: 32.4,
      freeView: true,
      leftFace: "striped",
      rot: 1,
      stripeG: 0.4,
      stripeLink: true,
      stripeW: 0.4,
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("drops iso renderer params from root surfaces", () => {
    expect(validateRootRouteSearch({ isoSide: "52", isoStyle: "flat" })).toEqual({});
  });

  it("replaces logo params without dropping dashboard route state", () => {
    const nextSearch = replaceRootLogoRouteSearch(
      {
        delete: true,
        depth: 2,
        elev: 24,
        freeView: true,
        primary: "red-600",
        rot: 45,
        top: "blue-500",
      },
      {
        primary: "green-500",
        rot: 90,
      },
    );

    expect(nextSearch.delete).toBe(true);
    expect(nextSearch.primary).toBe("green-500");
    expect(nextSearch.rot).toBe(90);
    expect(nextSearch.depth).toBeUndefined();
    expect(nextSearch.elev).toBeUndefined();
    expect(nextSearch.freeView).toBeUndefined();
    expect(nextSearch.top).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(nextSearch, "depth")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(nextSearch, "elev")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(nextSearch, "freeView")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(nextSearch, "top")).toBe(true);
  });

  it("ignores all other parsed root params while reset is present", () => {
    expect(readRootRouteSearch("?reset=true&primary=red-600&devtools")).toEqual({ reset: true });
  });

  it("activates reset from any present value", () => {
    expect(
      validateRootRouteSearch({
        primary: "red-600",
        reset: false,
      }),
    ).toEqual({ reset: true });

    expect(validateRootRouteSearch({ reset: "true" })).toEqual({
      reset: true,
    });
    expect(validateRootRouteSearch({ reset: 0 })).toEqual({ reset: true });
    expect(validateRootRouteSearch({ reset: undefined })).toEqual({});
    expect(validateRootRouteSearch({ reset: null })).toEqual({});
  });

  it("preserves conflicting light and dark flags for root route canonicalization", () => {
    expect(readRootRouteSearch("?dev&light&dark")).toEqual({
      dark: true,
      dev: true,
      light: true,
    });
  });

  it("predicts the root redirect for reset search", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: [],
        pathname: "/logo",
        searchStr: "?dark&reset",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/logo");
  });

  it("predicts the root redirect for conflicting theme flags", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: [],
        pathname: "/logo",
        searchStr: "?dark&dev&light",
        hash: "section",
        stripProdUi: false,
      }),
    ).toBe("/logo?dev#section");
  });

  it("predicts the root redirect that drops keys no matched route accepts", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: [],
        pathname: "/repo",
        searchStr: "?stale=1",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/repo");
  });

  it("preserves the Convex Auth callback code for the auth provider", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: [],
        pathname: "/repo",
        searchStr: "?code=oauth-code&unknownKey=1",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/repo?code=oauth-code");
  });

  it("keeps accepted route keys and root-owned keys when predicting the redirect", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["delete-account"],
        pathname: "/settings",
        searchStr: "?prod-ui&delete-account&swipe-debug&unknownKey=1",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/settings?delete-account&swipe-debug&prod-ui");
  });

  it("strips prod-ui in production canonicalization while preserving accepted route parts", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["delete-account"],
        pathname: "/settings",
        searchStr: "?prod-ui&delete-account&swipe-debug",
        hash: "ready",
        stripProdUi: true,
      }),
    ).toBe("/settings?delete-account&swipe-debug#ready");
  });

  it("does not redirect production canonicalization when prod-ui is absent", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["delete-account"],
        pathname: "/settings",
        searchStr: "?delete-account&swipe-debug",
        hash: "ready",
        stripProdUi: true,
      }),
    ).toBe(null);
  });

  it("does not redirect when every raw key is accepted", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["delete-account"],
        pathname: "/settings",
        searchStr: "?delete-account",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe(null);
  });
});
