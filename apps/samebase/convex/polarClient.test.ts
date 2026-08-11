import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { readPolarProductCatalog, resolvePolarProduct } from "./polarClient";

function stubPolarProductCatalog() {
  vi.stubEnv("POLAR_GITHUB_ORGANIZATION_FREE_MONTHLY_PRODUCT_ID", "organization-free");
  vi.stubEnv("POLAR_GITHUB_ORGANIZATION_PRO_MONTHLY_PRODUCT_ID", "organization-pro");
  vi.stubEnv("POLAR_GITHUB_USER_FREE_MONTHLY_PRODUCT_ID", "user-free");
  vi.stubEnv("POLAR_GITHUB_USER_PRO_MONTHLY_PRODUCT_ID", "user-pro");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Polar product catalog", () => {
  it("maps every configured owner and plan product", () => {
    stubPolarProductCatalog();

    const catalog = readPolarProductCatalog();
    expect(catalog).not.toBeNull();
    if (catalog === null) {
      throw new Error("Polar product catalog is required.");
    }

    expect(resolvePolarProduct(catalog, "organization-free")).toEqual({
      ownerType: "organization",
      plan: "free",
    });
    expect(resolvePolarProduct(catalog, "organization-pro")).toEqual({
      ownerType: "organization",
      plan: "pro",
    });
    expect(resolvePolarProduct(catalog, "user-free")).toEqual({
      ownerType: "user",
      plan: "free",
    });
    expect(resolvePolarProduct(catalog, "user-pro")).toEqual({
      ownerType: "user",
      plan: "pro",
    });
    expect(resolvePolarProduct(catalog, "unknown-product")).toBeNull();
  });

  it("fails closed when a product is missing or product IDs overlap", () => {
    expect(readPolarProductCatalog()).toBeNull();

    stubPolarProductCatalog();
    vi.stubEnv("POLAR_GITHUB_USER_PRO_MONTHLY_PRODUCT_ID", "organization-pro");
    expect(() => readPolarProductCatalog()).toThrow("Polar billing product IDs must be unique.");
  });
});
