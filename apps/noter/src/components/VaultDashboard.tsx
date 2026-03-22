import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/button-group";
import { Checkbox } from "@/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { Input } from "@/components/input";
import {
  GitHubLogoIcon,
  TrashIcon,
  UpdateIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  formatRelativeTimeAgo,
  formatRelativeTimeAgoWithSeconds,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import {
  CLOUDFLARE_TOKEN_REFRESH_EARLY_WINDOW_MS,
  CLOUDFLARE_TOKEN_REFRESH_SCHEDULER_TICK_MS,
} from "../../shared/cloudflareTokenRefresh";
import { getRemoteBranchDeleteEligibility } from "../../shared/remoteBranchDelete";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import type { DaytonaSnapshotStatus } from "@/lib/daytonaSnapshot";
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
  type CSSProperties,
  type ComponentType,
  type MutableRefObject,
} from "react";
import { isInIframe } from "@/authClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { CodespaceStatus } from "@/components/CodespaceStatus";
import { DashboardSidebarSection } from "@/components/DashboardSidebarSection";
import { DashboardWorkspaceFrame } from "@/components/DashboardWorkspaceFrame";
import { DaytonaSnapshotBanner } from "@/components/DaytonaSnapshotBanner";
import { DaytonaWorkspaceButton } from "@/components/DaytonaWorkspaceButton";
import { DaytonaSnapshotList } from "@/components/DaytonaSnapshotList";
import { CodexProviderRow } from "@/components/CodexProviderRow";
import { EditedFilesCategoriesPopover } from "@/components/EditedFilesCategories";
import { UserMenu } from "@/components/UserMenu";
import {
  useApiKeyConnectDialog,
  type ApiKeyProvider,
} from "@/components/ApiKeyConnectDialog";
import type { Id } from "../../convex/_generated/dataModel";
import { buildVaultCodespaceChatRoute } from "@/lib/vaultRoutes";

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

type CreateTemplate = "app" | "agent";
const SIDEBAR_PANEL_KEYS = ["providers", "account", "newProject"] as const;
type SidebarPanelKey = (typeof SIDEBAR_PANEL_KEYS)[number];
type SidebarPanelState = Record<SidebarPanelKey, boolean>;

const isCreateTemplate = (value: string): value is CreateTemplate =>
  value === "app" || value === "agent";

const DASHBOARD_REFRESH_CONCURRENCY = 3;
type RefreshTrigger = "focus" | "page_load";
const PROVIDER_KEYS = ["github", "convex", "cloudflare"] as const;
type ProviderKey = (typeof PROVIDER_KEYS)[number];
type ProviderMetadata = {
  label: string;
  oauthButtonLabel: string;
  popupName: string;
  completionEventType: string;
  icon: ComponentType<{ className?: string }>;
  apiKeyProvider: ApiKeyProvider | null;
};
type ProviderRuntimeConfig = {
  getOAuthUrl: () => Promise<string>;
  disconnect: () => Promise<unknown>;
  popupRef: MutableRefObject<Window | null>;
  popupOriginRef: MutableRefObject<string | null>;
};

const hasActiveTextSelection = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
};

const getCurrentSecondTimestamp = () => Math.floor(Date.now() / 1000) * 1000;

const GitHubProviderLogo = ({ className }: { className?: string }) => (
  <GitHubLogoIcon className={clsx("h-4 w-4", className)} />
);

const ConvexProviderLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center justify-center", className)}>
    <svg
      aria-hidden="true"
      viewBox="47 43 54 60"
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M82.2808 87.6516C89.652 86.8381 96.6012 82.9352 100.427 76.421C98.6156 92.533 80.8853 102.717 66.413 96.4643C65.0795 95.8897 63.9316 94.9339 63.1438 93.705C59.8915 88.6302 58.8224 82.1729 60.3585 76.3129C64.7475 83.8398 73.6717 88.4538 82.2808 87.6516Z"
        fill="#F3B01C"
      />
      <path
        d="M60.0895 71.5852C57.1016 78.4465 56.9722 86.4797 60.6353 93.0906C47.7442 83.453 47.8848 62.8294 60.4778 53.2885C61.6425 52.4067 63.0267 51.8833 64.4785 51.8036C70.4486 51.4907 76.5144 53.7835 80.7683 58.0561C72.1254 58.1415 63.7076 63.643 60.0895 71.5852Z"
        fill="#8D2676"
      />
      <path
        d="M84.9366 60.1673C80.5757 54.1253 73.7503 50.0119 66.2722 49.8868C80.7277 43.3669 98.5086 53.9375 100.444 69.5659C100.624 71.0167 100.388 72.4959 99.7409 73.8044C97.04 79.2547 92.032 83.4819 86.1801 85.0464C90.4678 77.144 89.9388 67.4893 84.9366 60.1673Z"
        fill="#EE342F"
      />
    </svg>
  </span>
);

const CloudflareProviderLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center justify-center", className)}>
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

/**
 * Keeps the ticking relative-time label stable while the user is selecting it,
 * then falls back to a normal navigation refresh on a plain click.
 */
function VaultLastUpdatedStatus({
  lastSyncedAt,
  now,
  repositoryFullName,
}: {
  lastSyncedAt: number;
  now: number;
  repositoryFullName: string;
}) {
  const [frozenNow, setFrozenNow] = useState<number | null>(null);
  const isPointerDownRef = useRef(false);
  const refreshHref =
    typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  useEffect(() => {
    const handleSelectionChange = () => {
      if (hasActiveTextSelection()) {
        setFrozenNow((current) => current ?? getCurrentSecondTimestamp());
        return;
      }

      if (!isPointerDownRef.current) {
        setFrozenNow(null);
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      if (!hasActiveTextSelection()) {
        setFrozenNow(null);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return (
    <a
      href={refreshHref}
      className="inline-flex cursor-pointer select-text items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      title={`Last synced ${new Date(lastSyncedAt).toLocaleString()}. Click to refresh now.`}
      aria-label={`Refresh ${repositoryFullName} now`}
      onPointerDown={() => {
        isPointerDownRef.current = true;
        setFrozenNow((current) => current ?? getCurrentSecondTimestamp());
      }}
      onClick={(event) => {
        if (hasActiveTextSelection()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }}
    >
      <span>Updated</span>
      <span className="min-w-[8ch] text-left font-mono tabular-nums">
        {formatRelativeTimeAgoWithSeconds(lastSyncedAt, frozenNow ?? now)}
      </span>
    </a>
  );
}

const PROVIDER_METADATA: Record<ProviderKey, ProviderMetadata> = {
  github: {
    label: "GitHub",
    oauthButtonLabel: "GitHub OAuth",
    popupName: "github-oauth",
    completionEventType: "github-oauth-complete",
    icon: GitHubProviderLogo,
    apiKeyProvider: "github",
  },
  convex: {
    label: "Convex",
    oauthButtonLabel: "Convex OAuth",
    popupName: "convex-oauth",
    completionEventType: "convex-oauth-complete",
    icon: ConvexProviderLogo,
    apiKeyProvider: "convex",
  },
  cloudflare: {
    label: "Cloudflare",
    oauthButtonLabel: "Cloudflare MCP OAuth",
    popupName: "cloudflare-mcp-oauth",
    completionEventType: "cloudflare-mcp-oauth-complete",
    icon: CloudflareProviderLogo,
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
}

interface VaultBranchLinkRowProps {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  branchName: string;
  headCommitSha: string;
  isDefault: boolean;
  isDeletedUpstream: boolean;
  aheadBy?: number;
  behindBy?: number;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  pullRequestLabels?: Array<string | { name: string; color?: string }>;
  stagedSummary?: StagedSummary;
  canDeleteBranch: boolean;
  isDeletingBranch: boolean;
  onDeleteBranch: () => void;
}

type PullRequestLabelDisplay = {
  name: string;
  color?: string;
};

function formatAheadBehindCounts(
  aheadBy: number | undefined,
  behindBy: number | undefined,
): string | null {
  if (typeof aheadBy !== "number" || typeof behindBy !== "number") {
    return null;
  }
  return `↑${aheadBy} ↓${behindBy}`;
}

function normalizePullRequestLabelColor(
  color: string | undefined,
): string | undefined {
  if (typeof color !== "string") {
    return undefined;
  }

  const normalizedColor = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return undefined;
  }

  return `#${normalizedColor.toLowerCase()}`;
}

function normalizePullRequestLabels(
  labels: VaultBranchLinkRowProps["pullRequestLabels"],
): PullRequestLabelDisplay[] {
  const labelsByName = new Map<string, PullRequestLabelDisplay>();

  for (const label of labels ?? []) {
    const name = typeof label === "string" ? label : label.name;
    if (typeof name !== "string" || name.length === 0) {
      continue;
    }

    const color =
      typeof label === "string"
        ? undefined
        : normalizePullRequestLabelColor(label.color);
    const existing = labelsByName.get(name);
    if (!existing || (typeof color === "string" && existing.color !== color)) {
      labelsByName.set(name, { name, color });
    }
  }

  return Array.from(labelsByName.values());
}

function getHexColorLuminance(color: string): number {
  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(color.slice(index + 1, index + 3), 16),
  );
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
  );
}

function getContrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLabelTextColor(backgroundColor: string): string {
  const lightTextColor = "#ffffff";
  const darkTextColor = "#1f2328";
  const backgroundLuminance = getHexColorLuminance(backgroundColor);
  const lightContrast = getContrastRatio(backgroundLuminance, 1);
  const darkContrast = getContrastRatio(
    backgroundLuminance,
    getHexColorLuminance(darkTextColor),
  );

  return darkContrast >= lightContrast ? darkTextColor : lightTextColor;
}

function buildPullRequestLabelStyle(
  color: string | undefined,
): CSSProperties | undefined {
  if (typeof color !== "string") {
    return undefined;
  }

  return {
    backgroundColor: color,
    borderColor: color,
    color: getLabelTextColor(color),
  };
}

export function VaultBranchLinkRow({
  vaultId,
  repositoryFullName,
  branchName,
  headCommitSha,
  isDefault,
  isDeletedUpstream,
  aheadBy,
  behindBy,
  pullRequestUrl,
  pullRequestNumber,
  pullRequestLabels,
  stagedSummary,
  canDeleteBranch,
  isDeletingBranch,
  onDeleteBranch,
}: VaultBranchLinkRowProps) {
  const hasStagedChanges = (stagedSummary?.total ?? 0) > 0;
  const commitUrl = `https://github.com/${repositoryFullName}/commit/${headCommitSha}`;
  const aheadBehindLabel = formatAheadBehindCounts(aheadBy, behindBy);
  const pullRequestLabel =
    typeof pullRequestNumber === "number" ? `#${pullRequestNumber}` : "PR";
  const normalizedPullRequestLabels =
    normalizePullRequestLabels(pullRequestLabels);
  const branchPath = encodeURIComponent(branchName);
  const branchRoute = `/vault/${repositoryFullName}/${branchPath}`;

  return (
    <div className="flex items-start gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0">
      {isDeletedUpstream ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground/70 line-through">
            {branchName}
          </span>
          <span className="shrink-0 corner-notch-1 border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">
            deleted upstream
          </span>
        </div>
      ) : (
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={branchRoute}
            className={clsx(
              "block truncate text-sm text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-current",
              isDefault && "font-medium text-foreground",
            )}
          >
            {branchName}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
            <a
              href={commitUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={`font-mono ${linkStyle}`}
              title="View commit on GitHub"
            >
              {headCommitSha.slice(0, 7)}
            </a>
            {typeof pullRequestUrl === "string" && pullRequestUrl.length > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={pullRequestUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={clsx("font-mono", linkStyle)}
                  title="Open pull request"
                >
                  {pullRequestLabel}
                </a>
              </>
            ) : null}
            {normalizedPullRequestLabels.length > 0
              ? normalizedPullRequestLabels.map((label) => (
                  <Badge
                    key={label.name}
                    variant="outline"
                    className="h-5 max-w-48 px-1.5 py-0 text-[10px] font-medium"
                    style={buildPullRequestLabelStyle(label.color)}
                    title={label.name}
                  >
                    <span className="truncate">{label.name}</span>
                  </Badge>
                ))
              : null}
            {aheadBehindLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="font-mono tabular-nums"
                  title="Ahead/behind versus the default branch"
                >
                  {aheadBehindLabel}
                </span>
              </>
            ) : null}
          </div>
        </div>
      )}
      <div className="flex shrink-0 items-start gap-2">
        {hasStagedChanges ? (
          <div className="pt-0.5">
            <EditedFilesCategoriesPopover
              vaultId={vaultId}
              repositoryFullName={repositoryFullName}
              branch={branchName}
              summaryCounts={stagedSummary}
            />
          </div>
        ) : (
          <span className="w-4 pt-1 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
            0
          </span>
        )}
        {canDeleteBranch ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
            onClick={onDeleteBranch}
            disabled={isDeletingBranch}
            aria-label={`Delete branch ${branchName}`}
            title="Delete branch on GitHub"
          >
            {isDeletingBranch ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface VaultBranchListProps {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  remoteBranches: VaultRemoteBranchListItem[];
  activeDeletingBranchName: string | null;
  onDeleteBranch: (branchName: string) => void;
}

interface VaultBranchListRowProps {
  branch: VaultRemoteBranchListItem;
  vaultId: Id<"vaults">;
  repositoryFullName: string;
  stagedSummary?: StagedSummary;
  activeDeletingBranchName: string | null;
  onDeleteBranch: (branchName: string) => void;
}

function VaultBranchListRow({
  branch,
  vaultId,
  repositoryFullName,
  stagedSummary,
  activeDeletingBranchName,
  onDeleteBranch,
}: VaultBranchListRowProps) {
  const deleteEligibility = getRemoteBranchDeleteEligibility({
    remoteState: branch.remoteState,
    isDefault: branch.isDefault,
    isProtected: branch.isProtected,
    stagedFilesCount: stagedSummary?.total ?? 0,
    aheadBy: branch.aheadBy,
  });

  return (
    <VaultBranchLinkRow
      key={branch.name}
      vaultId={vaultId}
      repositoryFullName={repositoryFullName}
      branchName={branch.name}
      headCommitSha={branch.headCommitSha}
      isDefault={branch.isDefault}
      isDeletedUpstream={branch.remoteState === "deleted_upstream"}
      aheadBy={branch.aheadBy}
      behindBy={branch.behindBy}
      pullRequestUrl={branch.pullRequestUrl}
      pullRequestNumber={branch.pullRequestNumber}
      pullRequestLabels={branch.pullRequestLabels}
      stagedSummary={stagedSummary}
      canDeleteBranch={deleteEligibility.canDelete}
      isDeletingBranch={activeDeletingBranchName === branch.name}
      onDeleteBranch={() => onDeleteBranch(branch.name)}
    />
  );
}

function VaultBranchList({
  vaultId,
  repositoryFullName,
  remoteBranches,
  activeDeletingBranchName,
  onDeleteBranch,
}: VaultBranchListProps) {
  const stagedSummaries =
    useQuery(api.fileStaging.listStagedFilesBranchSummaries, {
      vaultId,
    }) ?? [];
  const summaryByBranch = new Map(
    stagedSummaries.map((summary) => [summary.branch, summary.counts]),
  );

  return (
    <div className="overflow-hidden corner-notch-1 border border-border/60 bg-muted/20">
      {remoteBranches.map((branch) => (
        <VaultBranchListRow
          key={branch.name}
          branch={branch}
          vaultId={vaultId}
          repositoryFullName={repositoryFullName}
          stagedSummary={summaryByBranch.get(branch.name)}
          activeDeletingBranchName={activeDeletingBranchName}
          onDeleteBranch={onDeleteBranch}
        />
      ))}
    </div>
  );
}

export function VaultDashboard() {
  const vaults = useQuery(api.vault.getUserVaults);
  const now = useNow();
  const deleteVault = useAction(api.vaultActions.deleteVault);
  const createRepository = useAction(api.vaultActions.createRepository);
  const retryInfrastructureProvisioning = useAction(
    api.vaultActions.retryInfrastructureProvisioning,
  );
  const deleteRemoteBranch = useAction(api.vaultActions.deleteRemoteBranch);
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
  const setProvidersPanelOpen = useMutation(
    api.dashboardSettings.setProvidersPanelOpen,
  );
  const setAccountPanelOpen = useMutation(
    api.dashboardSettings.setAccountPanelOpen,
  );
  const setNewProjectPanelOpen = useMutation(
    api.dashboardSettings.setNewProjectPanelOpen,
  );
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
  );
  const user = useConvexQuery(api.users.viewer);
  const dashboardSettings = useConvexQuery(
    api.dashboardSettings.getDashboardSettings,
  );
  const githubPopupRef = useRef<Window | null>(null);
  const convexPopupRef = useRef<Window | null>(null);
  const cloudflarePopupRef = useRef<Window | null>(null);
  const githubPopupOriginRef = useRef<string | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const cloudflarePopupOriginRef = useRef<string | null>(null);
  const providerRuntimeConfig: Record<ProviderKey, ProviderRuntimeConfig> = {
    github: {
      getOAuthUrl: getGithubOAuthUrl,
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
  const [vaultToDelete, setVaultToDelete] = useState<{
    id: Id<"vaults">;
    repositoryFullName: string;
    isNoterManaged: boolean;
    hasConvexProvision: boolean;
    hasHostingProvision: boolean;
  } | null>(null);
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);
  const [removeCodespaces, setRemoveCodespaces] = useState(false);
  const [removeConvexProvision, setRemoveConvexProvision] = useState(false);
  const [removeHostingProvision, setRemoveHostingProvision] = useState(false);
  const [removeDaytonaResources, setRemoveDaytonaResources] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<{
    vaultId: Id<"vaults">;
    repositoryFullName: string;
    branchName: string;
  } | null>(null);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [createTemplate, setCreateTemplate] = useState<CreateTemplate>("app");
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
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBranchError, setDeleteBranchError] = useState<string | null>(
    null,
  );
  const [didAttemptCommit, setDidAttemptCommit] = useState(false);
  const [retryingVaultId, setRetryingVaultId] = useState<Id<"vaults"> | null>(
    null,
  );
  const [openDeveloperToolsByVaultId, setOpenDeveloperToolsByVaultId] =
    useState<Partial<Record<Id<"vaults">, boolean>>>({});
  const [sidebarPanelState, setSidebarPanelState] =
    useState<SidebarPanelState | null>(null);
  const sidebarPanelPendingRef = useRef<Partial<SidebarPanelState>>({});
  const cloudflareAutoCheckInFlightRef = useRef(false);

  useEffect(() => {
    if (dashboardSettings === undefined) {
      return;
    }

    const serverState: SidebarPanelState = {
      providers: dashboardSettings.providersPanelOpen,
      account: dashboardSettings.accountPanelOpen,
      newProject: dashboardSettings.newProjectPanelOpen,
    };
    if (
      SIDEBAR_PANEL_KEYS.some((panel) => {
        const pendingState = sidebarPanelPendingRef.current[panel];
        return (
          pendingState !== undefined && serverState[panel] !== pendingState
        );
      })
    ) {
      return;
    }

    sidebarPanelPendingRef.current = {};
    setSidebarPanelState(serverState);
  }, [dashboardSettings]);

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
    (trigger: RefreshTrigger = "focus") => {
      if (!vaults || vaults.length === 0) {
        return;
      }

      const readyVaults = vaults.filter((vault) => vault.state === "ready");
      const vaultsToRefresh = readyVaults.filter((vault) =>
        claimRefreshDebounce("dashboard", vault.repositoryFullName),
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
              await refreshTree({
                owner: vault.ghRepoOwner,
                repo: vault.ghRepoName,
                trigger,
              }).catch((error: unknown) => {
                console.error(
                  "Failed to refresh repository tree from dashboard:",
                  error,
                );
                releaseRefreshDebounce("dashboard", vault.repositoryFullName);
              });
            }),
          );
        }
      })();
    },
    [refreshTree, vaults],
  );

  useEffect(() => {
    if (!vaults || vaults.length === 0) {
      return;
    }

    const handleFocus = () => {
      refreshVaultTreesIfNeeded();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVaultTreesIfNeeded();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (document.visibilityState === "visible") {
      refreshVaultTreesIfNeeded("page_load");
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
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
      ? vaults.find(
          (vault: (typeof vaults)[0]) => vault._id === vaultToDelete.id,
        ) ?? null
      : null;
  const stagedChangesCount = selectedVault?.fileCount ?? 0;
  const hasStagedChanges = stagedChangesCount > 0;
  const hasDaytonaResources = hasDaytonaResourcesForVault(selectedVault);
  const removeHostingCheckboxId = "remove-cloudflare-provision";
  const removeHostingLabel = "Also remove Cloudflare Pages project";
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
  const resetDeleteBranchDialogState = () => {
    setBranchToDelete(null);
    setDeleteBranchError(null);
  };

  const connectedCodespacesCount = useConvexQuery(
    api.codespacesMutations.getConnectedCodespacesCount,
    vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );

  const handleConnect = async (provider: ProviderKey) => {
    const providerConfig = providerRuntimeConfig[provider];
    const providerMetadata = PROVIDER_METADATA[provider];
    if (createError) {
      setCreateError(null);
    }
    try {
      const oauthUrl = await providerConfig.getOAuthUrl();
      if (isInIframe()) {
        providerConfig.popupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        providerConfig.popupRef.current = window.open(
          oauthUrl,
          providerMetadata.popupName,
          "width=600,height=700,popup=true",
        );
        return;
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

  const handleRemoveBranch = async () => {
    if (!branchToDelete || isDeletingBranch) return;
    setDeleteBranchError(null);
    try {
      setIsDeletingBranch(true);
      await deleteRemoteBranch({
        vaultId: branchToDelete.vaultId,
        branchName: branchToDelete.branchName,
      });
      resetDeleteBranchDialogState();
    } catch (error) {
      console.error("Failed to delete remote branch:", error);
      setDeleteBranchError(
        error instanceof Error ? error.message : "Failed to delete branch",
      );
    } finally {
      setIsDeletingBranch(false);
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
        `Connect GitHub, Convex, and ${requiredHostingConnectionLabel} before creating ${createTemplateArticle}.`,
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        private: true,
        templateType: createTemplate,
      });
      setNewRepositoryName("");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to create ${createTemplate}`,
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
  const showCloudflareCreateWarning =
    cloudflareConnected &&
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
  const userDisplayName =
    user?.name ?? user?.email ?? user?.githubUsername ?? "...";
  const createTemplateLabel = createTemplate === "app" ? "App" : "Agent";
  const createTemplateArticle =
    createTemplate === "app" ? "an app" : "an agent";
  const createPlaceholder = `${createTemplateLabel} name`;
  const createButtonLabel = isCreating
    ? `Creating ${createTemplate}...`
    : `Create ${createTemplate}`;
  const { openApiKeyDialog, apiKeyDialog } = useApiKeyConnectDialog({
    connectGithubWithApiKey,
    connectConvexWithApiKey,
  });
  const resolvedSidebarPanelState: SidebarPanelState = {
    providers:
      sidebarPanelState?.providers ??
      dashboardSettings?.providersPanelOpen ??
      false,
    account:
      sidebarPanelState?.account ??
      dashboardSettings?.accountPanelOpen ??
      false,
    newProject:
      sidebarPanelState?.newProject ??
      dashboardSettings?.newProjectPanelOpen ??
      false,
  };
  const handleSidebarPanelOpenChange = (
    panel: SidebarPanelKey,
    isOpen: boolean,
  ) => {
    setSidebarPanelState((prev) => ({
      ...(prev ?? resolvedSidebarPanelState),
      [panel]: isOpen,
    }));
    sidebarPanelPendingRef.current = {
      ...sidebarPanelPendingRef.current,
      [panel]: isOpen,
    };

    const persistOpenState =
      panel === "providers"
        ? setProvidersPanelOpen
        : panel === "account"
          ? setAccountPanelOpen
          : setNewProjectPanelOpen;

    void persistOpenState({ isOpen }).catch((error: unknown) => {
      console.error(`Failed to persist ${panel} panel state:`, error);
      delete sidebarPanelPendingRef.current[panel];
      setSidebarPanelState({
        providers: dashboardSettings?.providersPanelOpen ?? false,
        account: dashboardSettings?.accountPanelOpen ?? false,
        newProject: dashboardSettings?.newProjectPanelOpen ?? false,
      });
    });
  };
  const createControl = (
    <DashboardSidebarSection
      title="New Project"
      open={resolvedSidebarPanelState.newProject}
      onOpenChange={(isOpen) =>
        handleSidebarPanelOpenChange("newProject", isOpen)
      }
    >
      <div className="flex flex-col items-start gap-2">
        <ButtonGroup className="w-full">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" variant="outline">
                {createTemplateLabel}
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={createTemplate}
                onValueChange={(value) => {
                  if (!isCreateTemplate(value)) return;
                  setCreateTemplate(value);
                  if (createError) {
                    setCreateError(null);
                  }
                }}
              >
                <DropdownMenuRadioItem value="app">App</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="agent">
                  Agent
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            onClick={() => {
              void handleCreateRepository();
            }}
            disabled={
              isCreating ||
              newRepositoryName.trim().length === 0 ||
              !canCreateRepo
            }
          >
            {createButtonLabel}
          </Button>
          <ButtonGroupSeparator className="bg-primary-foreground/30" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="px-2" aria-label="More actions">
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {githubConnected ? (
                <DropdownMenuItem asChild>
                  <Link to="/add">Connect existing repo</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  Connect existing repo
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
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
      </div>
      {!canCreateRepo && (
        <div className="mt-3 text-xs text-muted-foreground">
          {`Connect GitHub, Convex, and ${requiredHostingConnectionLabel} to create apps or agents.`}
        </div>
      )}
      {showCloudflareCreateWarning && (
        <div className="mt-3 text-xs text-amber-700">
          Cloudflare token is invalid or expired. Reconnect Cloudflare.
        </div>
      )}
      {createError ? (
        <div className="mt-3 text-sm text-red-600">{createError}</div>
      ) : null}
    </DashboardSidebarSection>
  );

  const connectionPanel = (
    <DashboardSidebarSection
      title="Providers"
      open={resolvedSidebarPanelState.providers}
      onOpenChange={(isOpen) =>
        handleSidebarPanelOpenChange("providers", isOpen)
      }
    >
      <div className="space-y-3">
        {PROVIDER_KEYS.map((provider) => {
          const providerMetadata = PROVIDER_METADATA[provider];
          const providerState = providerConnectionState[provider];
          const Icon = providerMetadata.icon;
          const apiKeyProvider = providerMetadata.apiKeyProvider;
          return (
            <div
              key={provider}
              className="corner-notch-1 border border-border/50 bg-background p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-5 w-11 shrink-0 items-center justify-center">
                  <Icon className="max-h-full max-w-full" />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden text-left">
                  <div className="text-sm font-medium">
                    {providerMetadata.label}
                  </div>
                  <div className="break-words text-xs leading-5 text-muted-foreground">
                    {providerState.status}
                  </div>
                </div>
              </div>
              {providerState.connected ? (
                providerState.showTokenCheck ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCheckCloudflareToken()}
                      disabled={
                        disconnectingProvider !== null ||
                        isCheckingCloudflareToken ||
                        isAutoCheckingCloudflareToken
                      }
                      className="w-full justify-center"
                    >
                      {isCheckingCloudflareToken ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        "Check token"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDisconnect(provider)}
                      disabled={
                        disconnectingProvider !== null ||
                        isCheckingCloudflareToken ||
                        isAutoCheckingCloudflareToken
                      }
                      className="w-full justify-center"
                    >
                      {disconnectingProvider === provider ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDisconnect(provider)}
                      disabled={disconnectingProvider !== null}
                      className="w-full justify-center"
                    >
                      {disconnectingProvider === provider ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  </div>
                )
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleConnect(provider)}
                    disabled={disconnectingProvider !== null}
                    className="w-full justify-center"
                  >
                    {providerMetadata.oauthButtonLabel}
                  </Button>
                  {apiKeyProvider ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openApiKeyDialog(apiKeyProvider)}
                      disabled={disconnectingProvider !== null}
                      className="w-full justify-center"
                    >
                      Use API key
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
        <CodexProviderRow />
      </div>
    </DashboardSidebarSection>
  );

  if (!vaults) {
    return null;
  }

  const projectCountLabel =
    vaults.length === 1 ? "1 project" : `${vaults.length} projects`;
  const accountPanel = user ? (
    <DashboardSidebarSection
      title="Account"
      open={resolvedSidebarPanelState.account}
      onOpenChange={(isOpen) => handleSidebarPanelOpenChange("account", isOpen)}
    >
      <UserMenu className="w-full justify-between">{userDisplayName}</UserMenu>
    </DashboardSidebarSection>
  ) : null;

  return (
    <div className="h-full">
      <DashboardWorkspaceFrame
        headerTitle="Projects"
        headerSubtitle={projectCountLabel}
        sidebarContent={
          <>
            {accountPanel}
            {connectionPanel}
            {createControl}
          </>
        }
      >
        {vaults.length === 0 ? (
          <div className="corner-notch-1 border border-dashed border-border/70 bg-muted/10 p-6">
            <h2 className="text-base font-medium">No projects yet</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Use the sidebar to create a new app or connect an existing
              repository.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {vaults.map((vault: (typeof vaults)[0]) => {
              const isReady = vault.state === "ready";
              const remoteBranches = Array.isArray(vault.remoteBranches)
                ? vault.remoteBranches
                : [];
              const activeRemoteBranches = remoteBranches.filter(
                (branch) => branch.remoteState === "active",
              );
              const defaultBranch = activeRemoteBranches.find(
                (branch) => branch.isDefault,
              )?.name;
              const primaryBranch =
                defaultBranch || activeRemoteBranches[0]?.name || "";
              const chatRoute =
                primaryBranch.length > 0
                  ? buildVaultCodespaceChatRoute({
                      repositoryFullName: vault.repositoryFullName,
                      branch: primaryBranch,
                    })
                  : null;
              const githubRepositoryUrl = `https://github.com/${vault.ghRepoOwner}/${vault.ghRepoName}`;
              const developerToolsOpen =
                openDeveloperToolsByVaultId[vault._id] ?? false;
              const infraActionLabel = vault.isNoterManaged
                ? getInfraActionLabel(vault.infraState)
                : null;
              const sharedLastSyncedAt = vault.lastTreeRefreshAt;
              const isVaultSyncing =
                typeof vault.treeRefreshStartedAt === "number" &&
                now - vault.treeRefreshStartedAt < TREE_REFRESH_STALE_LOCK_MS;
              return (
                <div
                  key={vault._id}
                  className={clsx(
                    "relative corner-notch-1 border p-4",
                    !isReady && "bg-muted/30 opacity-75",
                  )}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove vault ${vault.repositoryFullName}`}
                    onClick={() => {
                      setVaultToDelete({
                        id: vault._id,
                        repositoryFullName: vault.repositoryFullName,
                        isNoterManaged: vault.isNoterManaged,
                        hasConvexProvision: vault.hasConvexProvision,
                        hasHostingProvision: vault.hasHostingProvision,
                      });
                      setRemoveGithubRepo(vault.isNoterManaged);
                      setRemoveCodespaces(true);
                      setRemoveConvexProvision(
                        vault.isNoterManaged && vault.hasConvexProvision,
                      );
                      setRemoveHostingProvision(
                        vault.isNoterManaged && vault.hasHostingProvision,
                      );
                      setRemoveDaytonaResources(
                        hasDaytonaResourcesForVault(vault),
                      );
                      setCommitError(null);
                      setDeleteError(null);
                      setDidAttemptCommit(false);
                    }}
                    className="absolute right-4 top-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                  </Button>

                  <div className="space-y-3">
                    <div className="flex flex-col items-start pr-10">
                      <a
                        href={githubRepositoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex min-w-0 flex-col items-start ${linkStyle}`}
                        title={`Open ${vault.repositoryFullName} on GitHub`}
                      >
                        <span className="text-sm text-muted-foreground">
                          {vault.ghRepoOwner}/
                        </span>

                        <h3 className="font-semibold">
                          <span className="flex min-w-0 items-center gap-2">
                            {!isReady && (
                              <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                            )}
                            <span className="min-w-0 truncate">
                              {vault.ghRepoName}
                            </span>
                            {!isReady && (
                              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                (setting up...)
                              </span>
                            )}
                          </span>
                        </h3>
                      </a>
                      {isReady && (isVaultSyncing || sharedLastSyncedAt) ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {isVaultSyncing ? (
                            <>
                              <UpdateIcon className="h-3 w-3 animate-spin" />
                              <span>Syncing...</span>
                            </>
                          ) : typeof sharedLastSyncedAt === "number" ? (
                            <VaultLastUpdatedStatus
                              lastSyncedAt={sharedLastSyncedAt}
                              now={now}
                              repositoryFullName={vault.repositoryFullName}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {isReady && remoteBranches.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                          Branches
                        </p>
                        <VaultBranchList
                          vaultId={vault._id}
                          repositoryFullName={vault.repositoryFullName}
                          remoteBranches={remoteBranches}
                          activeDeletingBranchName={
                            isDeletingBranch &&
                            branchToDelete?.vaultId === vault._id
                              ? branchToDelete.branchName
                              : null
                          }
                          onDeleteBranch={(branchName) => {
                            setBranchToDelete({
                              vaultId: vault._id,
                              repositoryFullName: vault.repositoryFullName,
                              branchName,
                            });
                            setDeleteBranchError(null);
                          }}
                        />
                      </div>
                    )}

                    {isReady && primaryBranch.length > 0 && (
                      <DaytonaSnapshotBanner
                        branch={primaryBranch}
                        commitSha={vault.commitSHA}
                        snapshotName={vault.daytonaCurrentSnapshotName}
                        snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                        lastError={vault.daytonaCurrentSnapshotLastError}
                      />
                    )}

                    {isReady && (
                      <Collapsible
                        className="space-y-1.5"
                        open={developerToolsOpen}
                        onOpenChange={(isOpen: boolean) => {
                          setOpenDeveloperToolsByVaultId((prev) => ({
                            ...prev,
                            [vault._id]: isOpen,
                          }));
                        }}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180"
                          >
                            Developer tools
                            <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent
                          forceMount
                          className="space-y-1.5 data-[state=closed]:hidden"
                        >
                          <CodespaceStatus
                            vaultId={vault._id}
                            repositoryFullName={vault.repositoryFullName}
                          />
                          {primaryBranch.length > 0 && (
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
                          )}
                          <DaytonaSnapshotList vaultId={vault._id} />
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
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {(infraActionLabel ||
                      (developerToolsOpen && chatRoute)) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {developerToolsOpen && chatRoute && (
                          <Button asChild variant="outline" size="sm">
                            <Link to={chatRoute}>Chat</Link>
                          </Button>
                        )}
                        {infraActionLabel && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void handleRetryInfrastructure(vault._id);
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardWorkspaceFrame>

      <Dialog
        open={branchToDelete !== null}
        onOpenChange={() => {
          if (isDeletingBranch) return;
          resetDeleteBranchDialogState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {branchToDelete
                ? `Delete Branch ${branchToDelete.branchName}`
                : "Delete Branch"}
            </DialogTitle>
            <DialogDescription>
              {branchToDelete
                ? `This will delete ${branchToDelete.branchName} from GitHub for ${branchToDelete.repositoryFullName}.`
                : "This will delete the selected branch from GitHub."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Only branches with no staged files and no commits ahead of the
              default branch can be deleted here.
            </p>
            {deleteBranchError ? (
              <div className="text-sm text-red-600">{deleteBranchError}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isDeletingBranch) return;
                resetDeleteBranchDialogState();
              }}
              disabled={isDeletingBranch}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleRemoveBranch();
              }}
              disabled={isDeletingBranch}
            >
              {isDeletingBranch ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Branch"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!vaultToDelete}
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
          {vaultToDelete && (
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
                  {!vaultToDelete.isNoterManaged && (
                    <div className="text-xs text-muted-foreground">
                      Only available for repositories created in Noter.
                    </div>
                  )}
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
                  {!hasDaytonaResources && (
                    <div className="text-xs text-muted-foreground">
                      We will try to remove any Daytona resources tied to this
                      vault.
                    </div>
                  )}
                </label>
              </div>
              {vaultToDelete.hasConvexProvision && (
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
                    {!vaultToDelete.isNoterManaged && (
                      <div className="text-xs text-muted-foreground">
                        Only available for infrastructure provisioned by Noter.
                      </div>
                    )}
                  </label>
                </div>
              )}
              {vaultToDelete.hasHostingProvision && (
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
                    {!vaultToDelete.isNoterManaged && (
                      <div className="text-xs text-muted-foreground">
                        Only available for infrastructure provisioned by Noter.
                      </div>
                    )}
                  </label>
                </div>
              )}
              {deleteError && (
                <div className="text-sm text-red-600">{deleteError}</div>
              )}
              {commitError && (
                <div className="text-sm text-red-600">{commitError}</div>
              )}
              {didAttemptCommit && hasStagedChanges && (
                <div className="text-sm text-muted-foreground">
                  Some local changes are still uncommitted. You can retry commit
                  or remove anyway.
                </div>
              )}
            </div>
          )}
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
            {vaultToDelete && hasStagedChanges && (
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
            )}
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
    </div>
  );
}
