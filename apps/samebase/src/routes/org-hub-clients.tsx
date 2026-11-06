import { createFileRoute } from "@tanstack/react-router";
import { OrganizationHubClientsPage } from "@/organization/hubClients/OrganizationHubClientsPage";
import { AuthenticatedOrganizationRoutePage } from "@/organization/OrganizationRouteBoundary";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  ORGANIZATION_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  validateOrganizationHubClientsRouteSearch,
} from "@/routeSearch/hubClients";
import { applySearchPatch } from "@/routing/searchFlags";

export const Route = createFileRoute("/_authed/org/$owner/hub-clients")({
  component: OrganizationHubClientsRoutePage,
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH["/org/$owner/hub-clients"],
    ...ORGANIZATION_HUB_CLIENTS_ROUTE_SEARCH_STATIC_DATA,
  },
  validateSearch: validateOrganizationHubClientsRouteSearch,
});

function OrganizationHubClientsRoutePage() {
  const { owner } = Route.useParams();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <AuthenticatedOrganizationRoutePage owner={owner}>
      {(organization) => (
        <OrganizationHubClientsPage
          organization={organization}
          search={search}
          // One owner's page has no owner filter and no owner grouping, which the table does not offer.
          onSearchChange={({ owner: _owner, group, ...patch }) => {
            void navigate({
              replace: true,
              resetScroll: false,
              search: (current) =>
                applySearchPatch(current, {
                  ...patch,
                  ...(group === undefined ? {} : { group: group === "owner" ? null : group }),
                }),
              to: ".",
            });
          }}
        />
      )}
    </AuthenticatedOrganizationRoutePage>
  );
}
