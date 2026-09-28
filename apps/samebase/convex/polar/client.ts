import { Polar } from "@polar-sh/sdk";
import { HTTPClient } from "@polar-sh/sdk/lib/http";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";

import { env } from "../_generated/server";
import { resolveDeploymentProfile } from "../deploymentProfile";

export type PolarServer = "sandbox" | "production";
export type PolarProductCatalogEntry = {
  readonly productId: string;
  readonly version: number;
  readonly availableForCheckout: boolean;
};
export type PolarProductCatalog = readonly PolarProductCatalogEntry[];

const POLAR_API_TIMEOUT_MS = 10_000;
export const POLAR_PRODUCT_CATALOG = {
  sandbox: [
    {
      productId: "0e721c02-c98b-425b-bc8d-fb323fa54925",
      version: 1,
      availableForCheckout: true,
    },
  ],
  production: [
    {
      productId: "e2d0db25-2971-4a77-b2b1-00b041efe9e0",
      version: 1,
      availableForCheckout: true,
    },
  ],
} satisfies Record<PolarServer, PolarProductCatalog>;

function readConfiguredValue(value: string | undefined): string | null {
  const configured = value?.trim();
  return configured ? configured : null;
}

export function readPolarErrorLogFields(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorStatusCode: error instanceof PolarError ? error.statusCode : null,
  };
}

export function resolvePolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production" ? "production" : "sandbox";
}

export function readPolarProductCatalogFromEntries(
  entries: PolarProductCatalog,
): PolarProductCatalog | null {
  const productIds = new Set<string>();
  const productVersions = new Set<number>();
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

    if (productVersions.has(entry.version)) {
      throw new Error("Polar billing product versions must be unique within one server.");
    }
    productVersions.add(entry.version);
  }

  const checkoutProducts = entries.filter((entry) => entry.availableForCheckout);
  if (checkoutProducts.length > 1) {
    throw new Error("Polar billing requires exactly one checkout product per server.");
  }

  return entries.length === 0 ? null : entries;
}

export function readPolarProductCatalog(): PolarProductCatalog | null {
  return readPolarProductCatalogFromEntries(POLAR_PRODUCT_CATALOG[resolvePolarServer()]);
}

export function readPolarCheckoutProductId(catalog: PolarProductCatalog): string {
  const products = catalog.filter((entry) => entry.availableForCheckout);
  if (products.length !== 1) {
    throw new Error("Polar billing requires exactly one checkout product per server.");
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

  const httpClient = new HTTPClient();
  httpClient.addHook("beforeRequest", (request) => {
    request.headers.set("Polar-Version", "2026-04");
  });

  return new Polar({
    accessToken,
    httpClient,
    server: resolvePolarServer(),
    timeoutMs,
  });
}
