import { describe, expect, it } from "vite-plus/test";
import { MAX_LOGO_FRACTAL_DEPTH } from "@/components/logo/logoDepthLimits";
import { DEFAULT_VOXEL_STATE, LOGO_GRID_SIZE_2 } from "@/components/logo/logoVoxelState";
import {
  readCanonicalRouteAddressForRootSearch,
  readRootRouteSearch,
  replaceRootLogoRouteSearch,
  validateRootRouteSearch,
} from "./rootRouteSearch";

describe("rootRouteSearch", () => {
  it("drops conflicting dashboard modal flags while keeping independent root search", () => {
    expect(
      validateRootRouteSearch({
        "add-app-root": "",
        "add-cloudflare": "",
        "add-convex": "",
        "app-root": " apps/noter ",
        auth: "google",
        "auth-return": "dashboard",
        "create-account": "",
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
        secondary: "lime-100",
        signup: "google",
        "sign-in": "",
        "swipe-debug": "",
        top: "white-base",
      }),
    ).toEqual({
      auth: "google",
      "auth-return": "dashboard",
      "create-account": true,
      background: "#ffffff",
      border: "stone-300",
      depth: 2,
      dist: 1.25,
      dark: true,
      dev: true,
      devtools: true,
      primary: "red-600",
      "prod-ui": true,
      secondary: "lime-100",
      signup: "google",
      "sign-in": true,
      "swipe-debug": true,
      top: "white-base",
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "github",
        "auth-return": "home",
        background: "bad",
        border: "nope-500",
        depth: "nope",
        dist: "nope",
        primary: "nope-500",
        secondary: 3,
        signup: "github",
      }),
    ).toEqual({});
  });

  it("treats present root flags as enabled regardless of value", () => {
    expect(
      validateRootRouteSearch({
        dark: "false",
        dev: "1",
        devtools: "false",
        "create-account": "false",
        light: 0,
        "prod-ui": false,
        "sign-in": "false",
        "swipe-debug": "false",
      }),
    ).toEqual({
      "create-account": true,
      dark: true,
      dev: true,
      devtools: true,
      light: true,
      "prod-ui": true,
      "sign-in": true,
      "swipe-debug": true,
    });
  });

  it("keeps a scoped provider dashboard intent", () => {
    expect(
      validateRootRouteSearch({
        "add-convex": "",
        "app-root": " apps/noter ",
      }),
    ).toEqual({
      "add-convex": true,
      "app-root": "apps/noter",
    });
  });

  it("drops bare provider dashboard intents", () => {
    expect(
      validateRootRouteSearch({
        "add-cloudflare": "",
        "add-convex": "",
        "app-root": " apps/noter ",
      }),
    ).toEqual({});
    expect(validateRootRouteSearch({ "add-cloudflare": "" })).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch(
        "?prod-ui&dev&auth=google&signup=google&sign-in&create-account&primary=red-600&delete&add-app-root",
      ),
    ).toEqual({
      auth: "google",
      "create-account": true,
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      signup: "google",
      "sign-in": true,
    });
  });

  it("parses the one-shot dashboard auth return marker", () => {
    expect(readRootRouteSearch("?auth-return=dashboard")).toEqual({
      "auth-return": "dashboard",
    });
  });

  it("parses the global swipe debug flag", () => {
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

  it("ignores the unsupported base query key", () => {
    expect(readRootRouteSearch("?base=%23112233")).toEqual({});
  });

  it("preserves explicit supported root logo grid sizes", () => {
    expect(readRootRouteSearch("?gridSize=2")).toEqual({
      gridSize: LOGO_GRID_SIZE_2,
    });
    expect(readRootRouteSearch("?gridSize=3")).toEqual({});
    expect(readRootRouteSearch("?gridSize=4")).toEqual({});
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
        pathname: "/home",
        searchStr: "?machineId=sample-machine",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/home");
  });

  it("keeps accepted route keys and root-owned keys when predicting the redirect", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["machineId", "threadId"],
        pathname: "/machines",
        searchStr: "?prod-ui&machineId=sample-machine&swipe-debug&unknownKey=1",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe("/machines?machineId=sample-machine&swipe-debug&prod-ui");
  });

  it("strips prod-ui in production canonicalization while preserving accepted route parts", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["machineId", "threadId"],
        pathname: "/machines",
        searchStr: "?prod-ui&machineId=sample-machine&swipe-debug",
        hash: "ready",
        stripProdUi: true,
      }),
    ).toBe("/machines?machineId=sample-machine&swipe-debug#ready");
  });

  it("does not redirect production canonicalization when prod-ui is absent", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["machineId", "threadId"],
        pathname: "/machines",
        searchStr: "?machineId=sample-machine&swipe-debug",
        hash: "ready",
        stripProdUi: true,
      }),
    ).toBe(null);
  });

  it("does not redirect when every raw key is accepted", () => {
    expect(
      readCanonicalRouteAddressForRootSearch({
        acceptedSearchKeys: ["machineId"],
        pathname: "/machines",
        searchStr: "?machineId=sample-machine",
        hash: "",
        stripProdUi: false,
      }),
    ).toBe(null);
  });
});
