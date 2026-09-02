import {
  buildOrganizationRoutePath,
  type OrganizationRouteSection,
} from "@/lib/organizationRoutes";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  CHECKOUT_QUERY_PARAM,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
} from "@/routeSearch/organizationBilling";
import { applySearchPatch } from "@/routing/searchFlags";

type OrganizationSwitchTarget =
  | { kind: "allRepositories" }
  | {
      kind: "organization";
      owner: string;
      section: OrganizationRouteSection;
    };

export function buildOrganizationSwitchHref(args: {
  hash: string;
  search: Record<string, unknown>;
  target: OrganizationSwitchTarget;
}): string {
  return buildPathWithTanStackSearch({
    hash: args.hash,
    pathname:
      args.target.kind === "allRepositories"
        ? DASHBOARD_ROUTE
        : buildOrganizationRoutePath({
            owner: args.target.owner,
            section: args.target.section,
          }),
    search: applySearchPatch(args.search, {
      [CHECKOUT_QUERY_PARAM]: null,
      [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
    }),
  });
}
