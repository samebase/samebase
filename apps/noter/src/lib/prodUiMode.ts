import {
  buildPathWithTanStackSearch,
  parseTanStackSearch,
} from "./tanstackSearchParams";
import { hasRouteSearchPresenceFlag } from "@/lib/routeSearchFlags";
import { type DeploymentProfile } from "../../convex/deploymentProfile";

export const FORCE_PROD_UI_QUERY_PARAM = "prod-ui";
const QUERY_PARAM_LINK_LABEL_PREFIX = "?";
export const FORCE_PROD_UI_MODE_LINK_LABEL = `${QUERY_PARAM_LINK_LABEL_PREFIX}${FORCE_PROD_UI_QUERY_PARAM}`;
const PRODUCTION_PUBLIC_HOSTNAMES = ["noter.md", "www.noter.md"] as const;

type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

export function isProdUiModeEnabled(search: SearchFlagReader): boolean {
  if (search instanceof URLSearchParams) {
    return search.has(FORCE_PROD_UI_QUERY_PARAM);
  }

  return hasRouteSearchPresenceFlag(search, FORCE_PROD_UI_QUERY_PARAM);
}

export function isProductionPublicHostname(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();
  return PRODUCTION_PUBLIC_HOSTNAMES.some(
    (productionHostname) => productionHostname === normalizedHostname,
  );
}

export function isBrowserProductionPublicOrigin(): boolean {
  return (
    typeof window !== "undefined" &&
    isProductionPublicHostname(window.location.hostname)
  );
}

export function isProductionDeploymentProfile(
  deploymentProfile: DeploymentProfile | undefined,
): boolean {
  return deploymentProfile?.kind === "production";
}

export function isProdUiModeActive(args: {
  deploymentProfile: DeploymentProfile | undefined;
  productionPublicOrigin: boolean;
  search: SearchFlagReader;
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
    (args.productionPublicOrigin ||
      isProductionDeploymentProfile(args.deploymentProfile)) &&
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
    search: {
      ...search,
      [FORCE_PROD_UI_QUERY_PARAM]: undefined,
    },
    hash: args.hash,
  });
}
