import { Polar } from "@polar-sh/sdk";

import { env } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";

export type PolarServer = "sandbox" | "production";
export type PolarProductOwnerType = "organization" | "user";
export type PolarProductPlan = "free" | "pro";
export type PolarProductCatalog = {
  organization: Record<PolarProductPlan, string>;
  user: Record<PolarProductPlan, string>;
};

const POLAR_API_TIMEOUT_MS = 10_000;

function readConfiguredValue(value: string | undefined): string | null {
  const configured = value?.trim();
  return configured ? configured : null;
}

export function resolvePolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production" ? "production" : "sandbox";
}

export function readPolarProductCatalog(): PolarProductCatalog | null {
  const organizationFree = readConfiguredValue(
    env.POLAR_GITHUB_ORGANIZATION_FREE_MONTHLY_PRODUCT_ID,
  );
  const organizationPro = readConfiguredValue(env.POLAR_GITHUB_ORGANIZATION_PRO_MONTHLY_PRODUCT_ID);
  const userFree = readConfiguredValue(env.POLAR_GITHUB_USER_FREE_MONTHLY_PRODUCT_ID);
  const userPro = readConfiguredValue(env.POLAR_GITHUB_USER_PRO_MONTHLY_PRODUCT_ID);
  if (!organizationFree || !organizationPro || !userFree || !userPro) {
    return null;
  }

  const productIds = new Set([organizationFree, organizationPro, userFree, userPro]);
  if (productIds.size !== 4) {
    throw new Error("Polar billing product IDs must be unique.");
  }

  return {
    organization: { free: organizationFree, pro: organizationPro },
    user: { free: userFree, pro: userPro },
  };
}

export function resolvePolarProduct(
  catalog: PolarProductCatalog,
  productId: string,
): { ownerType: PolarProductOwnerType; plan: PolarProductPlan } | null {
  if (productId === catalog.organization.free) {
    return { ownerType: "organization", plan: "free" };
  }
  if (productId === catalog.organization.pro) {
    return { ownerType: "organization", plan: "pro" };
  }
  if (productId === catalog.user.free) {
    return { ownerType: "user", plan: "free" };
  }
  if (productId === catalog.user.pro) {
    return { ownerType: "user", plan: "pro" };
  }

  return null;
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
