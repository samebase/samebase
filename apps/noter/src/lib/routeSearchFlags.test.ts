import { describe, expect, it } from "vite-plus/test";
import {
  hasRouteSearchPresenceFlag,
  normalizeRouteSearchPresenceFlags,
} from "@/lib/routeSearchFlags";

describe("routeSearchFlags", () => {
  it("reads URLSearchParams flags by key presence", () => {
    expect(
      hasRouteSearchPresenceFlag(new URLSearchParams("?dev=false"), "dev"),
    ).toBe(true);
    expect(hasRouteSearchPresenceFlag(new URLSearchParams(""), "dev")).toBe(
      false,
    );
  });

  it("treats undefined and null object values as absent", () => {
    expect(hasRouteSearchPresenceFlag({ dev: false }, "dev")).toBe(true);
    expect(hasRouteSearchPresenceFlag({ dev: undefined }, "dev")).toBe(false);
    expect(hasRouteSearchPresenceFlag({ dev: null }, "dev")).toBe(false);
  });

  it("normalizes present flag keys to true", () => {
    expect(
      normalizeRouteSearchPresenceFlags(
        {
          dev: "false",
          light: undefined,
          primary: "red-600",
        },
        ["dev", "light"],
      ),
    ).toEqual({
      dev: true,
      primary: "red-600",
    });
  });
});
