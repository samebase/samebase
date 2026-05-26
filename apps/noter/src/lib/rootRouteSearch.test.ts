import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_VOXEL_STATE, LOGO_GRID_SIZE_2 } from "@/components/logo/logoVoxelState";
import {
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
        background: "#ffffff",
        border: "stone-300",
        delete: "",
        depth: "2",
        dist: "1.25",
        dark: "",
        dev: "",
        devtools: "true",
        "new-app": "",
        primary: "red-600",
        "prod-ui": "",
        secondary: "lime-100",
        signup: "google",
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
      secondary: "lime-100",
      signup: "google",
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
        "add-app-root": "false",
        light: 0,
        "new-app": "false",
        "prod-ui": false,
      }),
    ).toEqual({
      dark: true,
      dev: true,
      devtools: true,
      light: true,
      "prod-ui": true,
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
        "?prod-ui&dev&auth=google&signup=google&primary=red-600&delete&new-app&add-app-root",
      ),
    ).toEqual({
      auth: "google",
      dev: true,
      primary: "red-600",
      "prod-ui": true,
      signup: "google",
    });
  });

  it("parses the one-shot dashboard auth return marker", () => {
    expect(readRootRouteSearch("?auth-return=dashboard")).toEqual({
      "auth-return": "dashboard",
    });
  });

  it("normalizes root logo depth without capping deliberate values", () => {
    expect(readRootRouteSearch("?depth=99")).toEqual({
      depth: 99,
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

  it("accepts the old root logo base color alias as background", () => {
    expect(readRootRouteSearch("?base=%23112233")).toEqual({
      background: "#112233",
    });
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
        isoSide: "52",
        isoStyle: "flat",
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
      isoSide: 40,
      isoStyle: "flat",
      leftFace: "striped",
      rot: 1,
      stripeG: 0.4,
      stripeLink: true,
      stripeW: 0.4,
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("replaces logo params without dropping dashboard route state", () => {
    const nextSearch = replaceRootLogoRouteSearch(
      {
        "new-app": true,
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

    expect(nextSearch["new-app"]).toBe(true);
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
});
