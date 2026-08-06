import {
  findViewerOrganization,
  useOrganizationContext,
  type AppOrganizationSurface,
} from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import { getCurrentRootRelativeUrl, openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { buildOrganizationSwitchHref } from "@/lib/organizationSwitchRoute";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

function readContextLabel(surface: AppOrganizationSurface): string | null {
  if (surface.kind === "allVaults") {
    return "All vaults";
  }
  if (surface.kind === "organization") {
    return surface.owner;
  }
  return null;
}

function readDisplayedContextLabel(
  surface: AppOrganizationSurface,
  organizations: ReturnType<typeof useOrganizationContext>["organizations"],
): string | null {
  const label = readContextLabel(surface);
  if (label === null) {
    return null;
  }

  const selectedOrganization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : surface.kind === "allVaults" && organizations?.length === 1
        ? organizations[0]
        : null;
  return selectedOrganization?.githubOwnerLogin ?? label;
}

export function OrganizationContextControl() {
  const { organizations, surface } = useOrganizationContext();
  const navigate = useNavigate();
  const location = useLocation();
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const displayedLabel = readDisplayedContextLabel(surface, organizations);
  if (displayedLabel === null) {
    return null;
  }

  const canSwitchOrganizations = (organizations?.length ?? 0) > 1;
  const installGitHubApp = () => {
    if (isInstalling) {
      return;
    }
    setIsInstalling(true);
    void openGitHubAppSetupPopup(async () => {
      return await getGitHubAppInstallationUrl({ returnToPath: getCurrentRootRelativeUrl() });
    })
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Could not open GitHub App setup.",
          title: "Could not install GitHub App",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsInstalling(false);
      });
  };
  if (!canSwitchOrganizations) {
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
            disabled={isInstalling}
            onClick={installGitHubApp}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
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
          <DropdownMenuItem disabled={isInstalling} onSelect={installGitHubApp}>
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
