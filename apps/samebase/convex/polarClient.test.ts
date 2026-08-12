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
    productId: "organization-free-v1",
    ownerType: "organization",
    plan: "free",
    version: 1,
    availableForCheckout: false,
  },
  {
    productId: "organization-free-v2",
    ownerType: "organization",
    plan: "free",
    version: 2,
    availableForCheckout: true,
  },
  {
    productId: "organization-pro-v1",
    ownerType: "organization",
    plan: "pro",
    version: 1,
    availableForCheckout: true,
  },
  {
    productId: "user-free-v1",
    ownerType: "user",
    plan: "free",
    version: 1,
    availableForCheckout: true,
  },
  {
    productId: "user-pro-v1",
    ownerType: "user",
    plan: "pro",
    version: 1,
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
  it("configures all current Sandbox products and keeps production unavailable", () => {
    const sandbox = requireCatalog(POLAR_PRODUCT_CATALOG.sandbox);

    expect(readPolarCheckoutProductId(sandbox, "organization", "free")).toBe(
      "7782b9a4-beb8-4ff5-8455-24976deacbc1",
    );
    expect(readPolarCheckoutProductId(sandbox, "organization", "pro")).toBe(
      "0e721c02-c98b-425b-bc8d-fb323fa54925",
    );
    expect(readPolarCheckoutProductId(sandbox, "user", "free")).toBe(
      "746b5cca-6043-477f-afc1-337443e71f2b",
    );
    expect(readPolarCheckoutProductId(sandbox, "user", "pro")).toBe(
      "55811c0d-bc67-4bd4-b715-b9bd801a2911",
    );
    expect(readPolarProductCatalogFromEntries(POLAR_PRODUCT_CATALOG.production)).toBeNull();
  });

  it("selects current products and recognizes historical products", () => {
    const catalog = requireCatalog(catalogEntries);

    expect(readPolarCheckoutProductId(catalog, "organization", "free")).toBe(
      "organization-free-v2",
    );
    expect(readPolarCheckoutProductId(catalog, "organization", "pro")).toBe("organization-pro-v1");
    expect(readPolarCheckoutProductId(catalog, "user", "free")).toBe("user-free-v1");
    expect(readPolarCheckoutProductId(catalog, "user", "pro")).toBe("user-pro-v1");
    expect(resolvePolarProduct(catalog, "organization-free-v1")).toEqual({
      productId: "organization-free-v1",
      ownerType: "organization",
      plan: "free",
      version: 1,
      availableForCheckout: false,
    });
    expect(resolvePolarProduct(catalog, "unknown-product")).toBeNull();
  });

  it("fails closed when a current product is missing", () => {
    const missingUserPro = catalogEntries.filter(
      (entry) => entry.ownerType !== "user" || entry.plan !== "pro",
    );

    expect(readPolarProductCatalogFromEntries(missingUserPro)).toBeNull();
  });

  it("rejects duplicate and malformed catalog entries", () => {
    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "user-pro-v1",
          ownerType: "user",
          plan: "pro",
          version: 2,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product IDs must be unique within one server.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "organization-free-other-v1",
          ownerType: "organization",
          plan: "free",
          version: 1,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product versions must be unique within one product line.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "organization-free-v3",
          ownerType: "organization",
          plan: "free",
          version: 3,
          availableForCheckout: true,
        },
      ]),
    ).toThrow("Polar billing requires exactly one checkout product for each owner type and plan.");

    expect(() =>
      readPolarProductCatalogFromEntries([
        ...catalogEntries,
        {
          productId: "organization-pro-v0",
          ownerType: "organization",
          plan: "pro",
          version: 0,
          availableForCheckout: false,
        },
      ]),
    ).toThrow("Polar billing product versions must be positive integers.");
  });
});
