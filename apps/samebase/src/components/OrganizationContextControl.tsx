import { useOrganizationContext, type AppOrganizationSurface } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONNECT_ORGANIZATION_ROUTE } from "@/lib/connectOrganizationRoute";
import { buildOrganizationSwitchHref } from "@/lib/organizationSwitchRoute";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

function readContextLabel(surface: AppOrganizationSurface): string | null {
  if (surface.kind === "allVaults") {
    return "All vaults";
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
  const displayedLabel = readContextLabel(surface);
  if (displayedLabel === null) {
    return null;
  }

  const hasOrganizations = (organizations?.length ?? 0) > 0;
  const navigateToConnection = () => {
    void navigate({ to: CONNECT_ORGANIZATION_ROUTE });
  };
  if (!hasOrganizations) {
    return (
      <div
        className="vault-dashboard-sidebar-inset flex min-w-0 flex-col items-start gap-3 border-b border-border/50 py-3"
        data-testid="organization-context-control"
      >
        <span className="block w-full min-w-0 truncate text-sm font-medium" title={displayedLabel}>
          {displayedLabel}
        </span>
        {surface.kind === "allVaults" && organizations !== undefined ? (
          <Button
            className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left text-base font-normal underline underline-offset-4 hover:bg-transparent"
            onClick={navigateToConnection}
            size="sm"
            type="button"
            variant="ghost"
          >
            Connect organization
          </Button>
        ) : null}
      </div>
    );
  }

  const navigateToAllVaults = () => {
    void navigate({
      href: buildOrganizationSwitchHref({
        hash: location.hash,
        search: location.search,
        target: { kind: "allVaults" },
      }),
    });
  };
  const navigateToOrganization = (owner: string) => {
    const section =
      surface.kind === "organization" && surface.source === "organization"
        ? surface.section
        : "vaults";
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
      className="vault-dashboard-sidebar-inset min-w-0 border-b border-border/50 py-3"
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
          <DropdownMenuItem onSelect={navigateToAllVaults}>All vaults</DropdownMenuItem>
          {organizations?.map((organization) => (
            <DropdownMenuItem
              key={organization.organizationId}
              onSelect={() => navigateToOrganization(organization.githubOwnerLogin)}
            >
              {organization.githubOwnerLogin}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={navigateToConnection}>Connect organization</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
