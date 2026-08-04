import { useLocation, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganizationSelection } from "@/hooks/useOrganizationSelection";
import { useRootRouteSearch } from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";

function getOrganizationSwitchPathname(pathname: string): string {
  return pathname !== "/vault" && pathname.startsWith("/vault/") ? "/vault" : pathname;
}

export function OrganizationSelector() {
  const router = useRouter();
  const location = useLocation();
  const selection = useOrganizationSelection();
  const search = useRootRouteSearch();
  const soleOrganizationId =
    selection.organizations?.length === 1 ? selection.organizations[0].organizationId : undefined;
  const selectedOrganization =
    selection.state === "selected"
      ? selection.organizations.find(
          ({ organizationId }) => organizationId === selection.organizationId,
        )
      : undefined;

  // Memberships load after the route. Replace a stale account's organization
  // parameter once the sole valid organization is known.
  useEffect(() => {
    if (soleOrganizationId === undefined || search.organization === soleOrganizationId) {
      return;
    }
    const pathname = getOrganizationSwitchPathname(location.pathname);
    void router.navigate({
      href: buildPathWithTanStackSearch({
        pathname,
        search: applySearchPatch(search, {
          organization: soleOrganizationId,
        }),
        hash: pathname === location.pathname ? location.hash : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [location.hash, location.pathname, router, search, soleOrganizationId]);

  if (selection.organizations === undefined || selection.organizations.length < 2) {
    return null;
  }

  return (
    <div className="vault-dashboard-sidebar-inset border-b border-border/50 py-3">
      <Select
        value={selection.state === "selected" ? selection.organizationId : null}
        onValueChange={(organization) => {
          const pathname = getOrganizationSwitchPathname(location.pathname);
          void router.navigate({
            href: buildPathWithTanStackSearch({
              pathname,
              search: applySearchPatch(search, {
                organization,
              }),
              hash: pathname === location.pathname ? location.hash : undefined,
            }),
            resetScroll: false,
          });
        }}
      >
        <SelectTrigger aria-label="Organization" className="w-full">
          <SelectValue placeholder="Organization">{selectedOrganization?.label}</SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          {selection.organizations.map((organization) => (
            <AppSelectItem key={organization.organizationId} value={organization.organizationId}>
              {organization.label}
            </AppSelectItem>
          ))}
        </AppSelectContent>
      </Select>
    </div>
  );
}
