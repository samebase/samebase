import { buildPathWithTanStackSearch, parseTanStackSearch } from "./tanstackSearchParams";
import { applySearchPatch } from "@/routing/searchFlags";
import { type DeploymentProfile } from "../../convex/deploymentProfile";

export const FORCE_PROD_UI_QUERY_PARAM = "prod-ui";
export const PRODUCTION_PUBLIC_HOSTNAME = "samebase.com";
const PRODUCTION_PUBLIC_HOSTNAMES = [PRODUCTION_PUBLIC_HOSTNAME, "www.samebase.com"] as const;

export function isProdUiModeEnabled(search: Readonly<Record<string, unknown>>): boolean {
  const value = search[FORCE_PROD_UI_QUERY_PARAM];
  return (
    Object.prototype.hasOwnProperty.call(search, FORCE_PROD_UI_QUERY_PARAM) &&
    value !== null &&
    typeof value !== "undefined"
  );
}

export function isProductionPublicHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  return PRODUCTION_PUBLIC_HOSTNAMES.some(
    (productionHostname) => productionHostname === normalizedHostname,
  );
}

export function isBrowserProductionPublicOrigin(): boolean {
  return typeof window !== "undefined" && isProductionPublicHostname(window.location.hostname);
}

export function isProductionDeploymentProfile(
  deploymentProfile: DeploymentProfile | undefined,
): boolean {
  return deploymentProfile?.kind === "production";
}

export function isProdUiModeActive(args: {
  deploymentProfile: DeploymentProfile | undefined;
  productionPublicOrigin: boolean;
  search: Readonly<Record<string, unknown>>;
}): boolean {
  return (
    args.productionPublicOrigin ||
    isProductionDeploymentProfile(args.deploymentProfile) ||
    isProdUiModeEnabled(args.search)
  );
}

export function shouldStripVisibleProdUiQuery(args: {
  deploymentProfile: DeploymentProfile | undefined;
  productionPublicOrigin: boolean;
  search: string | URLSearchParams | undefined;
}): boolean {
  const searchParams = new URLSearchParams(args.search);
  return (
    (args.productionPublicOrigin || isProductionDeploymentProfile(args.deploymentProfile)) &&
    searchParams.has(FORCE_PROD_UI_QUERY_PARAM)
  );
}

/**
 * The force flag is for preview/local comparison links. Real production already
 * owns the prod UI surface, so the flag must not remain in the address bar.
 */
export function buildPathWithoutProdUiQuery(args: {
  pathname: string;
  search: string | URLSearchParams | undefined;
  hash?: string;
}): string {
  const search =
    args.search instanceof URLSearchParams
      ? Object.fromEntries(args.search.entries())
      : parseTanStackSearch(args.search ?? "");

  return buildPathWithTanStackSearch({
    pathname: args.pathname,
    search: applySearchPatch(search, { [FORCE_PROD_UI_QUERY_PARAM]: null }),
    hash: args.hash,
  });
}
