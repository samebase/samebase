import { DialogProvider } from "@/contexts/DialogContext";
import {
  CommitReviewVisualFixture,
  type CommitReviewVisualMode,
} from "@/components/CommitReviewVisualFixture";
import {
  RepositoryMediaVisualFixture,
  type RepositoryMediaVisualMode,
} from "@/components/RepositoryMediaVisualFixture";
import {
  FileViewLayoutVisualFixture,
  type FileViewLayoutVisualMode,
} from "@/components/FileViewLayoutVisualFixture";
import {
  VaultDashboardVisualFixture,
  type VaultDashboardVisualMode,
} from "@/components/vault-dashboard/VaultDashboardVisualFixture";
import { MachineConnectVisualFixture } from "@/components/MachineConnectVisualFixture";
import { CornerNotchVisualFixture } from "@/components/CornerNotchVisualFixture";
import {
  LogoThreeVisualFixture,
  type LogoThreeVisualMode,
} from "@/components/logo/LogoThreeVisualFixture";
import { CornerNotchDetailVisualFixture } from "@/components/CornerNotchDetailVisualFixture";
import {
  LogoSnapAnglesVisualFixture,
  type LogoSnapAnglesVisualMode,
} from "@/components/logo/LogoSnapAnglesVisualFixture";
import { FileViewPushActionsVisualFixture } from "@/components/FileViewPushActionsVisualFixture";
import {
  FileViewCompareVisualFixture,
  type FileViewCompareVisualMode,
} from "@/components/FileViewCompareVisualFixture";
import {
  FileViewCodeParityVisualFixture,
  type FileViewCodeParityVisualMode,
} from "@/components/FileViewCodeParityVisualFixture";
import {
  FileViewDeveloperToolsVisualFixture,
  type FileViewDeveloperToolsVisualMode,
} from "@/components/FileViewDeveloperToolsVisualFixture";
import {
  FileViewMonacoDragVisualFixture,
  type FileViewMonacoDragVisualMode,
} from "@/components/FileViewMonacoDragVisualFixture";
import {
  FileViewProsemarkHeightVisualFixture,
  type FileViewProsemarkHeightVisualMode,
} from "@/components/FileViewProsemarkHeightVisualFixture";
import {
  FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES,
  type FileViewPushActionsVisualMode,
} from "@/components/fileViewPushActionsVisualModes";
import { VaultDashboardBranchVisualFixture } from "@/components/vault-dashboard/VaultDashboardBranchVisualFixture";
import { ButtonVisualFixture } from "@/components/ButtonVisualFixture";
import {
  AppBootFailureStateVisualFixture,
  type AppBootFailureStateVisualMode,
} from "@/components/AppBootFailureStateVisualFixture";
import {
  CodexThreadBrowserVisualFixture,
  type CodexThreadBrowserVisualMode,
} from "@/components/codex/CodexThreadBrowserVisualFixture";
import {
  CodexAppServerResearchVisualFixture,
  type CodexAppServerResearchVisualMode,
} from "@/components/codex/CodexAppServerResearchVisualFixture";
import { MachinesWorkspaceVisualFixture } from "@/components/MachinesWorkspaceVisualFixture";
import {
  WorkspaceLayoutV2VisualFixture,
  type WorkspaceLayoutV2VisualMode,
} from "@/components/WorkspaceLayoutV2VisualFixture";
import {
  CodexThreadHistoryVisualFixture,
  type CodexThreadHistoryVisualMode,
} from "@/components/codex/CodexThreadHistoryVisualFixture";
import {
  VaultResourceRailVisualFixture,
  type VaultResourceRailVisualMode,
} from "@/components/vault-dashboard/VaultResourceRailVisualFixture";
import {
  VaultSyncStatusVisualFixture,
  type VaultSyncStatusVisualMode,
} from "@/components/VaultSyncStatusVisualFixture";
import {
  SidebarMediaUploadVisualFixture,
  type SidebarMediaUploadVisualMode,
} from "@/components/SidebarMediaUploadVisualFixture";
import {
  RouteUrlEditorVisualFixture,
  type RouteUrlEditorVisualMode,
} from "@/components/RouteUrlEditor/RouteUrlEditorVisualFixture";
import {
  ProviderConnectionsPageVisualFixture,
  type ProviderConnectionsPageVisualMode,
} from "@/components/ProviderConnectionsPageVisualFixture";
import { PublicLandingAccountLoadingSection } from "@/components/PublicLandingAccountSection";
import { buildPathWithTanStackSearch, parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { includes } from "@samebase/dependent";

type VisualFixtureMode =
  | CommitReviewVisualMode
  | FileViewCompareVisualMode
  | FileViewCodeParityVisualMode
  | FileViewDeveloperToolsVisualMode
  | FileViewMonacoDragVisualMode
  | FileViewProsemarkHeightVisualMode
  | FileViewLayoutVisualMode
  | FileViewPushActionsVisualMode
  | LogoSnapAnglesVisualMode
  | LogoThreeVisualMode
  | RepositoryMediaVisualMode
  | SidebarMediaUploadVisualMode
  | VaultDashboardVisualMode
  | VaultResourceRailVisualMode
  | VaultSyncStatusVisualMode
  | WorkspaceLayoutV2VisualMode
  | CodexAppServerResearchVisualMode
  | CodexThreadBrowserVisualMode
  | CodexThreadHistoryVisualMode
  | ProviderConnectionsPageVisualMode
  | RouteUrlEditorVisualMode
  | "machines-workspace"
  | "machine-connect"
  | "public-account-checking-login"
  | "vault-dashboard-branch-pr-title"
  | "button"
  | AppBootFailureStateVisualMode
  | "corner-notch"
  | "corner-notch-detail";

type VisualFixtureSelection =
  | {
      status: "missing";
    }
  | {
      status: "invalid";
      value: string;
    }
  | {
      status: "valid";
      mode: VisualFixtureMode;
    };

const COMMIT_REVIEW_VISUAL_MODES = [
  "inline",
  "deleted",
  "deleted-staged-changes",
  "deleted-markdown-link",
  "trailing-newline-only",
  "unchanged",
  "conflict",
] as const satisfies readonly CommitReviewVisualMode[];

const REPOSITORY_MEDIA_VISUAL_MODES = [
  "media-png",
  "media-svg",
  "media-vox",
] as const satisfies readonly RepositoryMediaVisualMode[];
const SIDEBAR_MEDIA_UPLOAD_VISUAL_MODES = [
  "sidebar-media-upload",
] as const satisfies readonly SidebarMediaUploadVisualMode[];

const FILE_VIEW_LAYOUT_VISUAL_MODES = [
  "fileview-layout",
  "fileview-layout-merge",
  "fileview-layout-persistence",
  "fileview-layout-slide",
] as const satisfies readonly FileViewLayoutVisualMode[];

const LOGO_VISUAL_MODES = ["logo-three-reference", "logo-snap-angles"] as const satisfies readonly (
  | LogoThreeVisualMode
  | LogoSnapAnglesVisualMode
)[];

const VAULT_DASHBOARD_VISUAL_MODES = [
  "vault-dashboard-dev-tools-hidden",
  "vault-dashboard-dev-tools-visible",
  "vault-dashboard-add-first-app-root-open",
  "vault-dashboard-add-app-root-open",
  "vault-dashboard-connect-cloudflare-open",
  "vault-dashboard-connect-cloudflare-mobile-shell-open",
  "vault-dashboard-connect-convex-open",
  "vault-dashboard-delete-open",
  "vault-dashboard-infra-setup",
  "vault-dashboard-cloudflare-github-app-auth-failure",
  "vault-dashboard-provisioning-log",
  "vault-dashboard-bottom-target-scroll",
  "vault-dashboard-sticky-header",
  "vault-dashboard-list-spacing",
  "vault-dashboard-branch-row-variants",
  "vault-last-updated-status",
  "vault-branch-filters",
  "vault-branch-pr-labels",
  "vault-branch-mobile-alignment",
] as const satisfies readonly VaultDashboardVisualMode[];

const VAULT_RESOURCE_RAIL_VISUAL_MODES = [
  "vault-resource-rail",
] as const satisfies readonly VaultResourceRailVisualMode[];

const VAULT_SYNC_STATUS_VISUAL_MODES = [
  "vault-sync-status-states",
] as const satisfies readonly VaultSyncStatusVisualMode[];

const FILE_VIEW_COMPARE_VISUAL_MODES = [
  "file-view-compare-sidebar",
  "file-view-compare-loading",
] as const satisfies readonly FileViewCompareVisualMode[];

const FILE_VIEW_CODE_PARITY_VISUAL_MODES = [
  "file-view-code-parity",
] as const satisfies readonly FileViewCodeParityVisualMode[];

const FILE_VIEW_DEVELOPER_TOOLS_VISUAL_MODES = [
  "file-view-developer-tools-collapsed",
  "file-view-developer-tools-codemirror",
  "file-view-developer-tools-graph",
] as const satisfies readonly FileViewDeveloperToolsVisualMode[];

const FILE_VIEW_PROSEMARK_HEIGHT_VISUAL_MODES = [
  "fileview-prosemark-flex-height",
] as const satisfies readonly FileViewProsemarkHeightVisualMode[];

const FILE_VIEW_MONACO_DRAG_VISUAL_MODES = [
  "fileview-monaco-drag",
  "fileview-monaco-flex-height",
] as const satisfies readonly FileViewMonacoDragVisualMode[];

const WORKSPACE_LAYOUT_V2_VISUAL_MODES = [
  "workspace-layout-v2-status-bar",
] as const satisfies readonly WorkspaceLayoutV2VisualMode[];
const ROUTE_URL_EDITOR_VISUAL_MODES = [
  "route-url-editor",
] as const satisfies readonly RouteUrlEditorVisualMode[];
const PROVIDER_CONNECTIONS_PAGE_VISUAL_MODES = [
  "providers-page-connected",
] as const satisfies readonly ProviderConnectionsPageVisualMode[];
const MISC_VISUAL_MODES = [
  "codex-app-server-research",
  "codex-thread-browser",
  "codex-thread-history",
  "machines-workspace",
  "public-account-checking-login",
  ...WORKSPACE_LAYOUT_V2_VISUAL_MODES,
  "machine-connect",
  "vault-dashboard-branch-pr-title",
  "button",
  "app-boot-failure-stale",
  "app-boot-failure-generic",
  "corner-notch",
  "corner-notch-detail",
] as const satisfies readonly VisualFixtureMode[];

const VISUAL_FIXTURE_GROUPS = [
  {
    label: "Commit Review",
    modes: COMMIT_REVIEW_VISUAL_MODES,
  },
  {
    label: "File View",
    modes: [
      ...FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES,
      ...FILE_VIEW_COMPARE_VISUAL_MODES,
      ...FILE_VIEW_CODE_PARITY_VISUAL_MODES,
      ...FILE_VIEW_DEVELOPER_TOOLS_VISUAL_MODES,
      ...FILE_VIEW_MONACO_DRAG_VISUAL_MODES,
      ...FILE_VIEW_PROSEMARK_HEIGHT_VISUAL_MODES,
    ],
  },
  {
    label: "File View Layout",
    modes: FILE_VIEW_LAYOUT_VISUAL_MODES,
  },
  {
    label: "Logo",
    modes: LOGO_VISUAL_MODES,
  },
  {
    label: "Repository Media",
    modes: REPOSITORY_MEDIA_VISUAL_MODES,
  },
  {
    label: "Media Upload",
    modes: SIDEBAR_MEDIA_UPLOAD_VISUAL_MODES,
  },
  {
    label: "Vault Dashboard",
    modes: VAULT_DASHBOARD_VISUAL_MODES,
  },
  {
    label: "Vault Resource Rail",
    modes: VAULT_RESOURCE_RAIL_VISUAL_MODES,
  },
  {
    label: "Vault Sync Status",
    modes: VAULT_SYNC_STATUS_VISUAL_MODES,
  },
  {
    label: "Route URL",
    modes: ROUTE_URL_EDITOR_VISUAL_MODES,
  },
  {
    label: "Providers",
    modes: PROVIDER_CONNECTIONS_PAGE_VISUAL_MODES,
  },
  {
    label: "Misc",
    modes: MISC_VISUAL_MODES,
  },
] as const satisfies readonly {
  label: string;
  modes: readonly VisualFixtureMode[];
}[];

const VISUAL_FIXTURE_MODES = VISUAL_FIXTURE_GROUPS.flatMap((group) => group.modes);

function readSelection(modeSearchValue: string | undefined): VisualFixtureSelection {
  if (!modeSearchValue) {
    return { status: "missing" };
  }

  const value = modeSearchValue.trim();
  if (!value) {
    return { status: "missing" };
  }

  if (includes(VISUAL_FIXTURE_MODES, value)) {
    return {
      status: "valid",
      mode: value,
    };
  }

  return {
    status: "invalid",
    value,
  };
}

function renderVisualFixture(mode: VisualFixtureMode) {
  if (mode === "media-png" || mode === "media-svg" || mode === "media-vox") {
    return <RepositoryMediaVisualFixture mode={mode} />;
  }

  if (
    mode === "fileview-layout" ||
    mode === "fileview-layout-merge" ||
    mode === "fileview-layout-persistence" ||
    mode === "fileview-layout-slide"
  ) {
    return <FileViewLayoutVisualFixture mode={mode} />;
  }
  if (mode === "sidebar-media-upload") {
    return <SidebarMediaUploadVisualFixture />;
  }
  if (mode === "logo-three-reference") {
    return <LogoThreeVisualFixture />;
  }

  if (mode === "logo-snap-angles") {
    return <LogoSnapAnglesVisualFixture />;
  }

  if (
    mode === "vault-dashboard-dev-tools-hidden" ||
    mode === "vault-dashboard-dev-tools-visible" ||
    mode === "vault-dashboard-add-first-app-root-open" ||
    mode === "vault-dashboard-add-app-root-open" ||
    mode === "vault-dashboard-connect-cloudflare-open" ||
    mode === "vault-dashboard-connect-cloudflare-mobile-shell-open" ||
    mode === "vault-dashboard-connect-convex-open" ||
    mode === "vault-dashboard-delete-open" ||
    mode === "vault-dashboard-infra-setup" ||
    mode === "vault-dashboard-cloudflare-github-app-auth-failure" ||
    mode === "vault-dashboard-provisioning-log" ||
    mode === "vault-dashboard-bottom-target-scroll" ||
    mode === "vault-dashboard-sticky-header" ||
    mode === "vault-dashboard-list-spacing" ||
    mode === "vault-dashboard-branch-row-variants" ||
    mode === "vault-last-updated-status" ||
    mode === "vault-branch-filters" ||
    mode === "vault-branch-pr-labels" ||
    mode === "vault-branch-mobile-alignment"
  ) {
    return <VaultDashboardVisualFixture mode={mode} />;
  }

  if (mode === "vault-resource-rail") {
    return <VaultResourceRailVisualFixture />;
  }

  if (mode === "vault-sync-status-states") {
    return <VaultSyncStatusVisualFixture mode={mode} />;
  }

  if (includes(FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES, mode)) {
    return <FileViewPushActionsVisualFixture mode={mode} />;
  }

  if (mode === "file-view-compare-sidebar" || mode === "file-view-compare-loading") {
    return <FileViewCompareVisualFixture mode={mode} />;
  }

  if (mode === "file-view-code-parity") {
    return <FileViewCodeParityVisualFixture mode={mode} />;
  }

  if (
    mode === "file-view-developer-tools-collapsed" ||
    mode === "file-view-developer-tools-codemirror" ||
    mode === "file-view-developer-tools-graph"
  ) {
    return <FileViewDeveloperToolsVisualFixture mode={mode} />;
  }

  if (mode === "fileview-monaco-drag" || mode === "fileview-monaco-flex-height") {
    return <FileViewMonacoDragVisualFixture mode={mode} />;
  }

  if (mode === "fileview-prosemark-flex-height") {
    return <FileViewProsemarkHeightVisualFixture mode={mode} />;
  }

  if (mode === "vault-dashboard-branch-pr-title") {
    return <VaultDashboardBranchVisualFixture />;
  }

  if (mode === "codex-thread-history") {
    return <CodexThreadHistoryVisualFixture mode={mode} />;
  }

  if (mode === "codex-app-server-research") {
    return <CodexAppServerResearchVisualFixture mode={mode} />;
  }

  if (mode === "codex-thread-browser") {
    return <CodexThreadBrowserVisualFixture mode={mode} />;
  }

  if (mode === "machine-connect") {
    return <MachineConnectVisualFixture />;
  }

  if (mode === "machines-workspace") {
    return <MachinesWorkspaceVisualFixture />;
  }

  if (mode === "public-account-checking-login") {
    return (
      <div
        data-testid="public-account-checking-login-visual-fixture"
        className="mx-auto w-full max-w-[320px] p-6"
      >
        <PublicLandingAccountLoadingSection />
      </div>
    );
  }

  if (mode === "workspace-layout-v2-status-bar") {
    return <WorkspaceLayoutV2VisualFixture />;
  }

  if (mode === "route-url-editor") {
    return <RouteUrlEditorVisualFixture />;
  }

  if (mode === "providers-page-connected") {
    return <ProviderConnectionsPageVisualFixture />;
  }

  if (mode === "button") {
    return <ButtonVisualFixture />;
  }

  if (mode === "app-boot-failure-stale" || mode === "app-boot-failure-generic") {
    return <AppBootFailureStateVisualFixture mode={mode} />;
  }

  if (mode === "corner-notch") {
    return <CornerNotchVisualFixture />;
  }

  if (mode === "corner-notch-detail") {
    return <CornerNotchDetailVisualFixture />;
  }

  if (includes(COMMIT_REVIEW_VISUAL_MODES, mode)) {
    return <CommitReviewVisualFixture mode={mode} />;
  }

  mode satisfies never;
  return null;
}

function buildFixtureModeHref(mode: VisualFixtureMode) {
  return buildPathWithTanStackSearch({
    pathname: window.location.pathname,
    search: {
      ...parseTanStackSearch(window.location.search),
      mode,
    },
    hash: window.location.hash,
  });
}

function renderVisualFixtureModeDirectory({ invalidMode }: { invalidMode?: string }) {
  return (
    <div className="min-h-screen bg-stone-100 p-8 text-stone-950">
      <div className="mx-auto grid max-w-6xl gap-8">
        <div className="grid gap-3">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
            Visual Fixture
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {invalidMode ? "Mode not found" : "Choose a fixture mode"}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-stone-600">
            {invalidMode
              ? `No visual fixture is registered for "${invalidMode}". Pick one of the known modes below.`
              : "Pick a registered mode to open that visual fixture directly. This keeps the page lightweight while still giving you a browsable index."}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {VISUAL_FIXTURE_GROUPS.map((group) => (
            <section
              key={group.label}
              className="corner-notch-1 border border-stone-300 bg-white p-4"
            >
              <div className="mb-3 text-sm font-medium text-stone-900">{group.label}</div>
              <div className="grid gap-2">
                {group.modes.map((mode) => (
                  <a
                    key={mode}
                    className="corner-notch-1 border border-stone-300 px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100"
                    href={buildFixtureModeHref(mode)}
                  >
                    {mode}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function VisualFixturePage(props: { mode?: string }) {
  const selection = readSelection(props.mode);

  return (
    <DialogProvider>
      {selection.status === "missing"
        ? renderVisualFixtureModeDirectory({})
        : selection.status === "invalid"
          ? renderVisualFixtureModeDirectory({
              invalidMode: selection.value,
            })
          : renderVisualFixture(selection.mode)}
    </DialogProvider>
  );
}
