import { entries } from "@noter-md/dependent/object";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "../src/routeAccessMetadata";

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

function isProductionAvailable(availableOn: readonly string[] | undefined): boolean {
  return availableOn === undefined || availableOn.includes("production");
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
  return entries(NOTER_ROUTE_ACCESS_METADATA_BY_PATH)
    .filter(
      ([routePath, routeAccessMetadata]) =>
        routeAccessMetadata.permission === "public" &&
        isConcreteRoutePath(routePath) &&
        isProductionAvailable(routeAccessMetadata.availableOn),
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
