import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { useRootRouteSearch } from "@/routeSearch/root";

type OrganizationOption = (typeof api.organizations.listForViewer)["_returnType"][number];

export type OrganizationSelection =
  | {
      state: "loading";
      organizations: undefined;
    }
  | {
      state: "selected";
      organizationId: OrganizationOption["organizationId"];
      organizations: OrganizationOption[];
    }
  | {
      state: "selection_required" | "unavailable";
      organizations: OrganizationOption[];
    };

export function useOrganizationSelection(): OrganizationSelection {
  const organizations = useQuery(api.organizations.listForViewer);
  const search = useRootRouteSearch();
  if (organizations === undefined) {
    return { state: "loading", organizations };
  }

  if (organizations.length === 1) {
    return {
      state: "selected",
      organizationId: organizations[0].organizationId,
      organizations,
    };
  }

  if (search.organization !== undefined) {
    const selectedOrganization = organizations.find(
      ({ organizationId }) => organizationId === search.organization,
    );
    if (selectedOrganization === undefined) {
      return { state: "unavailable", organizations };
    }
    return {
      state: "selected",
      organizationId: selectedOrganization.organizationId,
      organizations,
    };
  }

  return { state: "selection_required", organizations };
}
