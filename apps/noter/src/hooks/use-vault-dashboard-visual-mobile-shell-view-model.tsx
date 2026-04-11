import { Button } from "@/components/ui/button";
import {
  VaultDashboardHeaderBar,
  VaultDashboardProvidersSection,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardSidebarAccountHeader,
  type VaultDashboardProviderRowViewModel,
} from "@/components/VaultDashboardChrome";
import type { VaultDashboardWorkspaceSceneViewModel } from "@/components/workspace-layout/VaultDashboardWorkspaceScene";
import { cn } from "@/lib/utils";
import { GitHubLogoIcon, PersonIcon } from "@radix-ui/react-icons";

function renderCloudflareProviderLogo(className?: string) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 64 32"
        className="h-4 w-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="#FAAE40"
          d="M14.2 25.3a4.8 4.8 0 0 1 4.8-4.8c.4 0 .8 0 1.2.1a7.4 7.4 0 0 1 7.1-5.4c3 0 5.8 1.8 7 4.5.4-.1.9-.2 1.4-.2 2.2 0 4.1 1.6 4.5 3.8H14.2Z"
        />
        <path
          fill="#F38020"
          d="M9.2 25.3a7 7 0 0 1 7-7c.6 0 1.3.1 1.9.2A11.6 11.6 0 0 1 29.2 9c5.2 0 9.8 3.2 11.7 8a7.5 7.5 0 0 1 1.3-.1c3.8 0 7 2.9 7.4 6.6l.1 1.8H9.2v-.1Z"
        />
        <path
          fill="#F38020"
          d="M43.5 22.7a5.3 5.3 0 0 1 5.2-4.6c2.8 0 5.1 2.1 5.4 4.8l.2 2.4h-10l-.8-2.6Z"
        />
      </svg>
    </span>
  );
}

/**
 * Provides a static mobile dashboard shell that keeps the real layout chrome
 * while removing live data and chat persistence from the fixture.
 */
export function useVaultDashboardVisualMobileShellViewModel(): VaultDashboardWorkspaceSceneViewModel {
  const providerRows = [
    {
      key: "github",
      icon: <GitHubLogoIcon className="h-4 w-4" />,
      label: "GitHub",
      status: "Connected as GitHub user",
      actions: [
        {
          key: "disconnect",
          label: "Disconnect",
        },
      ],
    },
    {
      key: "cloudflare",
      icon: renderCloudflareProviderLogo("max-h-full max-w-full"),
      label: "Cloudflare",
      status: "Connected for previews",
      actions: [
        {
          key: "manage",
          label: "Manage",
        },
      ],
    },
    {
      key: "codex",
      icon: <div className="h-4 w-4 bg-foreground/80" />,
      label: "Codex",
      status: "Ready for repo-aware chat",
      actions: [
        {
          key: "open",
          label: "Open",
        },
      ],
    },
  ] satisfies readonly VaultDashboardProviderRowViewModel[];

  return {
    dataTestId: "vault-dashboard-visual-fixture",
    leftSidebarHeader: (
      <VaultDashboardSidebarAccountHeader>
        <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
          <span className="block min-w-0 truncate">nicu.chiciuc@noter.md</span>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-ui md:h-6 md:w-6"
          >
            <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="sr-only">Open user menu</span>
          </Button>
        </div>
      </VaultDashboardSidebarAccountHeader>
    ),
    leftSidebarContent: (
      <div className="flex min-h-0 flex-1 flex-col">
        <VaultDashboardProvidersSection
          open={true}
          onOpenChange={() => {}}
          providerRows={providerRows}
        />
      </div>
    ),
    rightSidebarHeader: null,
    rightSidebarContent: <div className="min-h-0 flex-1 bg-background" />,
    headerContent: <VaultDashboardHeaderBar />,
    // workspacePaneClassName: "bg-background",
    workspaceBody: (
      <VaultDashboardRepositoryList
        createControl={
          <div className="w-full corner-notch-1 border border-border bg-background px-3 py-2 text-sm font-medium">
            Create project
          </div>
        }
      >
        <VaultDashboardRepositoryCard
          isReady={true}
          repositoryOwner="noter-md"
          repositoryName="noter"
          titleHref="#"
          titleClassName="hover:underline"
          repositoryStatus={<span>Updated 12s ago</span>}
          branchSection={
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                Branches
              </p>
              <div className="text-xs text-muted-foreground">main ready</div>
            </div>
          }
        />
        <VaultDashboardRepositoryCard
          isReady={true}
          repositoryOwner="personal"
          repositoryName="notes"
          titleHref="#"
          titleClassName="hover:underline"
          repositoryStatus={<span>Updated 3m ago</span>}
          branchSection={
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                Branches
              </p>
              <div className="text-xs text-muted-foreground">
                codex/mobile-sidebar-drag needs review
              </div>
            </div>
          }
        />
      </VaultDashboardRepositoryList>
    ),

    // TODO: add chat fab back in
    // overlayContent: renderChatFab(),
  };
}
