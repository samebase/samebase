import { describe, expect, it } from "vite-plus/test";
import {
  applySearchPatch,
  normalizeRouteSearchPresenceFlags,
} from "@/lib/routeSearchFlags";

describe("routeSearchFlags", () => {
  it("normalizes URLSearchParams flags by key presence", () => {
    expect(
      normalizeRouteSearchPresenceFlags(new URLSearchParams("?dev=false"), [
        "dev",
      ]),
    ).toEqual({ dev: true });
    expect(
      normalizeRouteSearchPresenceFlags(new URLSearchParams(""), ["dev"]),
    ).toEqual({});
  });

  it("treats undefined and null object values as absent", () => {
    expect(
      normalizeRouteSearchPresenceFlags(
        {
          dark: null,
          dev: "false",
          light: undefined,
          primary: "red-600",
        },
        ["dark", "dev", "light"],
      ),
    ).toEqual({
      dev: true,
      primary: "red-600",
    });
  });

  it("ignores inherited flag keys", () => {
    const search = { primary: "red-600" };
    Object.setPrototypeOf(search, { dev: "false" });

    expect(normalizeRouteSearchPresenceFlags(search, ["dev"])).toEqual({
      primary: "red-600",
    });
  });

  it("converts null tombstones to retained-search clear markers", () => {
    const patchedSearch = applySearchPatch(
      {
        dev: true,
        primary: "red-600",
      },
      {
        dev: null,
        primary: undefined,
      },
    );

    expect("dev" in patchedSearch).toBe(true);
    expect(patchedSearch.dev).toBeUndefined();
    expect(patchedSearch.primary).toBe("red-600");
  });
});
