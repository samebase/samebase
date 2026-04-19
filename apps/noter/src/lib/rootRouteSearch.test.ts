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
        perf: "",
        "prod-ui": "",
        signup: "google",
      }),
    ).toEqual({
      auth: "google",
      dev: true,
      devtools: true,
      perf: true,
      "prod-ui": true,
      signup: "google",
    });
  });

  it("drops malformed root landing search values instead of preserving junk", () => {
    expect(
      validateRootRouteSearch({
        auth: "github",
        dev: "1",
        devtools: "false",
        perf: "0",
        "prod-ui": false,
        signup: "github",
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch("?prod-ui&dev&perf&auth=google&signup=google"),
    ).toEqual({
      auth: "google",
      dev: true,
      perf: true,
      "prod-ui": true,
      signup: "google",
    });
  });
});
