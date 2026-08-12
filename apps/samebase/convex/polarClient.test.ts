import { describe, expect, it } from "vite-plus/test";

import {
  readPolarCheckoutProductId,
  readPolarProductCatalog,
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
  it("keeps billing unavailable until real product IDs are recorded", () => {
    expect(readPolarProductCatalog()).toBeNull();
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
