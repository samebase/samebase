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
  if (surface.kind === "account") {
    return "Account";
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
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const label = readContextLabel(surface);
  if (label === null) {
    return null;
  }

  const selectedOrganization =
    surface.kind === "organization" && organizations
      ? findViewerOrganization(organizations, surface.owner)
      : null;
  const displayedLabel = selectedOrganization?.githubOwnerLogin ?? label;
  const canSwitchOrganizations = surface.kind !== "account" && (organizations?.length ?? 0) > 1;
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
      <div className="flex h-full min-w-0 items-center">
        <span className="block max-w-48 shrink-0 truncate px-2 text-sm font-medium">
          {displayedLabel}
        </span>
        {surface.kind === "allVaults" && organizations !== undefined ? (
          <Button
            className="h-8 shrink-0 rounded-none px-2"
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          aria-label="Switch organization"
          className="h-8 max-w-48 shrink-0 rounded-none px-2"
          size="sm"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{displayedLabel}</span>
          <ChevronDown className="h-3.5 w-3.5" />
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
  );
}
