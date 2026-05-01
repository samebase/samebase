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
        delete: "noter-md/noter",
        dev: "",
        devtools: "true",
        "prod-ui": "",
        signup: "google",
      }),
    ).toEqual({
      auth: "google",
      delete: "noter-md/noter",
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
        delete: "missing-repo-separator",
        dev: "1",
        devtools: "false",
        "prod-ui": false,
        signup: "github",
      }),
    ).toEqual({});
  });

  it("parses the root search contract from a search string", () => {
    expect(
      readRootRouteSearch(
        "?prod-ui&dev&auth=google&signup=google&delete=noter-md%2Fnoter",
      ),
    ).toEqual({
      auth: "google",
      delete: "noter-md/noter",
      dev: true,
      "prod-ui": true,
      signup: "google",
    });
  });
});
