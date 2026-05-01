import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/input";
import { VaultLastUpdatedStatus } from "@/components/vault-dashboard/VaultLastUpdatedStatus";
import {
  ChevronDownIcon,
  TrashIcon,
  UpdateIcon,
} from "@/lib/radixIcons";
import { GitBranch, GitCommitHorizontal, Loader2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { AnchoredPopoverContent, Popover } from "@/components/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/sheet";
import { linkStyle } from "../styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgo,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import {
  hasCurrentCloudflareBuildFailureLogs,
  getCloudflareBranchPreviewHydrationTargets,
  hasCurrentCloudflareBranchPreview,
} from "@/lib/cloudflarePreviewLinks";
import {
  getTreeRefreshUiState,
  shouldAutoRefreshVault,
} from "@/lib/treeRefreshStatus";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../../shared/cloudflareTokenRefresh";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/treeRefreshDebounce";
import { useNow } from "@/hooks/useNow";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
} from "react";
import { isInIframe, useNoterAuthActions } from "@/authClient";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { CodespaceStatus } from "@/components/CodespaceStatus";
import { DaytonaSnapshotBanner } from "@/components/DaytonaSnapshotBanner";
import { DaytonaWorkspaceButton } from "@/components/DaytonaWorkspaceButton";
import { DaytonaSnapshotList } from "@/components/DaytonaSnapshotList";
import { VaultBranchFiltersControl } from "@/components/vault-dashboard/VaultBranchFilters";
import { CodexProviderRow } from "@/components/CodexProviderRow";
import { EditedFilesCategoriesPopover } from "@/components/EditedFilesCategories";
import { EditorChatPanel } from "@/components/EditorChatPanel";
import {
  VaultDashboardAccountSection,
  VaultDashboardEmptyState,
  VaultDashboardProvidersSection,
  VaultDashboardRepositoryCard,
  VaultDashboardRepositoryList,
  VaultDashboardSidebarContent,
  type VaultDashboardProviderRowViewModel,
} from "@/components/vault-dashboard/VaultDashboardChrome";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import {
  useApiKeyConnectDialog,
  type ApiKeyProvider,
} from "@/components/ApiKeyConnectDialog";
import { DAYTONA_PAUSED } from "../../../shared/daytonaPause";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  buildVaultCodespaceChatRoute,
  buildVaultFileRoute,
} from "@/lib/vaultRoutes";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { type AppThemeColorSearch } from "@/lib/appThemeColorSearch";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import {
  buildPullRequestLabelStyle,
  normalizePullRequestLabels,
} from "@/lib/pullRequestLabels";
import {
  areVaultBranchFiltersEqual,
  buildVaultBranchFilterOptions,
  filterVaultRemoteBranches,
  getDefaultVaultBranchFilters,
  normalizeVaultBranchFilters,
  type VaultBranchFilters as VaultBranchFiltersState,
} from "@/components/vault-dashboard/vaultDashboardBranchFilters";
import { toast } from "@/components/ui/use-toast";
import { PersistedSidebarProvider } from "@/components/PersistedSidebarProvider";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { WorkspaceLayoutV2FullPage } from "../workspace-layout-v2/WorkspaceLayoutV2";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { CHAT_ENABLED } from "@/lib/featureFlags";
import type { DaytonaSnapshotStatus } from "@/lib/daytonaSnapshot";
import type { WorkspaceSidebarState } from "../../../convex/workspaceSidebarStateModel";
import { useUsesTouchSheet } from "@/hooks/useUsesTouchSheet";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
  NoterLogoMark,
  PullRequestStateLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";

const DASHBOARD_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  rightDesktopOpen: true,
  rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;
const DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM = "dev";
const COLLAPSED_BRANCH_LIMIT = 5;

const formatInfraState = (
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Not started";
  if (infraState === "provisioning") return "Provisioning";
  if (infraState === "ready") return "Ready";
  if (infraState === "failed") return "Failed";
  return "Partial";
};

const formatMcpTokenStatusLabel = (
  status:
    | "valid"
    | "expiring_soon"
    | "expired"
    | "invalid"
    | "unknown"
    | undefined,
): string => {
  if (status === "valid") return "Valid";
  if (status === "expiring_soon") return "Expiring soon";
  if (status === "expired") return "Expired";
  if (status === "invalid") return "Invalid";
  return "Unknown";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getRedirectOrigin = (oauthUrl: string): string | null => {
  try {
    const url = new URL(oauthUrl);
    const redirect = url.searchParams.get("redirect_uri");
    if (!redirect) return null;
    return new URL(redirect).origin;
  } catch {
    return null;
  }
};

const getInfraActionLabel = (
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Provision infra";
  if (infraState === "failed" || infraState === "partial") return "Retry infra";
  return null;
};

type DaytonaResourceFlags = {
  daytonaSandboxId?: string | null;
  daytonaSnapshotName?: string | null;
  daytonaPrebuildLogsSnapshot?: string | null;
  daytonaCurrentSnapshotName?: string | null;
  daytonaCurrentSnapshotStatus?: DaytonaSnapshotStatus | null;
};

const hasDaytonaResourcesForVault = (
  vault: DaytonaResourceFlags | null | undefined,
) =>
  Boolean(
    vault?.daytonaSandboxId ||
    vault?.daytonaSnapshotName ||
    vault?.daytonaPrebuildLogsSnapshot ||
    vault?.daytonaCurrentSnapshotName,
  );

const DASHBOARD_REFRESH_CONCURRENCY = 3;
type RefreshTrigger = "visibility" | "page_load";
const PROVIDER_KEYS = ["github", "convex", "cloudflare"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  label: string;
  oauthButtonLabel: string;
  popupName: string;
  completionEventType: string;
  icon: ReactElement;
  apiKeyProvider: ApiKeyProvider | null;
};
type ProviderRuntimeConfig = {
  getOAuthUrl: () => Promise<string>;
  disconnect: () => Promise<unknown>;
  popupRef: MutableRefObject<Window | null>;
  popupOriginRef: MutableRefObject<string | null>;
};
type DashboardManualRefreshVault = {
  ghRepoName: string;
  ghRepoOwner: string;
  remoteBranches: Array<{
    name: string;
    remoteState: "active" | "deleted_upstream";
    cloudflareBranchPreviewUrl?: string;
    cloudflarePreviewPullRequestNumber?: number;
    cloudflarePreviewLogsUrl?: string;
    cloudflarePreviewStatus?: string;
    pullRequestNumber?: number;
  }>;
  repositoryFullName: string;
  state: string;
  treeRefreshCooldownUntil?: number;
};

type VaultDashboardVault = NonNullable<
  (typeof api.vault.getUserVaults)["_returnType"]
>[number];
type VaultDashboardLogoComponent = () => ReactNode;

type VaultDeleteIntent = {
  id: Id<"vaults">;
  repositoryFullName: string;
  isNoterManaged: boolean;
  hasConvexProvision: boolean;
  hasHostingProvision: boolean;
};

const dashboardLinkIconSlotClassName =
  "inline-flex h-4 w-5 shrink-0 items-center justify-center";

const DashboardLinkIconSlot = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span
    aria-hidden="true"
    className={clsx(dashboardLinkIconSlotClassName, className)}
  >
    {children}
  </span>
);

function VaultDashboardDeleteContent({
  isRemovingVault = false,
  onRemoveVault,
}: {
  isRemovingVault?: boolean;
  onRemoveVault: () => void;
}) {
  return (
    <div className="p-4">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full justify-start"
        disabled={isRemovingVault}
        onClick={onRemoveVault}
      >
        {isRemovingVault ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <TrashIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {isRemovingVault ? "Removing..." : "Remove vault"}
      </Button>
    </div>
  );
}

export function VaultDashboardDeleteControl({
  isOpen,
  isRemovingVault = false,
  onOpenChange,
  onRemoveVault,
  repositoryFullName,
}: {
  isOpen: boolean;
  isRemovingVault?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveVault: () => void;
  repositoryFullName: string;
}) {
  const usesTouchSheet = useUsesTouchSheet();
  const deleteTriggerDisabled = isRemovingVault;
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onOpenChange(false);
    }
  };
  const deleteTriggerAnchorRef = useRef<HTMLSpanElement | null>(null);
  const trigger = (
    <span ref={deleteTriggerAnchorRef} className="absolute right-4 top-4">
      <Link
        to="/"
        search={(currentSearch) => ({
          ...currentSearch,
          delete: repositoryFullName,
        })}
        aria-label={`Remove vault ${repositoryFullName}`}
        title="Remove vault"
        aria-disabled={deleteTriggerDisabled ? true : undefined}
        tabIndex={deleteTriggerDisabled ? -1 : undefined}
        onClick={(event) => {
          if (deleteTriggerDisabled) {
            event.preventDefault();
            return;
          }

          if (!isOpen) {
            return;
          }

          event.preventDefault();
          onOpenChange(false);
        }}
        className={clsx(
          buttonVariants({ variant: "destructive", size: "icon-sm" }),
          deleteTriggerDisabled && "pointer-events-none opacity-50",
        )}
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    </span>
  );

  if (usesTouchSheet) {
    return (
      <>
        {trigger}
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-hidden">
            <SheetTitle className="sr-only">Remove vault</SheetTitle>
            <VaultDashboardDeleteContent
              isRemovingVault={isRemovingVault}
              onRemoveVault={onRemoveVault}
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      {trigger}
      <AnchoredPopoverContent
        align="end"
        anchor={deleteTriggerAnchorRef}
        className="w-64 max-w-[calc(100vw-1rem)] p-0"
      >
        <VaultDashboardDeleteContent
          isRemovingVault={isRemovingVault}
          onRemoveVault={onRemoveVault}
        />
      </AnchoredPopoverContent>
    </Popover>
  );
}

const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  github: {
    label: "GitHub",
    oauthButtonLabel: "GitHub OAuth",
    popupName: "github-oauth",
    completionEventType: "github-oauth-complete",
    icon: <GitHubProviderLogo />,
    apiKeyProvider: "github",
  },
  convex: {
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
    completionEventType: "convex-oauth-complete",
    icon: <ConvexProviderLogo />,
    apiKeyProvider: "convex",
  },
  cloudflare: {
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare MCP OAuth",
    popupName: "cloudflare-mcp-oauth",
    completionEventType: "cloudflare-mcp-oauth-complete",
    icon: <CloudflareProviderLogo />,
    apiKeyProvider: null,
  },
};

interface StagedSummary {
  modified: number;
  deleted: number;
  new: number;
  renamed: number;
  renamedAndModified: number;
  total: number;
}

interface VaultRemoteBranchListItem {
  name: string;
  headCommitSha: string;
  isDefault: boolean;
  isProtected: boolean;
  remoteState: "active" | "deleted_upstream";
  lastSyncedAt: number;
  aheadBy?: number;
  behindBy?: number;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestLabels?: Array<string | { name: string; color?: string }>;
  pullRequestTitle?: string;
  pullRequestIsDraft?: boolean;
  cloudflareBranchPreviewUrl?: string;
  cloudflarePreviewPullRequestNumber?: number;
  cloudflarePreviewLogsUrl?: string;
  cloudflarePreviewStatus?: string;
  convexPreviewDeploymentDashboardUrl?: string;
}

interface VaultBranchLinkRowProps {
  vaultId?: Id<"vaults">;
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  productionDeploymentDashboardUrl?: string;
  stagedSummary?: StagedSummary;
}

function formatAheadBehindCounts(
  aheadBy: number | undefined,
  behindBy: number | undefined,
): string | null {
  if (typeof aheadBy !== "number" || typeof behindBy !== "number") {
    return null;
  }
  return `↑${aheadBy} ↓${behindBy}`;
}

type VaultDashboardRepositoryExternalLink = {
  href: string;
  key: "cloudflare" | "convexProjectSettings" | "github";
  label: string;
  title: string;
};

const REPOSITORY_EXTERNAL_LINK_ICONS: Record<
  VaultDashboardRepositoryExternalLink["key"],
  VaultDashboardLogoComponent
> = {
  cloudflare: CloudflareProviderLogo,
  convexProjectSettings: ConvexProviderLogo,
  github: GitHubProviderLogo,
};

function buildVaultDashboardRepositoryExternalLinks(args: {
  cloudflareProjectDashboardUrl?: string;
  convexProjectSettingsDashboardUrl?: string;
  githubRepositoryUrl: string;
}): VaultDashboardRepositoryExternalLink[] {
  const links: VaultDashboardRepositoryExternalLink[] = [
    {
      href: args.githubRepositoryUrl,
      key: "github",
      label: "GitHub",
      title: "Open GitHub repository",
    },
  ];

  if (typeof args.cloudflareProjectDashboardUrl === "string") {
    links.push({
      href: args.cloudflareProjectDashboardUrl,
      key: "cloudflare",
      label: "Cloudflare",
      title: "Open Cloudflare Pages project",
    });
  }

  if (typeof args.convexProjectSettingsDashboardUrl === "string") {
    links.push({
      href: args.convexProjectSettingsDashboardUrl,
      key: "convexProjectSettings",
      label: "Project settings",
      title: "Open Convex project settings",
    });
  }

  // buildVaultDashboardRepositoryExternalLinks always includes GitHub, but the
  // title already links there; render this row only for additional dashboards.
  return links.length > 1 ? links : [];
}

function buildVaultDashboardBranchEditRoute(args: {
  repositoryFullName: string;
  branchName: string;
}): string | null {
  const [owner, repoName, extraSegment] = args.repositoryFullName.split("/");

  if (
    !owner ||
    !repoName ||
    typeof extraSegment === "string" ||
    owner.length === 0 ||
    repoName.length === 0
  ) {
    return null;
  }

  return buildVaultFileRoute({
    owner,
    repoName,
    branch: args.branchName,
  });
}

export function VaultDashboardRepositoryExternalLinks({
  links,
  repositoryFullName,
}: {
  links: VaultDashboardRepositoryExternalLink[];
  repositoryFullName: string;
}) {
  if (links.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={`Repository links for ${repositoryFullName}`}
      className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-base leading-6 text-muted-foreground"
    >
      {links.map((link) => {
        const Icon = REPOSITORY_EXTERNAL_LINK_ICONS[link.key];

        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              "-mx-1.5 -my-1 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 py-1 touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title={link.title}
          >
            <DashboardLinkIconSlot>
              <Icon />
            </DashboardLinkIconSlot>
            <span>{link.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function VaultBranchLinkContent({
  repositoryFullName,
  branch,
  productionDeploymentDashboardUrl,
}: {
  repositoryFullName: string;
  branch: VaultRemoteBranchListItem;
  productionDeploymentDashboardUrl?: string;
}) {
  const commitUrl = `https://github.com/${repositoryFullName}/commit/${branch.headCommitSha}`;
  const branchGithubUrl = buildGitHubBranchTreeUrl({
    repositoryFullName,
    branchName: branch.name,
  });
  const aheadBehindLabel = formatAheadBehindCounts(
    branch.aheadBy,
    branch.behindBy,
  );
  const hasPullRequestTitle =
    typeof branch.pullRequestTitle === "string" &&
    branch.pullRequestTitle.length > 0;
  const normalizedPullRequestLabels = normalizePullRequestLabels(
    branch.pullRequestLabels,
  );
  const hasPullRequestLink =
    typeof branch.pullRequestUrl === "string" &&
    branch.pullRequestUrl.length > 0;
  const pullRequestLabel =
    typeof branch.pullRequestNumber === "number"
      ? `PR #${branch.pullRequestNumber}`
      : "Pull request";
  const hasConsolidatedPullRequestLink =
    hasPullRequestTitle && hasPullRequestLink;
  const hasStandalonePullRequestLink =
    hasPullRequestLink && !hasConsolidatedPullRequestLink;
  const hasPullRequestMetadata =
    hasStandalonePullRequestLink ||
    branch.pullRequestIsDraft === true ||
    normalizedPullRequestLabels.length > 0;
  const metadataLinkClassName = clsx(
    "-mx-2 -my-1 inline-flex min-h-9 items-center rounded-sm px-2 py-1 text-base leading-6 touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
    "font-mono",
    linkStyle,
  );
  const branchLabelClassName = clsx(
    "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base leading-6",
    hasPullRequestTitle
      ? "font-mono text-muted-foreground"
      : "text-muted-foreground",
    !hasPullRequestTitle && branch.isDefault && "font-medium text-foreground",
  );
  const branchEditRoute = buildVaultDashboardBranchEditRoute({
    repositoryFullName,
    branchName: branch.name,
  });
  const hasCurrentPreviewLink = hasCurrentCloudflareBranchPreview({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
    cloudflarePreviewPullRequestNumber:
      branch.cloudflarePreviewPullRequestNumber,
  });
  const hasBuildFailureLogsLink = hasCurrentCloudflareBuildFailureLogs({
    pullRequestNumber: branch.pullRequestNumber,
    cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
    cloudflarePreviewPullRequestNumber:
      branch.cloudflarePreviewPullRequestNumber,
    cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
  });
  const hasProductionDeploymentLink =
    branch.isDefault && typeof productionDeploymentDashboardUrl === "string";
  const hasPreviewDeploymentLink =
    !branch.isDefault &&
    hasCurrentPreviewLink &&
    typeof branch.convexPreviewDeploymentDashboardUrl === "string";

  return (
    <>
      {branch.remoteState === "deleted_upstream" ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 break-words text-base leading-6 text-muted-foreground/70 line-through">
            {branch.name}
          </span>
          <span className="shrink-0 corner-notch-1 border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            deleted upstream
          </span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 space-y-1.5">
          {hasPullRequestTitle ? (
            hasPullRequestLink ? (
              <a
                href={branch.pullRequestUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={clsx(
                  "-mx-1.5 -my-1 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-base font-medium leading-6 text-foreground touch-manipulation underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
                  linkStyle,
                )}
                title="Open pull request"
              >
                <DashboardLinkIconSlot className="mt-1">
                  <PullRequestStateLogo
                    isDraft={branch.pullRequestIsDraft === true}
                  />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </a>
            ) : (
              <div className="flex min-h-9 max-w-full items-start gap-1.5 text-base font-medium leading-6 text-foreground">
                <DashboardLinkIconSlot className="mt-1">
                  <PullRequestStateLogo
                    isDraft={branch.pullRequestIsDraft === true}
                  />
                </DashboardLinkIconSlot>
                <span className="min-w-0 break-words">
                  {pullRequestLabel} {branch.pullRequestTitle}
                </span>
              </div>
            )
          ) : null}
          <a
            href={branchGithubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              branchLabelClassName,
              "underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-current",
              linkStyle,
            )}
            title="Open branch on GitHub"
            aria-label={`Open ${branch.name} branch on GitHub`}
          >
            <DashboardLinkIconSlot className="mt-1">
              <GitBranch
                aria-hidden="true"
                className="h-4 w-4"
                strokeWidth={1.75}
              />
            </DashboardLinkIconSlot>
            <span className="min-w-0 break-words">{branch.name}</span>
          </a>
          <div className="space-y-1 text-base leading-6 text-muted-foreground/80">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <a
                href={commitUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={clsx(metadataLinkClassName, "gap-1.5")}
                title="View commit on GitHub"
              >
                <DashboardLinkIconSlot>
                  <GitCommitHorizontal
                    aria-hidden="true"
                    className="h-5 w-5"
                    strokeWidth={2}
                  />
                </DashboardLinkIconSlot>
                <span>Last commit {branch.headCommitSha.slice(0, 7)}</span>
              </a>
              {aheadBehindLabel ? (
                <span
                  className="font-mono tabular-nums"
                  title="Ahead/behind versus the default branch"
                >
                  {aheadBehindLabel}
                </span>
              ) : null}
            </div>
            {hasPullRequestMetadata ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {hasStandalonePullRequestLink ? (
                  <a
                    href={branch.pullRequestUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={clsx(metadataLinkClassName, "gap-1.5")}
                    title="Open pull request"
                  >
                    <DashboardLinkIconSlot>
                      <PullRequestStateLogo
                        isDraft={branch.pullRequestIsDraft === true}
                      />
                    </DashboardLinkIconSlot>
                    <span>{pullRequestLabel}</span>
                  </a>
                ) : null}
                {branch.pullRequestIsDraft ? (
                  <Badge
                    variant="outline"
                    className="h-6 px-1.5 py-0 text-xs font-medium uppercase tracking-wide"
                  >
                    draft
                  </Badge>
                ) : null}
                {normalizedPullRequestLabels.length > 0
                  ? normalizedPullRequestLabels.map((label) => (
                      <Badge
                        key={label.name}
                        variant="outline"
                        className="h-6 max-w-48 px-1.5 py-0 text-xs font-medium"
                        style={buildPullRequestLabelStyle(label.color)}
                        title={label.name}
                      >
                        <span className="truncate">{label.name}</span>
                      </Badge>
                    ))
                  : null}
              </div>
            ) : null}
            {hasBuildFailureLogsLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.cloudflarePreviewLogsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(
                    metadataLinkClassName,
                    "gap-1.5 text-destructive hover:text-destructive",
                  )}
                  title="Open Cloudflare build logs"
                >
                  <DashboardLinkIconSlot>
                    <CloudflareProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Build failed logs</span>
                </a>
              </div>
            ) : hasCurrentPreviewLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.cloudflareBranchPreviewUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open Cloudflare branch preview"
                >
                  <DashboardLinkIconSlot>
                    <CloudflareProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Cloudflare preview</span>
                </a>
              </div>
            ) : null}
            {branchEditRoute ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Link
                  to={branchEditRoute}
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open branch in Noter"
                >
                  <DashboardLinkIconSlot>
                    <NoterLogoMark />
                  </DashboardLinkIconSlot>
                  <span>Edit</span>
                </Link>
              </div>
            ) : null}
            {hasPreviewDeploymentLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={branch.convexPreviewDeploymentDashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open Convex preview deployment dashboard"
                >
                  <DashboardLinkIconSlot>
                    <ConvexProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Preview deploy</span>
                </a>
              </div>
            ) : null}
            {hasProductionDeploymentLink ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <a
                  href={productionDeploymentDashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx(metadataLinkClassName, "gap-1.5")}
                  title="Open production Convex deployment dashboard"
                >
                  <DashboardLinkIconSlot>
                    <ConvexProviderLogo />
                  </DashboardLinkIconSlot>
                  <span>Production deploy</span>
                </a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

export function VaultBranchLinkRow({
  vaultId,
  repositoryFullName,
  branch,
  productionDeploymentDashboardUrl,
  stagedSummary,
}: VaultBranchLinkRowProps) {
  const hasStagedChanges = (stagedSummary?.total ?? 0) > 0;
  // Preserve space for links by rendering actions only when staged files give
  // the row a real control.
  const showRowActions = Boolean(hasStagedChanges && vaultId);

  return (
    <div className="flex items-start gap-2 border-b border-border/40 px-2 py-3.5 last:border-b-0">
      <VaultBranchLinkContent
        repositoryFullName={repositoryFullName}
        branch={branch}
        productionDeploymentDashboardUrl={productionDeploymentDashboardUrl}
      />
      {showRowActions ? (
        <div className="flex shrink-0 items-start gap-2">
          {hasStagedChanges && vaultId ? (
            <div className="pt-0.5">
              <EditedFilesCategoriesPopover
                vaultId={vaultId}
                repositoryFullName={repositoryFullName}
                branch={branch.name}
                summaryCounts={stagedSummary}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface VaultBranchListProps {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  remoteBranches: VaultRemoteBranchListItem[];
  productionDeploymentDashboardUrl?: string;
  expansion?: VaultBranchListExpansionProps;
}

interface VaultBranchListExpansionProps {
  hiddenBranchCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  placement?: "header" | "list";
}

export function VaultBranchListExpansionControl({
  hiddenBranchCount,
  isExpanded,
  onToggle,
  placement = "list",
}: VaultBranchListExpansionProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={placement === "list" ? "w-full" : undefined}
      aria-expanded={isExpanded}
      onClick={onToggle}
    >
      <span>{isExpanded ? "Show less" : `Show ${hiddenBranchCount} more`}</span>
      <ChevronDownIcon
        className={isExpanded ? "rotate-180" : undefined}
        aria-hidden="true"
      />
    </Button>
  );

  if (placement === "header") {
    return button;
  }

  return <div className="px-3 py-1.5">{button}</div>;
}

function VaultBranchList({
  vaultId,
  repositoryFullName,
  remoteBranches,
  productionDeploymentDashboardUrl,
  expansion,
}: VaultBranchListProps) {
  const stagedSummaries =
    useQuery(api.fileStaging.listStagedFilesBranchSummaries, {
      vaultId,
    }) ?? [];
  const summaryByBranch = new Map(
    stagedSummaries.map((summary) => [summary.branch, summary.counts]),
  );

  return (
    // Let mobile branch rows align with the vault card edge instead of nesting
    // a second inset panel inside the already padded card.
    <div className="-mx-4 overflow-hidden border-y border-border/60 bg-muted/20 sm:mx-0 sm:corner-notch-1 sm:border">
      {remoteBranches.map((branch) => (
        <VaultBranchLinkRow
          key={branch.name}
          branch={branch}
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          stagedSummary={summaryByBranch.get(branch.name)}
          productionDeploymentDashboardUrl={
            branch.isDefault ? productionDeploymentDashboardUrl : undefined
          }
        />
      ))}
      {expansion ? <VaultBranchListExpansionControl {...expansion} /> : null}
    </div>
  );
}

function VaultBranchSection({
  vaultId,
  repositoryFullName,
  remoteBranches,
  productionDeploymentDashboardUrl,
  filters,
  onChangeFilters,
  showListExpansionControl = true,
}: {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  remoteBranches: VaultRemoteBranchListItem[];
  productionDeploymentDashboardUrl?: string;
  filters: VaultBranchFiltersState;
  onChangeFilters: (nextFilters: VaultBranchFiltersState) => void;
  showListExpansionControl?: boolean;
}) {
  const filteredRemoteBranches = filterVaultRemoteBranches(
    remoteBranches,
    filters,
  );
  const hasBranchListOverflow =
    filteredRemoteBranches.length > COLLAPSED_BRANCH_LIMIT;
  const branchesExpanded = filters.branchesExpanded;
  const visibleRemoteBranches =
    hasBranchListOverflow && !branchesExpanded
      ? filteredRemoteBranches.slice(0, COLLAPSED_BRANCH_LIMIT)
      : filteredRemoteBranches;
  const collapsedBranchCount =
    filteredRemoteBranches.length - COLLAPSED_BRANCH_LIMIT;
  const hiddenBranchCount =
    remoteBranches.length - filteredRemoteBranches.length;
  const filterOptions = buildVaultBranchFilterOptions({
    branches: remoteBranches,
    hiddenLabels: filters.hiddenLabels,
    includeNoLabel: filters.includeNoLabel,
  });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
          Branches
        </p>
        <div className="flex items-center gap-2">
          {hiddenBranchCount > 0 ? (
            <span className="text-[11px] text-muted-foreground/80">
              {filteredRemoteBranches.length} of {remoteBranches.length}
            </span>
          ) : null}
          <VaultBranchFiltersControl
            value={filters}
            options={filterOptions}
            onChange={onChangeFilters}
          />
        </div>
      </div>
      {filteredRemoteBranches.length > 0 ? (
        <VaultBranchList
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          remoteBranches={visibleRemoteBranches}
          productionDeploymentDashboardUrl={productionDeploymentDashboardUrl}
          expansion={
            showListExpansionControl && hasBranchListOverflow
              ? {
                  hiddenBranchCount: collapsedBranchCount,
                  isExpanded: branchesExpanded,
                  onToggle: () => {
                    onChangeFilters({
                      ...filters,
                      branchesExpanded: !branchesExpanded,
                    });
                  },
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function renderVaultDashboardCooldownStatus({
  cooldownUntil,
  label,
  now,
  title,
}: {
  cooldownUntil: number;
  label: string;
  now: number;
  title: string;
}) {
  return (
    <>
      <span className="text-amber-700" title={title}>
        {label}
      </span>
      <span>·</span>
      <span className="font-mono tabular-nums">
        {formatRelativeTimeUntil(cooldownUntil, now)}
      </span>
    </>
  );
}

function renderVaultDashboardRepositoryStatus({
  isReady,
  now,
  onRefreshVaultTree,
  sharedLastSyncedAt,
  treeRefreshUiState,
  vault,
}: {
  isReady: boolean;
  now: number;
  onRefreshVaultTree: (vault: DashboardManualRefreshVault) => void;
  sharedLastSyncedAt: number | undefined;
  treeRefreshUiState: ReturnType<typeof getTreeRefreshUiState>;
  vault: DashboardManualRefreshVault & {
    treeRefreshFailureMessage?: string;
  };
}) {
  if (!isReady) {
    return undefined;
  }

  if (treeRefreshUiState.kind === "syncing") {
    return (
      <>
        <UpdateIcon className="h-3 w-3 animate-spin" />
        <span>Syncing...</span>
      </>
    );
  }

  if (treeRefreshUiState.kind === "rate_limited") {
    return renderVaultDashboardCooldownStatus({
      cooldownUntil: treeRefreshUiState.cooldownUntil,
      label: "GitHub rate limited",
      now,
      title:
        vault.treeRefreshFailureMessage ??
        "GitHub API rate limited. Auto-refresh paused.",
    });
  }

  if (treeRefreshUiState.kind === "cooldown") {
    return renderVaultDashboardCooldownStatus({
      cooldownUntil: treeRefreshUiState.cooldownUntil,
      label: "Paused",
      now,
      title:
        vault.treeRefreshFailureMessage ??
        "Auto-refresh paused after a failed sync.",
    });
  }

  if (treeRefreshUiState.kind === "failed") {
    return (
      <span
        className="text-amber-700"
        title={
          vault.treeRefreshFailureMessage ??
          "Last sync failed. Showing cached state."
        }
      >
        Last sync failed
      </span>
    );
  }

  if (typeof sharedLastSyncedAt === "number") {
    return (
      <VaultLastUpdatedStatus
        lastSyncedAt={sharedLastSyncedAt}
        now={now}
        onRefresh={() => {
          onRefreshVaultTree(vault);
        }}
        repositoryFullName={vault.repositoryFullName}
      />
    );
  }

  return undefined;
}

type VaultDashboardBodyProps = {
  developerToolsVisible: boolean;
  isRemovingVault: boolean;
  now: number;
  themeColorSearch: AppThemeColorSearch;
  openDeveloperToolsByVaultId: Partial<Record<Id<"vaults">, boolean>>;
  pendingVaultBranchFiltersByVaultId: Partial<
    Record<string, VaultBranchFiltersState>
  >;
  persistedVaultBranchFiltersByVaultId: Map<string, VaultBranchFiltersState>;
  retryingVaultId: Id<"vaults"> | null;
  deleteRepositoryFullName?: string;
  vaults: VaultDashboardVault[];
  onDeleteVault: (vault: VaultDashboardVault) => void;
  onDeleteOpenChange: (isOpen: boolean) => void;
  onOpenDeveloperToolsChange: (vaultId: Id<"vaults">, isOpen: boolean) => void;
  onRefreshVaultTree: (vault: DashboardManualRefreshVault) => void;
  onRetryInfrastructure: (vaultId: Id<"vaults">) => void;
  onSaveVaultBranchFilters: (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => void;
};

function VaultDashboardBody({
  developerToolsVisible,
  isRemovingVault,
  now,
  themeColorSearch,
  openDeveloperToolsByVaultId,
  pendingVaultBranchFiltersByVaultId,
  persistedVaultBranchFiltersByVaultId,
  retryingVaultId,
  deleteRepositoryFullName,
  vaults,
  onDeleteVault,
  onDeleteOpenChange,
  onOpenDeveloperToolsChange,
  onRefreshVaultTree,
  onRetryInfrastructure,
  onSaveVaultBranchFilters,
}: VaultDashboardBodyProps) {
  const deleteCardElementsRef = useRef(new Map<string, HTMLDivElement>());
  const lastScrolledDeleteRepositoryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!deleteRepositoryFullName) {
      lastScrolledDeleteRepositoryRef.current = null;
      return;
    }

    if (lastScrolledDeleteRepositoryRef.current === deleteRepositoryFullName) {
      return;
    }

    const deleteCardElement = deleteCardElementsRef.current.get(
      deleteRepositoryFullName,
    );
    if (!deleteCardElement) {
      return;
    }

    // Direct ?delete= loads resolve after vault data arrives, so anchor the
    // selected card once the target element exists.
    deleteCardElement.scrollIntoView({
      block: "start",
      inline: "nearest",
    });
    lastScrolledDeleteRepositoryRef.current = deleteRepositoryFullName;
  }, [deleteRepositoryFullName, vaults]);

  if (vaults.length === 0) {
    return <VaultDashboardEmptyState themeColorSearch={themeColorSearch} />;
  }

  return (
    <VaultDashboardRepositoryList>
      {vaults.map((vault) => {
        const isReady = vault.state === "ready";
        const remoteBranches = vault.remoteBranches;
        const vaultBranchFilters =
          pendingVaultBranchFiltersByVaultId[vault._id] ??
          persistedVaultBranchFiltersByVaultId.get(vault._id) ??
          getDefaultVaultBranchFilters();
        const activeRemoteBranches = remoteBranches.filter(
          (branch) => branch.remoteState === "active",
        );
        const defaultBranch = activeRemoteBranches.find(
          (branch) => branch.isDefault,
        )?.name;
        const primaryBranch = defaultBranch || activeRemoteBranches[0]?.name;
        const chatRoute = primaryBranch
          ? buildVaultCodespaceChatRoute({
              repositoryFullName: vault.repositoryFullName,
              branch: primaryBranch,
            })
          : null;
        const githubRepositoryUrl = `https://github.com/${vault.ghRepoOwner}/${vault.ghRepoName}`;
        const developerToolsOpen =
          developerToolsVisible &&
          (openDeveloperToolsByVaultId[vault._id] ?? false);
        const infraActionLabel = vault.isNoterManaged
          ? getInfraActionLabel(vault.infraState)
          : null;
        const repositoryExternalLinks =
          buildVaultDashboardRepositoryExternalLinks({
            cloudflareProjectDashboardUrl: vault.cloudflareProjectDashboardUrl,
            convexProjectSettingsDashboardUrl:
              vault.convexProjectSettingsDashboardUrl,
            githubRepositoryUrl,
          });
        const sharedLastSyncedAt = vault.lastTreeRefreshAt;
        const treeRefreshUiState = getTreeRefreshUiState({
          now,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          lastTreeRefreshAt: vault.lastTreeRefreshAt,
          lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
          treeRefreshFailureKind: vault.treeRefreshFailureKind,
          treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
        });
        const filteredRemoteBranches = filterVaultRemoteBranches(
          remoteBranches,
          vaultBranchFilters,
        );
        const hasBranchListOverflow =
          filteredRemoteBranches.length > COLLAPSED_BRANCH_LIMIT;
        const branchesExpanded = vaultBranchFilters.branchesExpanded;
        const collapsedBranchCount =
          filteredRemoteBranches.length - COLLAPSED_BRANCH_LIMIT;
        const isDeleteOpen =
          deleteRepositoryFullName === vault.repositoryFullName;

        return (
          <div
            key={vault._id}
            ref={(element) => {
              if (element) {
                deleteCardElementsRef.current.set(
                  vault.repositoryFullName,
                  element,
                );
                return;
              }

              deleteCardElementsRef.current.delete(vault.repositoryFullName);
            }}
          >
            <VaultDashboardRepositoryCard
              isReady={isReady}
              repositoryOwner={vault.ghRepoOwner}
              repositoryName={vault.ghRepoName}
              titleHref={githubRepositoryUrl}
              titleTarget="_blank"
              titleTitle={`Open ${vault.repositoryFullName} on GitHub`}
              titleClassName={linkStyle}
              repositoryLinks={
                repositoryExternalLinks.length > 0 ? (
                  <VaultDashboardRepositoryExternalLinks
                    links={repositoryExternalLinks}
                    repositoryFullName={vault.repositoryFullName}
                  />
                ) : undefined
              }
              titleSuffix={
                !isReady ? (
                  <>
                    <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      (setting up...)
                    </span>
                  </>
                ) : undefined
              }
              topRightAction={
                <VaultDashboardDeleteControl
                  repositoryFullName={vault.repositoryFullName}
                  isOpen={isDeleteOpen}
                  isRemovingVault={isRemovingVault}
                  onOpenChange={onDeleteOpenChange}
                  onRemoveVault={() => {
                    if (!isRemovingVault) {
                      onDeleteVault(vault);
                      onDeleteOpenChange(false);
                    }
                  }}
                />
              }
              repositoryStatus={renderVaultDashboardRepositoryStatus({
                isReady,
                now,
                onRefreshVaultTree,
                sharedLastSyncedAt,
                treeRefreshUiState,
                vault,
              })}
              headerControls={
                isReady && hasBranchListOverflow ? (
                  <VaultBranchListExpansionControl
                    hiddenBranchCount={collapsedBranchCount}
                    isExpanded={branchesExpanded}
                    onToggle={() => {
                      onSaveVaultBranchFilters(vault._id, {
                        ...vaultBranchFilters,
                        branchesExpanded: !branchesExpanded,
                      });
                    }}
                    placement="header"
                  />
                ) : undefined
              }
              branchSection={
                isReady && remoteBranches.length > 0 ? (
                  <VaultBranchSection
                    vaultId={vault._id}
                    repositoryFullName={vault.repositoryFullName}
                    remoteBranches={remoteBranches}
                    productionDeploymentDashboardUrl={
                      vault.convexDeploymentDashboardUrl
                    }
                    filters={vaultBranchFilters}
                    onChangeFilters={(nextVaultBranchFilters) => {
                      onSaveVaultBranchFilters(
                        vault._id,
                        nextVaultBranchFilters,
                      );
                    }}
                    showListExpansionControl={false}
                  />
                ) : undefined
              }
              daytonaBanner={
                !DAYTONA_PAUSED && isReady && primaryBranch ? (
                  <DaytonaSnapshotBanner
                    branch={primaryBranch}
                    commitSha={vault.commitSHA}
                    snapshotName={vault.daytonaCurrentSnapshotName}
                    snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                    lastError={vault.daytonaCurrentSnapshotLastError}
                  />
                ) : undefined
              }
              developerToolsSection={
                isReady
                  ? {
                      open: developerToolsOpen,
                      visible: developerToolsVisible,
                      onOpenChange: (isOpen: boolean) => {
                        onOpenDeveloperToolsChange(vault._id, isOpen);
                      },
                      content: (
                        <>
                          <CodespaceStatus
                            vaultId={vault._id}
                            repositoryFullName={vault.repositoryFullName}
                          />
                          {!DAYTONA_PAUSED && primaryBranch ? (
                            <DaytonaWorkspaceButton
                              vaultId={vault._id}
                              branch={primaryBranch}
                              sandboxId={vault.daytonaSandboxId}
                              sandboxName={vault.daytonaSandboxName}
                              commitSha={vault.commitSHA}
                              snapshotStatus={
                                vault.daytonaCurrentSnapshotStatus
                              }
                              snapshotName={vault.daytonaCurrentSnapshotName}
                              snapshotError={
                                vault.daytonaCurrentSnapshotLastError
                              }
                            />
                          ) : null}
                          {!DAYTONA_PAUSED ? (
                            <DaytonaSnapshotList vaultId={vault._id} />
                          ) : null}
                          {vault.isNoterManaged && (
                            <div className="text-xs text-muted-foreground">
                              Infra: {formatInfraState(vault.infraState)}
                              {vault.infraProductionUrl && (
                                <a
                                  href={vault.infraProductionUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className={`ml-2 font-mono break-all ${linkStyle}`}
                                >
                                  {vault.infraProductionUrl}
                                </a>
                              )}
                            </div>
                          )}
                        </>
                      ),
                    }
                  : undefined
              }
              footerActions={
                infraActionLabel ||
                (CHAT_ENABLED &&
                  developerToolsVisible &&
                  developerToolsOpen &&
                  chatRoute) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {CHAT_ENABLED &&
                      developerToolsVisible &&
                      developerToolsOpen &&
                      chatRoute && (
                        <Button asChild variant="outline" size="sm">
                          <Link to={chatRoute}>Chat</Link>
                        </Button>
                      )}
                    {infraActionLabel && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onRetryInfrastructure(vault._id);
                        }}
                        disabled={retryingVaultId === vault._id}
                      >
                        {retryingVaultId === vault._id ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          infraActionLabel
                        )}
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            />
          </div>
        );
      })}
    </VaultDashboardRepositoryList>
  );
}

export function VaultDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const rootRouteSearch = useRootRouteSearch();
  const developerToolsVisible =
    rootRouteSearch[DASHBOARD_DEVELOPER_TOOLS_QUERY_PARAM] === true;
  const vaults = useQuery(api.vault.getUserVaults);
  const now = useNow();
  const deleteVault = useAction(api.vaultActions.deleteVault);
  const createRepository = useAction(api.vaultActions.createRepository);
  const retryInfrastructureProvisioning = useAction(
    api.vaultActions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const refreshTree = useAction(api.github.refreshRepositoryTree);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getCloudflareMcpOAuthUrl = useAction(
    api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl,
  );
  const refreshCloudflareMcpTokenIfNeeded = useAction(
    api.users.refreshCloudflareMcpTokenIfNeeded,
  );
  const connectGithubWithApiKey = useAction(api.users.connectGithubWithApiKey);
  const connectConvexWithApiKey = useAction(api.users.connectConvexWithApiKey);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectCloudflare = useMutation(api.users.disconnectCloudflare);
  const persistAccountPanelOpen = useMutation(
    api.dashboardSettings.setAccountPanelOpen,
  );
  const setProvidersPanelOpen = useMutation(
    api.dashboardSettings.setProvidersPanelOpen,
  );
  const setEditorChatOpen = useMutation(
    api.dashboardSettings.setEditorChatOpen,
  );
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
  );
  const userVaultBranchFilters = useConvexQuery(
    api.vault.getUserVaultBranchFilters,
  );
  const user = useConvexQuery(api.users.viewer);
  const authProviders = useConvexQuery(api.users.getViewerAuthProviders);
  const dashboardSettings = useConvexQuery(
    api.dashboardSettings.getDashboardSettings,
  );
  const { signOut } = useNoterAuthActions();
  const dashboardAccountPanelOpen = dashboardSettings?.accountPanelOpen;
  const dashboardGlobalChatOpen = dashboardSettings?.globalChatOpen;
  const dashboardProvidersPanelOpen = dashboardSettings?.providersPanelOpen;
  const deleteRepositoryFullName = rootRouteSearch.delete;
  const setVaultBranchFilters = useMutation(api.vault.setVaultBranchFilters);
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      getOAuthUrl: () => getGithubOAuthUrl({}),
      disconnect: disconnectGithub,
      popupRef: githubPopupRef,
      popupOriginRef: githubPopupOriginRef,
    },
    convex: {
      getOAuthUrl: getConvexOAuthUrl,
      disconnect: disconnectConvex,
      popupRef: convexPopupRef,
      popupOriginRef: convexPopupOriginRef,
    },
    cloudflare: {
      getOAuthUrl: getCloudflareMcpOAuthUrl,
      disconnect: disconnectCloudflare,
      popupRef: cloudflarePopupRef,
      popupOriginRef: cloudflarePopupOriginRef,
    },
  };
  const [vaultToDelete, setVaultToDelete] = useState<VaultDeleteIntent | null>(
    null,
  );
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);
  const [removeCodespaces, setRemoveCodespaces] = useState(false);
  const [removeConvexProvision, setRemoveConvexProvision] = useState(false);
  const [removeHostingProvision, setRemoveHostingProvision] = useState(false);
  const [removeDaytonaResources, setRemoveDaytonaResources] = useState(false);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [disconnectingProvider, setDisconnectingProvider] =
    useState<ProviderKey | null>(null);
  const [isCheckingCloudflareToken, setIsCheckingCloudflareToken] =
    useState(false);
  const [isAutoCheckingCloudflareToken, setIsAutoCheckingCloudflareToken] =
    useState(false);
  const [cloudflarePollingPaused, setCloudflarePollingPaused] = useState(
    typeof document !== "undefined"
      ? document.visibilityState !== "visible"
      : false,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [didAttemptCommit, setDidAttemptCommit] = useState(false);
  const [retryingVaultId, setRetryingVaultId] = useState<Id<"vaults"> | null>(
    null,
  );
  const [openDeveloperToolsByVaultId, setOpenDeveloperToolsByVaultId] =
    useState<Partial<Record<Id<"vaults">, boolean>>>({});
  const [providersPanelOpen, setProvidersPanelOpenState] = useState<
    boolean | null
  >(null);
  const [accountPanelOpen, setAccountPanelOpenState] = useState<boolean | null>(
    null,
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [globalChatOpen, setGlobalChatOpenState] = useState<boolean | null>(
    null,
  );
  const [isGlobalChatBusy, setIsGlobalChatBusy] = useState(false);
  const [shouldAutoFocusChatInput, setShouldAutoFocusChatInput] =
    useState(false);
  const globalChatPendingRef = useRef<boolean | null>(null);
  const accountPanelPendingRef = useRef<boolean | null>(null);
  const providersPanelPendingRef = useRef<boolean | null>(null);
  const cloudflareAutoCheckInFlightRef = useRef(false);
  const initialDashboardPageLoadSentRef = useRef(false);
  const initialCloudflareMcpTokenCheckedAtRef = useRef<
    number | undefined | null
  >(null);

  useEffect(() => {
    if (developerToolsVisible) {
      return;
    }

    setOpenDeveloperToolsByVaultId((currentOpenState) =>
      Object.keys(currentOpenState).length === 0 ? currentOpenState : {},
    );
  }, [developerToolsVisible]);

  useEffect(() => {
    if (dashboardAccountPanelOpen === undefined) {
      return;
    }
    const serverValue = dashboardAccountPanelOpen;
    if (accountPanelPendingRef.current !== null) {
      if (accountPanelPendingRef.current === serverValue) {
        accountPanelPendingRef.current = null;
      } else {
        return;
      }
    }
    setAccountPanelOpenState(serverValue);
  }, [dashboardAccountPanelOpen]);

  useEffect(() => {
    if (dashboardProvidersPanelOpen === undefined) {
      return;
    }
    const serverValue = dashboardProvidersPanelOpen;
    if (providersPanelPendingRef.current !== null) {
      if (providersPanelPendingRef.current === serverValue) {
        providersPanelPendingRef.current = null;
      } else {
        return;
      }
    }
    setProvidersPanelOpenState(serverValue);
  }, [dashboardProvidersPanelOpen]);

  useEffect(() => {
    if (dashboardGlobalChatOpen === undefined) {
      return;
    }
    const serverValue = dashboardGlobalChatOpen;
    if (globalChatPendingRef.current !== null) {
      if (globalChatPendingRef.current === serverValue) {
        globalChatPendingRef.current = null;
      } else {
        return;
      }
    }
    setGlobalChatOpenState(serverValue);
  }, [dashboardGlobalChatOpen]);

  useEffect(() => {
    const isCloudflareMcpConnected =
      cloudflareConnection?.connected === true &&
      cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      initialCloudflareMcpTokenCheckedAtRef.current = null;
      return;
    }
    if (initialCloudflareMcpTokenCheckedAtRef.current === null) {
      initialCloudflareMcpTokenCheckedAtRef.current =
        cloudflareConnection.mcpTokenCheckedAt;
    }
  }, [
    cloudflareConnection?.authMethod,
    cloudflareConnection?.connected,
    cloudflareConnection?.mcpTokenCheckedAt,
  ]);

  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const providerPopupConfig: Record<
      ProviderKey,
      {
        completionEventType: string;
        popupRef: MutableRefObject<Window | null>;
        popupOriginRef: MutableRefObject<string | null>;
      }
    > = {
      github: {
        completionEventType: PROVIDER_METADATA.github.completionEventType,
        popupRef: githubPopupRef,
        popupOriginRef: githubPopupOriginRef,
      },
      convex: {
        completionEventType: PROVIDER_METADATA.convex.completionEventType,
        popupRef: convexPopupRef,
        popupOriginRef: convexPopupOriginRef,
      },
      cloudflare: {
        completionEventType: PROVIDER_METADATA.cloudflare.completionEventType,
        popupRef: cloudflarePopupRef,
        popupOriginRef: cloudflarePopupOriginRef,
      },
    };
    const handler = (event: MessageEvent) => {
      if (!isRecord(event.data) || typeof event.data.type !== "string") {
        return;
      }

      for (const provider of PROVIDER_KEYS) {
        const popupConfig = providerPopupConfig[provider];
        if (event.data.type !== popupConfig.completionEventType) {
          continue;
        }
        if (event.source !== popupConfig.popupRef.current) {
          return;
        }
        if (
          event.origin !==
          (popupConfig.popupOriginRef.current ?? expectedOrigin)
        ) {
          return;
        }
        window.location.reload();
        return;
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  const refreshVaultTreesIfNeeded = useCallback(
    (trigger: RefreshTrigger = "visibility") => {
      if (!vaults || vaults.length === 0) {
        return;
      }

      const now = Date.now();
      const readyVaults = vaults.filter((vault) => vault.state === "ready");
      const vaultsToRefresh = readyVaults.filter((vault) =>
        typeof vault.treeRefreshCooldownUntil !== "number" ||
        vault.treeRefreshCooldownUntil <= now
          ? shouldAutoRefreshVault({
              lastTreeRefreshAt: vault.lastTreeRefreshAt,
              remoteBranches: vault.remoteBranches,
              trigger,
              now,
            }) && claimRefreshDebounce("dashboard", vault.repositoryFullName)
          : false,
      );

      if (vaultsToRefresh.length === 0) {
        return;
      }

      void (async () => {
        for (
          let index = 0;
          index < vaultsToRefresh.length;
          index += DASHBOARD_REFRESH_CONCURRENCY
        ) {
          const batch = vaultsToRefresh.slice(
            index,
            index + DASHBOARD_REFRESH_CONCURRENCY,
          );

          await Promise.all(
            batch.map(async (vault) => {
              const cloudflarePreviewBranchNames =
                getCloudflareBranchPreviewHydrationTargets(
                  vault.remoteBranches,
                );
              await refreshTree({
                owner: vault.ghRepoOwner,
                repo: vault.ghRepoName,
                // Preview-comment scans are expensive compared to the default
                // branch tree refresh itself, so only re-run them for the
                // current PR branches that still lack cached preview metadata.
                includeCloudflarePreviewLinks:
                  cloudflarePreviewBranchNames.length > 0,
                cloudflarePreviewBranchNames,
                trigger,
              }).catch((error: unknown) => {
                console.error(
                  "Failed to refresh repository tree from dashboard:",
                  error,
                );
              });
            }),
          );
        }
      })();
    },
    [refreshTree, vaults],
  );

  const refreshVaultTreeFromStatusClick = useCallback(
    (vault: DashboardManualRefreshVault) => {
      if (
        vault.state !== "ready" ||
        (typeof vault.treeRefreshCooldownUntil === "number" &&
          vault.treeRefreshCooldownUntil > Date.now()) ||
        !claimRefreshDebounce("dashboard", vault.repositoryFullName)
      ) {
        return;
      }

      const cloudflarePreviewBranchNames =
        getCloudflareBranchPreviewHydrationTargets(vault.remoteBranches);

      void refreshTree({
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        includeCloudflarePreviewLinks: cloudflarePreviewBranchNames.length > 0,
        cloudflarePreviewBranchNames,
        trigger: "manual",
      }).catch((error: unknown) => {
        console.error(
          "Failed to refresh repository tree from dashboard status click:",
          error,
        );
      });
    },
    [refreshTree],
  );

  useEffect(() => {
    if (!vaults || vaults.length === 0) {
      return;
    }

    // Emit the dashboard "page_load" refresh exactly once, then fall back to
    // plain "visibility" refreshes on later resumes.
    const triggerInitialPageLoad = () => {
      if (initialDashboardPageLoadSentRef.current) {
        return;
      }
      initialDashboardPageLoadSentRef.current = true;
      refreshVaultTreesIfNeeded("page_load");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (!initialDashboardPageLoadSentRef.current) {
        triggerInitialPageLoad();
        return;
      }

      refreshVaultTreesIfNeeded("visibility");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.visibilityState === "visible") {
      triggerInitialPageLoad();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshVaultTreesIfNeeded, vaults]);

  useEffect(() => {
    const isCloudflareMcpConnected =
      cloudflareConnection?.connected === true &&
      cloudflareConnection.authMethod === "mcp_oauth";
    if (!isCloudflareMcpConnected) {
      setCloudflarePollingPaused(false);
      return;
    }

    const debounceKey = user?._id ?? "cloudflare-dashboard";
    const runAutoCheck = (
      trigger: "focus" | "visibility" | "page_load" | "poll",
    ) => {
      if (cloudflareAutoCheckInFlightRef.current) {
        return;
      }
      if (
        !claimRefreshDebounce(
          "cloudflare_token",
          debounceKey,
          CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
        )
      ) {
        return;
      }

      cloudflareAutoCheckInFlightRef.current = true;
      setIsAutoCheckingCloudflareToken(true);
      void refreshCloudflareMcpTokenIfNeeded({ trigger, force: false })
        .catch((error: unknown) => {
          console.error("Failed to auto-check Cloudflare token:", error);
        })
        .finally(() => {
          releaseRefreshDebounce("cloudflare_token", debounceKey);
          cloudflareAutoCheckInFlightRef.current = false;
          setIsAutoCheckingCloudflareToken(false);
        });
    };

    const handleFocus = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      setCloudflarePollingPaused(false);
      runAutoCheck("focus");
    };

    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible";
      setCloudflarePollingPaused(!isVisible);
      if (isVisible) {
        runAutoCheck("visibility");
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const isVisible = document.visibilityState === "visible";
    setCloudflarePollingPaused(!isVisible);
    if (isVisible) {
      runAutoCheck("page_load");
    }

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (
        typeof cloudflareConnection.mcpTokenNextAutoCheckAt === "number" &&
        Date.now() < cloudflareConnection.mcpTokenNextAutoCheckAt
      ) {
        return;
      }
      runAutoCheck("poll");
    }, CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(pollId);
      cloudflareAutoCheckInFlightRef.current = false;
    };
  }, [
    cloudflareConnection?.authMethod,
    cloudflareConnection?.connected,
    cloudflareConnection?.mcpTokenNextAutoCheckAt,
    refreshCloudflareMcpTokenIfNeeded,
    user?._id,
  ]);

  const selectedVault =
    vaultToDelete && vaults
      ? (vaults.find((vault) => vault._id === vaultToDelete.id) ?? null)
      : null;
  const stagedChangesCount = selectedVault?.fileCount ?? 0;
  const hasStagedChanges = stagedChangesCount > 0;
  const hasDaytonaResources = hasDaytonaResourcesForVault(selectedVault);
  const removeHostingCheckboxId = "remove-cloudflare-provision";
  const removeHostingLabel = "Also remove Cloudflare Pages project";
  const connectedCodespacesCount = useConvexQuery(
    api.codespacesMutations.getConnectedCodespacesCount,
    vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );
  const resetDeleteDialogState = () => {
    setVaultToDelete(null);
    setRemoveGithubRepo(false);
    setRemoveCodespaces(false);
    setRemoveConvexProvision(false);
    setRemoveHostingProvision(false);
    setRemoveDaytonaResources(false);
    setCommitError(null);
    setDeleteError(null);
    setDidAttemptCommit(false);
  };

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (createError) {
      setCreateError(null);
    }
    try {
      const oauthUrl =
        provider === "github"
          ? await getGithubOAuthUrl({
              returnToPath: location.href,
            })
          : await providerConfig.getOAuthUrl();
      if (isInIframe()) {
        providerConfig.popupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        providerConfig.popupRef.current =
          provider === "github"
            ? openGithubOAuthPopup(oauthUrl)
            : window.open(
                oauthUrl,
                providerMetadata.popupName,
                "width=600,height=700,popup=true",
              );
        if (providerConfig.popupRef.current) {
          return;
        }
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to start ${providerMetadata.label} OAuth`,
      );
    }
  };

  const handleDisconnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (disconnectingProvider) return;
    setDisconnectingProvider(provider);
    if (createError) {
      setCreateError(null);
    }
    try {
      await providerConfig.disconnect();
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to disconnect ${providerMetadata.label}`,
      );
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleCheckCloudflareToken = async () => {
    if (isCheckingCloudflareToken) {
      return;
    }
    setIsCheckingCloudflareToken(true);
    if (createError) {
      setCreateError(null);
    }
    try {
      await refreshCloudflareMcpTokenIfNeeded({
        trigger: "manual",
        force: true,
      });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to check Cloudflare token",
      );
    } finally {
      setIsCheckingCloudflareToken(false);
    }
  };

  const handleRemoveVault = async () => {
    if (!vaultToDelete || isDeleting || isCommitting) return;
    setDeleteError(null);

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeCodespaces:
          connectedCodespacesCount === 0 ? true : removeCodespaces,
        removeGithubRepo: vaultToDelete.isNoterManaged
          ? removeGithubRepo
          : false,
        removeConvexProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasConvexProvision
            ? removeConvexProvision
            : false,
        removeHostingProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasHostingProvision
            ? removeHostingProvision
            : false,
        removeDaytonaResources,
      });
      resetDeleteDialogState();
    } catch (error) {
      console.error("Failed to remove vault:", error);
      setDeleteError(
        error instanceof Error ? error.message : "Failed to remove vault",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCommitBeforeRemove = async () => {
    if (!vaultToDelete || isCommitting || isDeleting) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      await commitStaging({
        repositoryFullName: vaultToDelete.repositoryFullName,
      });
    } catch (error) {
      setCommitError(
        error instanceof Error ? error.message : "Failed to commit changes",
      );
    } finally {
      setDidAttemptCommit(true);
      setIsCommitting(false);
    }
  };

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!canCreateRepo) {
      setCreateError(
        `Connect GitHub, Convex, and ${requiredHostingConnectionLabel} before creating an app.`,
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        private: true,
      });
      setNewRepositoryName("");
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create app",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetryInfrastructure = async (vaultId: Id<"vaults">) => {
    if (retryingVaultId === vaultId) {
      return;
    }
    setRetryingVaultId(vaultId);
    try {
      await retryInfrastructureProvisioning({ vaultId });
    } catch (error) {
      console.error("Failed to retry infrastructure provisioning:", error);
    } finally {
      setRetryingVaultId(null);
    }
  };

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const requiredHostingConnectionLabel = "Cloudflare";
  const cloudflareMcpTokenStatus = cloudflareConnection?.mcpTokenStatus;
  const cloudflareMcpTokenExpiresAt = cloudflareConnection?.mcpTokenExpiresAt;
  const cloudflareMcpTokenCheckedAt = cloudflareConnection?.mcpTokenCheckedAt;
  const cloudflareMcpTokenError = cloudflareConnection?.mcpTokenError;
  const cloudflareMcpTokenNextAutoCheckAt =
    cloudflareConnection?.mcpTokenNextAutoCheckAt;
  const cloudflareRefreshWindowStartsAt =
    typeof cloudflareMcpTokenExpiresAt === "number"
      ? cloudflareMcpTokenExpiresAt - CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS
      : undefined;
  // Keep the create warning quiet until this page load has observed a fresh
  // token-health check, so a stale invalid status does not flash on startup.
  const isAwaitingInitialCloudflareTokenCheck =
    cloudflareConnection?.connected === true &&
    cloudflareConnection.authMethod === "mcp_oauth" &&
    initialCloudflareMcpTokenCheckedAtRef.current !== null &&
    cloudflareMcpTokenCheckedAt ===
      initialCloudflareMcpTokenCheckedAtRef.current;
  const showCloudflareCreateWarning =
    cloudflareConnected &&
    !isAwaitingInitialCloudflareTokenCheck &&
    !isCheckingCloudflareToken &&
    !isAutoCheckingCloudflareToken &&
    (cloudflareMcpTokenStatus === "invalid" ||
      cloudflareMcpTokenStatus === "expired");
  const canCreateRepo = Boolean(
    githubConnected && convexConnected && cloudflareConnected,
  );
  const formatAuthMethod = (
    method: "oauth" | "mcp_oauth" | "api_key" | "device_auth" | undefined,
  ) => {
    if (method === "api_key") return "API key";
    if (method === "device_auth") return "Device auth";
    if (method === "oauth") return "OAuth";
    if (method === "mcp_oauth") return "MCP OAuth";
    return "Unknown";
  };
  const githubStatus = githubConnected
    ? `Connected as ${githubConnection.username ?? "GitHub user"} (${formatAuthMethod(githubConnection.authMethod)})`
    : "Not connected";
  const convexStatus = convexConnected
    ? `Connected to ${convexConnection.teamSlug ?? convexConnection.teamId ?? "Convex team"} (${formatAuthMethod(convexConnection.authMethod)})`
    : "Not connected";
  const cloudflareMcpTokenTimeStatus =
    cloudflareConnection?.authMethod === "mcp_oauth"
      ? cloudflareMcpTokenStatus === "valid" ||
        cloudflareMcpTokenStatus === "expiring_soon"
        ? typeof cloudflareMcpTokenExpiresAt === "number"
          ? `Expires ${formatRelativeTimeUntil(cloudflareMcpTokenExpiresAt, now)}.`
          : ""
        : cloudflareMcpTokenStatus === "expired"
          ? typeof cloudflareMcpTokenExpiresAt === "number"
            ? `Expired ${formatRelativeTimeAgo(cloudflareMcpTokenExpiresAt, now)}.`
            : ""
          : typeof cloudflareMcpTokenCheckedAt === "number"
            ? `Last checked ${formatRelativeTimeAgo(cloudflareMcpTokenCheckedAt, now)}.`
            : ""
      : "";
  const cloudflareAuthMethod = cloudflareConnection?.authMethod;
  const cloudflareSchedulerStatus =
    cloudflareAuthMethod === "mcp_oauth"
      ? isCheckingCloudflareToken || isAutoCheckingCloudflareToken
        ? "Checking..."
        : cloudflarePollingPaused
          ? "Auto-check paused (tab hidden)."
          : typeof cloudflareMcpTokenNextAutoCheckAt === "number"
            ? typeof cloudflareRefreshWindowStartsAt === "number" &&
              now < cloudflareRefreshWindowStartsAt
              ? `Auto-refresh starts ${formatRelativeTimeUntil(cloudflareRefreshWindowStartsAt, now)}.`
              : `Auto-refresh ${formatRelativeTimeUntil(cloudflareMcpTokenNextAutoCheckAt, now)}.`
            : ""
      : "";
  const cloudflareMcpTokenErrorStatus =
    cloudflareAuthMethod === "mcp_oauth" && cloudflareMcpTokenError
      ? `Error: ${cloudflareMcpTokenError}`
      : "";
  const cloudflareStatus = cloudflareConnected
    ? cloudflareAuthMethod === "mcp_oauth"
      ? [
          "Connected (MCP OAuth).",
          `Token ${formatMcpTokenStatusLabel(cloudflareMcpTokenStatus)}.`,
          cloudflareMcpTokenTimeStatus,
          cloudflareSchedulerStatus,
          cloudflareMcpTokenErrorStatus,
        ]
          .filter((part) => part.length > 0)
          .join(" ")
      : `Connected (${formatAuthMethod(cloudflareAuthMethod)})`
    : "Not connected";
  const providerConnectionState: Record<
    ProviderKey,
    { connected: boolean; status: string; showTokenCheck: boolean }
  > = {
    github: {
      connected: githubConnected,
      status: githubStatus,
      showTokenCheck: false,
    },
    convex: {
      connected: convexConnected,
      status: convexStatus,
      showTokenCheck: false,
    },
    cloudflare: {
      connected: cloudflareConnected,
      status: cloudflareStatus,
      showTokenCheck:
        cloudflareConnected && cloudflareAuthMethod === "mcp_oauth",
    },
  };
  const userDisplayName = user?.name ?? user?.email ?? user?.githubUsername;
  const accountEmail =
    user?.email ?? user?.githubUsername ?? user?.name ?? null;
  const accountDisplayName = userDisplayName ?? accountEmail;
  const accountProviderLabel = authProviders?.primaryProvider
    ? formatAuthProviderLabel(authProviders.primaryProvider)
    : null;
  const createPlaceholder = "New App name";
  const createButtonLabel = isCreating ? "Creating app..." : "New App";
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectGithubWithApiKey,
    connectConvexWithApiKey,
  });
  const createControl = (
    <div className="vault-dashboard-sidebar-inset flex w-full flex-col items-stretch gap-2 py-3">
      <Input
        placeholder={createPlaceholder}
        value={newRepositoryName}
        onChange={(e) => {
          setNewRepositoryName(e.target.value);
          if (createError) {
            setCreateError(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void handleCreateRepository();
          }
        }}
        className="w-full"
        disabled={!canCreateRepo}
      />
      <Button
        className="w-full"
        onClick={() => {
          void handleCreateRepository();
        }}
        disabled={
          isCreating || newRepositoryName.trim().length === 0 || !canCreateRepo
        }
      >
        {createButtonLabel}
      </Button>
      {githubConnected ? (
        <Button
          variant="outline"
          className="h-auto min-h-8 w-full whitespace-normal py-2"
          asChild
        >
          <Link to="/add">
            <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
              Connect existing app
            </span>
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          className="h-auto min-h-8 w-full whitespace-normal py-2"
          disabled
        >
          <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">
            Connect existing app
          </span>
        </Button>
      )}
      {createError && <div className="text-sm text-red-600">{createError}</div>}
      {!canCreateRepo && (
        <div className="text-xs text-muted-foreground">
          {`Connect GitHub, Convex, and ${requiredHostingConnectionLabel} to create an app.`}
        </div>
      )}
      {showCloudflareCreateWarning && (
        <div className="text-xs text-amber-700">
          Cloudflare token is invalid or expired. Reconnect Cloudflare.
        </div>
      )}
    </div>
  );

  const resolvedProvidersPanelOpen =
    providersPanelOpen ?? dashboardSettings?.providersPanelOpen ?? false;
  const resolvedAccountPanelOpen =
    accountPanelOpen ?? dashboardSettings?.accountPanelOpen ?? false;
  const resolvedGlobalChatOpen =
    globalChatOpen ?? dashboardGlobalChatOpen ?? false;

  const handleAccountPanelOpenChange = (isOpen: boolean) => {
    setAccountPanelOpenState(isOpen);
    accountPanelPendingRef.current = isOpen;
    void persistAccountPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist account panel state:", error);
      accountPanelPendingRef.current = null;
      setAccountPanelOpenState(dashboardSettings?.accountPanelOpen ?? false);
    });
  };

  const handleProvidersPanelOpenChange = (isOpen: boolean) => {
    setProvidersPanelOpenState(isOpen);
    providersPanelPendingRef.current = isOpen;
    void setProvidersPanelOpen({ isOpen }).catch((error: unknown) => {
      console.error("Failed to persist providers panel state:", error);
      providersPanelPendingRef.current = null;
      setProvidersPanelOpenState(
        dashboardSettings?.providersPanelOpen ?? false,
      );
    });
  };
  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    void signOut()
      .catch((error: unknown) => {
        toast({
          title: "Could not sign out",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

  const handleGlobalChatOpenChange = (isOpen: boolean) => {
    setShouldAutoFocusChatInput(isOpen);
    setGlobalChatOpenState(isOpen);
    globalChatPendingRef.current = isOpen;
    void setEditorChatOpen({ isOpen, scope: "global" }).catch(
      (error: unknown) => {
        console.error("Failed to persist global chat state:", error);
        globalChatPendingRef.current = null;
        setShouldAutoFocusChatInput(false);
        setGlobalChatOpenState(dashboardGlobalChatOpen ?? false);
      },
    );
  };

  const providerRows = PROVIDER_KEYS.map((provider) => {
    const providerMetadata = PROVIDER_METADATA[provider];
    const providerState = providerConnectionState[provider];
    const apiKeyProvider = providerMetadata.apiKeyProvider;
    const actions = providerState.connected
      ? providerState.showTokenCheck
        ? [
            {
              key: "check-token",
              label: "Check token",
              onClick: () => {
                void handleCheckCloudflareToken();
              },
              disabled:
                disconnectingProvider !== null ||
                isCheckingCloudflareToken ||
                isAutoCheckingCloudflareToken,
              isPending: isCheckingCloudflareToken,
              pendingLabel: "Checking...",
            },
            {
              key: "disconnect",
              label: "Disconnect",
              onClick: () => {
                void handleDisconnect(provider);
              },
              disabled:
                disconnectingProvider !== null ||
                isCheckingCloudflareToken ||
                isAutoCheckingCloudflareToken,
              isPending: disconnectingProvider === provider,
              pendingLabel: "Disconnecting...",
            },
          ]
        : [
            {
              key: "disconnect",
              label: "Disconnect",
              onClick: () => {
                void handleDisconnect(provider);
              },
              disabled: disconnectingProvider !== null,
              isPending: disconnectingProvider === provider,
              pendingLabel: "Disconnecting...",
            },
          ]
      : [
          {
            key: "oauth",
            label: providerMetadata.oauthButtonLabel,
            onClick: () => {
              void handleConnect(provider);
            },
            disabled: disconnectingProvider !== null,
          },
          ...(apiKeyProvider
            ? [
                {
                  key: "api-key",
                  label: "Use API key",
                  onClick: () => openApiKeyDialog(apiKeyProvider),
                  disabled: disconnectingProvider !== null,
                },
              ]
            : []),
        ];

    return {
      key: provider,
      icon: providerMetadata.icon,
      label: providerMetadata.label,
      status: providerState.status,
      actions,
    } satisfies VaultDashboardProviderRowViewModel;
  });

  const [
    pendingVaultBranchFiltersByVaultId,
    setPendingVaultBranchFiltersByVaultId,
  ] = useState<Partial<Record<string, VaultBranchFiltersState>>>({});

  useEffect(() => {
    if (!userVaultBranchFilters) {
      return;
    }

    const serverVaultBranchFiltersByVaultId = new Map<
      string,
      VaultBranchFiltersState
    >(
      userVaultBranchFilters.map((vaultBranchFilter) => [
        vaultBranchFilter.vaultId,
        normalizeVaultBranchFilters(vaultBranchFilter),
      ]),
    );

    setPendingVaultBranchFiltersByVaultId((previous) => {
      let hasChanges = false;
      const next = { ...previous };

      for (const [vaultId, pendingVaultBranchFilters] of Object.entries(
        previous,
      )) {
        const serverVaultBranchFilters =
          serverVaultBranchFiltersByVaultId.get(vaultId) ??
          getDefaultVaultBranchFilters();
        if (
          areVaultBranchFiltersEqual(
            pendingVaultBranchFilters,
            serverVaultBranchFilters,
          )
        ) {
          delete next[vaultId];
          hasChanges = true;
        }
      }

      return hasChanges ? next : previous;
    });
  }, [userVaultBranchFilters]);

  if (!vaults) {
    return null;
  }

  const persistedVaultBranchFiltersByVaultId = new Map<
    string,
    VaultBranchFiltersState
  >(
    (userVaultBranchFilters ?? []).map((vaultBranchFilter) => [
      vaultBranchFilter.vaultId,
      normalizeVaultBranchFilters(vaultBranchFilter),
    ]),
  );

  const saveVaultBranchFilters = async (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    const normalizedVaultBranchFilters = normalizeVaultBranchFilters(
      nextVaultBranchFilters,
    );
    setPendingVaultBranchFiltersByVaultId((previous) => ({
      ...previous,
      [vaultId]: normalizedVaultBranchFilters,
    }));

    try {
      await setVaultBranchFilters({
        vaultId,
        hiddenLabels: normalizedVaultBranchFilters.hiddenLabels,
        includeDrafts: normalizedVaultBranchFilters.includeDrafts,
        includeNoLabel: normalizedVaultBranchFilters.includeNoLabel,
        branchesExpanded: normalizedVaultBranchFilters.branchesExpanded,
      });
    } catch (error: unknown) {
      setPendingVaultBranchFiltersByVaultId((previous) => {
        const next = { ...previous };
        delete next[vaultId];
        return next;
      });
      toast({
        title: "Could not save filters",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleVaultDeveloperToolsOpenChange = (
    vaultId: Id<"vaults">,
    isOpen: boolean,
  ) => {
    setOpenDeveloperToolsByVaultId((prev) => ({
      ...prev,
      [vaultId]: isOpen,
    }));
  };

  const handleVaultBranchFiltersChange = (
    vaultId: Id<"vaults">,
    nextVaultBranchFilters: VaultBranchFiltersState,
  ) => {
    void saveVaultBranchFilters(vaultId, nextVaultBranchFilters);
  };

  const handleVaultRetryInfrastructure = (vaultId: Id<"vaults">) => {
    void handleRetryInfrastructure(vaultId);
  };

  const handleVaultDeleteIntent = (vault: VaultDashboardVault) => {
    setVaultToDelete({
      id: vault._id,
      repositoryFullName: vault.repositoryFullName,
      isNoterManaged: vault.isNoterManaged,
      hasConvexProvision: vault.hasConvexProvision,
      hasHostingProvision: vault.hasHostingProvision,
    });
    setRemoveGithubRepo(vault.isNoterManaged);
    setRemoveCodespaces(true);
    setRemoveConvexProvision(vault.isNoterManaged && vault.hasConvexProvision);
    setRemoveHostingProvision(
      vault.isNoterManaged && vault.hasHostingProvision,
    );
    setRemoveDaytonaResources(hasDaytonaResourcesForVault(vault));
    setCommitError(null);
    setDeleteError(null);
    setDidAttemptCommit(false);
  };

  const handleDeleteOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      return;
    }

    void navigate({
      replace: true,
      search: (currentSearch) => ({
        ...currentSearch,
        delete: undefined,
      }),
      to: "/",
    });
  };

  const sidebarContent = (
    <VaultDashboardSidebarContent>
      {user && accountEmail && accountDisplayName ? (
        <VaultDashboardAccountSection
          open={resolvedAccountPanelOpen}
          onOpenChange={handleAccountPanelOpenChange}
          displayName={accountDisplayName}
          email={accountEmail}
          providerLabel={accountProviderLabel}
          onSignOut={handleSignOut}
          isSignOutPending={isSigningOut}
          signOutDisabled={false}
        />
      ) : null}
      <VaultDashboardProvidersSection
        open={resolvedProvidersPanelOpen}
        onOpenChange={handleProvidersPanelOpenChange}
        providerRows={providerRows}
        footer={<CodexProviderRow />}
      />
      {createControl}
      <div className="mt-auto">
        <AppSidebarMetaSection
          showLandingPreviewLink
          showMachineLinks
          side="right"
        />
      </div>
    </VaultDashboardSidebarContent>
  );
  const dashboardBody = (
    <VaultDashboardBody
      developerToolsVisible={developerToolsVisible}
      isRemovingVault={isDeleting || isCommitting}
      now={now}
      themeColorSearch={rootRouteSearch}
      openDeveloperToolsByVaultId={openDeveloperToolsByVaultId}
      pendingVaultBranchFiltersByVaultId={pendingVaultBranchFiltersByVaultId}
      persistedVaultBranchFiltersByVaultId={
        persistedVaultBranchFiltersByVaultId
      }
      retryingVaultId={retryingVaultId}
      deleteRepositoryFullName={deleteRepositoryFullName}
      vaults={vaults}
      onDeleteVault={handleVaultDeleteIntent}
      onDeleteOpenChange={handleDeleteOpenChange}
      onOpenDeveloperToolsChange={handleVaultDeveloperToolsOpenChange}
      onRefreshVaultTree={refreshVaultTreeFromStatusClick}
      onRetryInfrastructure={handleVaultRetryInfrastructure}
      onSaveVaultBranchFilters={handleVaultBranchFiltersChange}
    />
  );

  return (
    <PublicLandingLogoLinkProvider>
      <PersistedSidebarProvider
        defaultState={DASHBOARD_SIDEBAR_DEFAULT_STATE}
        shortcutSidebarSide="right"
        workspaceKey="dashboard"
      >
        <WorkspaceLayoutV2FullPage
          right={{
            header: null,
            content: sidebarContent,
          }}
          main={{
            header: null,
            content: dashboardBody,
          }}
          panel={
            CHAT_ENABLED
              ? {
                  content: (
                    <EditorChatPanel
                      autoFocusInput={shouldAutoFocusChatInput}
                      onBusyStateChange={setIsGlobalChatBusy}
                      shellMode="embedded"
                    />
                  ),
                  closeDisabled: isGlobalChatBusy,
                  onOpenChange: handleGlobalChatOpenChange,
                  open: resolvedGlobalChatOpen,
                }
              : undefined
          }
        />
      </PersistedSidebarProvider>

      <Dialog
        open={vaultToDelete !== null}
        onOpenChange={() => {
          if (isDeleting || isCommitting) return;
          resetDeleteDialogState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vaultToDelete
                ? `Remove Vault ${vaultToDelete.repositoryFullName}`
                : "Remove Vault"}
            </DialogTitle>
            <DialogDescription>
              {hasStagedChanges
                ? `This vault has ${stagedChangesCount} uncommitted local change${stagedChangesCount === 1 ? "" : "s"}. You can commit ${stagedChangesCount === 1 ? "it" : "them"} now.`
                : "All local changes are already backed up on GitHub."}
            </DialogDescription>
          </DialogHeader>
          {vaultToDelete ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-github-repo"
                  checked={removeGithubRepo}
                  onCheckedChange={(checked) =>
                    setRemoveGithubRepo(checked === true)
                  }
                  disabled={
                    !vaultToDelete.isNoterManaged || isDeleting || isCommitting
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="remove-github-repo"
                  className="text-sm text-muted-foreground"
                >
                  Also remove GitHub repository
                  {!vaultToDelete.isNoterManaged ? (
                    <div className="text-xs text-muted-foreground">
                      Only available for repositories created in Noter.
                    </div>
                  ) : null}
                </label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-codespaces"
                  checked={
                    connectedCodespacesCount === 0 ? true : removeCodespaces
                  }
                  onCheckedChange={(checked) =>
                    setRemoveCodespaces(checked === true)
                  }
                  disabled={
                    connectedCodespacesCount === 0 || isDeleting || isCommitting
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="remove-codespaces"
                  className="text-sm text-muted-foreground"
                >
                  Also remove all Codespaces
                  {connectedCodespacesCount === undefined
                    ? null
                    : ` (${connectedCodespacesCount} connected)`}
                </label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="remove-daytona-resources"
                  checked={removeDaytonaResources}
                  onCheckedChange={(checked) =>
                    setRemoveDaytonaResources(checked === true)
                  }
                  disabled={isDeleting || isCommitting}
                  className="mt-0.5"
                />
                <label
                  htmlFor="remove-daytona-resources"
                  className="text-sm text-muted-foreground"
                >
                  Also remove Daytona sandboxes and snapshots
                  {!hasDaytonaResources ? (
                    <div className="text-xs text-muted-foreground">
                      We will try to remove any Daytona resources tied to this
                      vault.
                    </div>
                  ) : null}
                </label>
              </div>
              {vaultToDelete.hasConvexProvision ? (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="remove-convex-provision"
                    checked={removeConvexProvision}
                    onCheckedChange={(checked) =>
                      setRemoveConvexProvision(checked === true)
                    }
                    disabled={
                      !vaultToDelete.isNoterManaged ||
                      isDeleting ||
                      isCommitting
                    }
                    className="mt-0.5"
                  />
                  <label
                    htmlFor="remove-convex-provision"
                    className="text-sm text-muted-foreground"
                  >
                    Also remove Convex project/deployment
                    {!vaultToDelete.isNoterManaged ? (
                      <div className="text-xs text-muted-foreground">
                        Only available for infrastructure provisioned by Noter.
                      </div>
                    ) : null}
                  </label>
                </div>
              ) : null}
              {vaultToDelete.hasHostingProvision ? (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={removeHostingCheckboxId}
                    checked={removeHostingProvision}
                    onCheckedChange={(checked) =>
                      setRemoveHostingProvision(checked === true)
                    }
                    disabled={
                      !vaultToDelete.isNoterManaged ||
                      isDeleting ||
                      isCommitting
                    }
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={removeHostingCheckboxId}
                    className="text-sm text-muted-foreground"
                  >
                    {removeHostingLabel}
                    {!vaultToDelete.isNoterManaged ? (
                      <div className="text-xs text-muted-foreground">
                        Only available for infrastructure provisioned by Noter.
                      </div>
                    ) : null}
                  </label>
                </div>
              ) : null}
              {deleteError ? (
                <div className="text-sm text-red-600">{deleteError}</div>
              ) : null}
              {commitError ? (
                <div className="text-sm text-red-600">{commitError}</div>
              ) : null}
              {didAttemptCommit && hasStagedChanges ? (
                <div className="text-sm text-muted-foreground">
                  Some local changes are still uncommitted. You can retry commit
                  or remove anyway.
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isDeleting || isCommitting) return;
                resetDeleteDialogState();
              }}
              disabled={isDeleting || isCommitting}
            >
              Cancel
            </Button>
            {vaultToDelete && hasStagedChanges ? (
              <Button
                variant="outline"
                onClick={() => {
                  void handleCommitBeforeRemove();
                }}
                disabled={isDeleting || isCommitting}
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Committing...
                  </>
                ) : (
                  "Commit changes"
                )}
              </Button>
            ) : null}
            <Button
              variant="destructive"
              onClick={() => {
                void handleRemoveVault();
              }}
              disabled={isDeleting || isCommitting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Vault"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {apiKeyDialog}
    </PublicLandingLogoLinkProvider>
  );
}
