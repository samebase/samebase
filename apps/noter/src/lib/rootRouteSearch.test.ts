import { describe, expect, it } from "vitest";
import {
  readRootRouteSearch,
  validateRootRouteSearch,
} from "./rootRouteSearch";

describe("rootRouteSearch", () => {
  it("accepts the routed root landing flags and auth provider", () => {
    expect(
      validateRootRouteSearch({
        auth: "google",
        dev: "",
        devtools: "true",
        "prod-ui": "",
      }),
    ).toEqual({
      auth: "google",
      dev: true,
      devtools: true,
      "prod-ui": true,
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "github",
        dev: "1",
        devtools: "false",
        "prod-ui": false,
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(readRootRouteSearch("?prod-ui&dev&auth=google")).toEqual({
      auth: "google",
      dev: true,
      "prod-ui": true,
    });
  });
});
