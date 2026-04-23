import { describe, expect, it } from "vite-plus/test";
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
        signup: "google",
      }),
    ).toEqual({
      auth: "google",
      dev: true,
      devtools: true,
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
        "prod-ui": false,
        signup: "github",
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch("?prod-ui&dev&auth=google&signup=google"),
    ).toEqual({
      auth: "google",
      dev: true,
      "prod-ui": true,
      signup: "google",
    });
  });
});
