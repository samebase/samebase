import {
  useOrganizationContext,
  type AppOrganizationSurface,
  type ViewerOrganization,
} from "@/organization/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { personalOrganizationsFirst } from "@/organization/organizationOrder";
import { buildOrganizationSwitchHref } from "@/organization/organizationSwitchRoute";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

function readContextLabel(
  surface: AppOrganizationSurface,
  organizations: readonly ViewerOrganization[],
): string | null {
  if (surface.kind === "allRepositories" || surface.kind === "organizations") {
    if (organizations.length === 1) {
      return organizations[0].githubOwnerLogin;
    }
    return surface.kind === "allRepositories" ? "No organization selected" : null;
  }
  if (surface.kind === "organization") {
    return surface.owner;
  }
  return null;
}

export function OrganizationContextControl() {
  const { organizations, surface } = useOrganizationContext();
  const navigate = useNavigate();
  const location = useLocation();
  const orderedOrganizations = personalOrganizationsFirst(organizations ?? []);
  const displayedLabel = readContextLabel(surface, orderedOrganizations);
  if (displayedLabel === null) {
    return null;
  }
  if (orderedOrganizations.length <= 1) {
    return orderedOrganizations.length === 1 || surface.kind === "organization" ? (
      <div
        className="repository-dashboard-sidebar-inset min-w-0 border-b border-border/50 py-3"
        data-testid="organization-context-control"
      >
        <span
          className="block h-8 w-full min-w-0 truncate text-sm font-medium leading-8"
          title={displayedLabel}
        >
          {displayedLabel}
        </span>
      </div>
    ) : null;
  }

  const navigateToOrganization = (owner: string) => {
    const section =
      surface.kind === "organization" && surface.source === "organization"
        ? surface.section
        : "repositories";
    void navigate({
      href: buildOrganizationSwitchHref({
        hash: location.hash,
        search: location.search,
        target: { kind: "organization", owner, section },
      }),
    });
  };

  return (
    <div
      className="repository-dashboard-sidebar-inset min-w-0 border-b border-border/50 py-3"
      data-testid="organization-context-control"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            aria-label={`Switch organization, current context ${displayedLabel}`}
            className="h-8 w-full min-w-0 justify-between gap-2 whitespace-normal px-0 text-left hover:bg-transparent"
            size="sm"
            type="button"
            variant="ghost"
          >
            <span className="min-w-0 flex-1 truncate text-left">{displayedLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {orderedOrganizations.map((organization) => (
            <DropdownMenuItem
              key={organization.organizationId}
              onSelect={() => navigateToOrganization(organization.githubOwnerLogin)}
            >
              {organization.githubOwnerLogin}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
