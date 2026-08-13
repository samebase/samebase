import { describe, expect, it } from "vite-plus/test";

import {
  POLAR_PRODUCT_CATALOG,
  readPolarCheckoutProductId,
  readPolarProductCatalogFromEntries,
  resolvePolarProduct,
  type PolarProductCatalog,
} from "./polarClient";

const catalogEntries = [
  {
    productId: "samebase-pro-v1",
    version: 1,
    availableForCheckout: false,
  },
  {
    productId: "samebase-pro-v2",
    version: 2,
    availableForCheckout: true,
  },
] satisfies PolarProductCatalog;

function requireCatalog(entries: PolarProductCatalog): PolarProductCatalog {
  const catalog = readPolarProductCatalogFromEntries(entries);
  if (catalog === null) {
    throw new Error("Polar product catalog is required.");
  }
  return catalog;
}

describe("Polar product catalog", () => {
  it("configures one current Sandbox Pro product and keeps production unavailable", () => {
    const sandbox = requireCatalog(POLAR_PRODUCT_CATALOG.sandbox);

    expect(readPolarCheckoutProductId(sandbox)).toBe("0e721c02-c98b-425b-bc8d-fb323fa54925");
    expect(readPolarProductCatalogFromEntries(POLAR_PRODUCT_CATALOG.production)).toBeNull();
  });

  it("selects the current Pro product and recognizes historical Pro products", () => {
    const catalog = requireCatalog(catalogEntries);

    expect(readPolarCheckoutProductId(catalog)).toBe("samebase-pro-v2");
    expect(resolvePolarProduct(catalog, "samebase-pro-v1")).toEqual({
      productId: "samebase-pro-v1",
      version: 1,
      availableForCheckout: false,
    });
    expect(resolvePolarProduct(catalog, "unknown-product")).toBeNull();
  });

  it("keeps historical products available for reconciliation without enabling checkout", () => {
    const historicalCatalog = requireCatalog(
      catalogEntries.map((entry) => ({ ...entry, availableForCheckout: false })),
    );

    expect(() => readPolarCheckoutProductId(historicalCatalog)).toThrow(
      "Polar billing requires exactly one checkout product per server.",
    );
    expect(resolvePolarProduct(historicalCatalog, "samebase-pro-v1")).not.toBeNull();
  });

  it("rejects duplicate and malformed catalog entries", () => {
    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "samebase-pro-v1",
          version: 3,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product IDs must be unique within one server.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "samebase-pro-other-v1",
          version: 1,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product versions must be unique within one server.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "samebase-pro-v3",
          version: 3,
          availableForCheckout: true,
        },
      ]),
    ).toThrow("Polar billing requires exactly one checkout product per server.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "samebase-pro-v0",
          version: 0,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product versions must be positive integers.");
  });
});
