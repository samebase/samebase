import { entries } from "@samebase/dependent/object";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "../src/routeAccessMetadata";

type PrerenderPage = {
  path: string;
  prerender: {
    enabled: true;
    outputPath?: string;
  };
};

function isConcreteRoutePath(routePath: string): boolean {
  return !routePath.includes("$");
}

function isProductionAvailable(availableEnvironments: readonly string[] | undefined): boolean {
  return availableEnvironments === undefined || availableEnvironments.includes("production");
}

function isPrerenderEnabled(prerender: false | undefined): boolean {
  return prerender !== false;
}

function compareRoutePaths(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  if (left === "/") {
    return -1;
  }
  if (right === "/") {
    return 1;
  }

  return left.localeCompare(right);
}

export function readPublicPrerenderPages() {
  // Keep Vite config on metadata-only imports. Importing the router here pulls
  // route components before app aliases are active during config loading.
  return entries(ROUTE_ACCESS_METADATA_BY_PATH)
    .filter(
      ([routePath, routeAccessMetadata]) =>
        routeAccessMetadata.access === "access_public" &&
        isPrerenderEnabled(routeAccessMetadata.prerender) &&
        isConcreteRoutePath(routePath) &&
        isProductionAvailable(routeAccessMetadata.availableEnvironments),
    )
    .map(([routePath]) => routePath)
    .sort(compareRoutePaths)
    .map((routePath) => ({
      path: routePath,
      prerender: {
        enabled: true,
        ...(routePath === "/" ? { outputPath: "/_landing.html" } : {}),
      },
    })) satisfies PrerenderPage[];
}
