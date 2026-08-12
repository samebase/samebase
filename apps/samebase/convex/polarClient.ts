import { Polar } from "@polar-sh/sdk";

import { env } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";

export type PolarServer = "sandbox" | "production";
export type PolarProductOwnerType = "organization" | "user";
export type PolarProductPlan = "free" | "pro";
export type PolarProductCatalogEntry = {
  readonly productId: string;
  readonly ownerType: PolarProductOwnerType;
  readonly plan: PolarProductPlan;
  readonly version: number;
  readonly availableForCheckout: boolean;
};
export type PolarProductCatalog = readonly PolarProductCatalogEntry[];

const POLAR_API_TIMEOUT_MS = 10_000;
const POLAR_PRODUCT_CATALOG = {
  sandbox: [],
  production: [],
} satisfies Record<PolarServer, PolarProductCatalog>;

const polarProductOwnerTypes = ["organization", "user"] satisfies readonly PolarProductOwnerType[];
const polarProductPlans = ["free", "pro"] satisfies readonly PolarProductPlan[];

function readConfiguredValue(value: string | undefined): string | null {
  const configured = value?.trim();
  return configured ? configured : null;
}

export function resolvePolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production" ? "production" : "sandbox";
}

export function readPolarProductCatalogFromEntries(
  entries: PolarProductCatalog,
): PolarProductCatalog | null {
  const productIds = new Set<string>();
  const productVersions = new Set<string>();
  for (const entry of entries) {
    if (!entry.productId || entry.productId.trim() !== entry.productId) {
      throw new Error("Polar billing product IDs must be non-empty and normalized.");
    }
    if (!Number.isSafeInteger(entry.version) || entry.version < 1) {
      throw new Error("Polar billing product versions must be positive integers.");
    }
    if (productIds.has(entry.productId)) {
      throw new Error("Polar billing product IDs must be unique within one server.");
    }
    productIds.add(entry.productId);

    const productVersion = `${entry.ownerType}:${entry.plan}:${entry.version}`;
    if (productVersions.has(productVersion)) {
      throw new Error("Polar billing product versions must be unique within one product line.");
    }
    productVersions.add(productVersion);
  }

  let checkoutProductMissing = false;
  for (const ownerType of polarProductOwnerTypes) {
    for (const plan of polarProductPlans) {
      const currentProducts = entries.filter(
        (entry) =>
          entry.ownerType === ownerType && entry.plan === plan && entry.availableForCheckout,
      );
      if (currentProducts.length === 0) {
        checkoutProductMissing = true;
      }
      if (currentProducts.length > 1) {
        throw new Error(
          "Polar billing requires exactly one checkout product for each owner type and plan.",
        );
      }
    }
  }

  return checkoutProductMissing ? null : entries;
}

export function readPolarProductCatalog(): PolarProductCatalog | null {
  return readPolarProductCatalogFromEntries(POLAR_PRODUCT_CATALOG[resolvePolarServer()]);
}

export function readPolarCheckoutProductId(
  catalog: PolarProductCatalog,
  ownerType: PolarProductOwnerType,
  plan: PolarProductPlan,
): string {
  const products = catalog.filter(
    (entry) => entry.ownerType === ownerType && entry.plan === plan && entry.availableForCheckout,
  );
  if (products.length !== 1) {
    throw new Error(
      "Polar billing requires exactly one checkout product for each owner type and plan.",
    );
  }
  return products[0].productId;
}

export function resolvePolarProduct(
  catalog: PolarProductCatalog,
  productId: string,
): PolarProductCatalogEntry | null {
  return catalog.find((entry) => entry.productId === productId) ?? null;
}

export function createPolarClient(timeoutMs = POLAR_API_TIMEOUT_MS): Polar {
  const accessToken = readConfiguredValue(env.POLAR_ACCESS_TOKEN);
  if (!accessToken) {
    throw new Error("Polar billing is not configured.");
  }

  return new Polar({
    accessToken,
    server: resolvePolarServer(),
    timeoutMs,
  });
}
