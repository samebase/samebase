import { describe, expect, it } from "vite-plus/test";
import { buildPricingRouteSearch, validatePricingRouteSearch } from "./pricing";

describe("pricing route search", () => {
  it("accepts only known pricing checkout states", () => {
    expect(validatePricingRouteSearch({ checkout: "success" })).toEqual({
      checkout: "success",
    });
    expect(validatePricingRouteSearch({ checkout: "nope" })).toEqual({});
    expect(buildPricingRouteSearch("cancel")).toEqual({
      checkout: "cancel",
    });
    expect(buildPricingRouteSearch(null)).toEqual({});
  });
});
