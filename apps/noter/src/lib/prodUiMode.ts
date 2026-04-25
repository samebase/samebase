import {
  buildPathWithUpdatedQuery,
  hasQueryParam,
  setQueryParam,
} from "./queryParams";
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

  const value = search[FORCE_PROD_UI_QUERY_PARAM];
  return value === true || value === "" || value === "true";
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
  return (
    (args.productionPublicOrigin ||
      isProductionDeploymentProfile(args.deploymentProfile)) &&
    hasQueryParam(args.search, FORCE_PROD_UI_QUERY_PARAM)
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
  return buildPathWithUpdatedQuery(args, (searchParams) => {
    setQueryParam(searchParams, FORCE_PROD_UI_QUERY_PARAM, false);
  });
}
