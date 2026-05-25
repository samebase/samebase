import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
} from "@/components/logo/logoVoxelState";
import { readRootRouteSearch, validateRootRouteSearch } from "./rootRouteSearch";

describe("rootRouteSearch", () => {
  it("accepts the routed root landing flags and auth provider", () => {
    expect(
      validateRootRouteSearch({
        "add-cloudflare": "",
        "add-convex": "",
        auth: "google",
        "auth-return": "dashboard",
        base: "#ffffff",
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
        "sidebar-reset": "",
        signup: "google",
        top: "white-base",
      }),
    ).toEqual({
      "add-cloudflare": true,
      "add-convex": true,
      auth: "google",
      "auth-return": "dashboard",
      background: "#ffffff",
      border: "stone-300",
      delete: true,
      depth: 2,
      dist: 1.25,
      dark: true,
      dev: true,
      devtools: true,
      "new-app": true,
      primary: "red-600",
      "prod-ui": true,
      secondary: "lime-100",
      "sidebar-reset": true,
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
        "sidebar-reset": "false",
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
        light: 0,
        "new-app": "false",
        "prod-ui": false,
      }),
    ).toEqual({
      dark: true,
      dev: true,
      devtools: true,
      light: true,
      "new-app": true,
      "prod-ui": true,
    });
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch(
        "?prod-ui&dev&sidebar-reset&auth=google&signup=google&primary=red-600&delete&new-app",
      ),
    ).toEqual({
      auth: "google",
      delete: true,
      dev: true,
      "new-app": true,
      primary: "red-600",
      "prod-ui": true,
      "sidebar-reset": true,
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

  it("preserves explicit supported root logo grid sizes", () => {
    expect(readRootRouteSearch("?gridSize=2")).toEqual({
      gridSize: LOGO_GRID_SIZE_2,
    });
    expect(readRootRouteSearch("?gridSize=3")).toEqual({
      gridSize: LOGO_GRID_SIZE_3,
    });
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
