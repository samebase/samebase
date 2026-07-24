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
import {
  VaultOverviewDesignLabVisualFixture,
  type VaultOverviewDesignLabPage,
  type VaultOverviewDesignLabVisualMode,
} from "@/components/vault-dashboard/VaultOverviewDesignLabVisualFixture";
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
import { ButtonVisualFixture } from "@/components/ButtonVisualFixture";
import {
  AppBootFailureStateVisualFixture,
  type AppBootFailureStateVisualMode,
} from "@/components/AppBootFailureStateVisualFixture";
import {
  WorkspaceLayoutV2VisualFixture,
  type WorkspaceLayoutV2VisualMode,
} from "@/components/WorkspaceLayoutV2VisualFixture";
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
import {
  AccountDeletionStatusVisualFixture,
  type AccountDeletionStatusVisualMode,
} from "@/components/AccountDeletionStatusVisualFixture";
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
  | VaultOverviewDesignLabVisualMode
  | VaultResourceRailVisualMode
  | VaultSyncStatusVisualMode
  | WorkspaceLayoutV2VisualMode
  | ProviderConnectionsPageVisualMode
  | RouteUrlEditorVisualMode
  | "public-account-checking-login"
  | "button"
  | AppBootFailureStateVisualMode
  | "corner-notch"
  | "corner-notch-detail"
  | AccountDeletionStatusVisualMode;

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
  "vault-dashboard-connect-cloudflare-open",
  "vault-dashboard-connect-cloudflare-loading",
  "vault-dashboard-connect-cloudflare-mobile-shell-open",
  "vault-dashboard-connect-convex-open",
  "vault-dashboard-connect-convex-loading",
  "vault-dashboard-connect-convex-error",
  "vault-dashboard-delete-open",
  "vault-dashboard-infra-setup",
  "vault-dashboard-cloudflare-github-app-auth-failure",
  "vault-dashboard-cloudflare-build-trigger-missing",
  "vault-dashboard-provisioning-log",
  "vault-dashboard-sticky-header",
  "vault-dashboard-root-picker",
  "vault-dashboard-sidebar-list",
  "vault-dashboard-list-spacing",
  "vault-dashboard-default-branch",
  "vault-dashboard-source-setup-failed",
  "vault-overview-v2",
  "vault-overview-v2-auto-pagination",
  "vault-overview-v2-dev",
  "vault-overview-v2-loading",
  "vault-overview-v2-partial-loading",
  "vault-overview-v2-root",
  "vault-overview-v2-settings",
  "vault-convex-schema-graph",
  "vault-convex-schema-route-mobile",
  "vault-pull-request-auto-pagination",
  "vault-pull-request-filters",
] as const satisfies readonly VaultDashboardVisualMode[];

const VAULT_OVERVIEW_DESIGN_LAB_VISUAL_MODES = [
  "vault-overview-lab-simple",
  "vault-overview-lab-monorepo",
  "vault-overview-lab-stress",
  "vault-overview-lab-attention",
] as const satisfies readonly VaultOverviewDesignLabVisualMode[];

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
  "account-deletion-running",
  "account-deletion-attention",
  "public-account-checking-login",
  ...WORKSPACE_LAYOUT_V2_VISUAL_MODES,
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
    label: "Vault Overview Design Lab",
    modes: VAULT_OVERVIEW_DESIGN_LAB_VISUAL_MODES,
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

function renderVisualFixture(mode: VisualFixtureMode, page: VaultOverviewDesignLabPage) {
  if (mode === "account-deletion-running" || mode === "account-deletion-attention") {
    return <AccountDeletionStatusVisualFixture mode={mode} />;
  }

  if (mode === "media-png" || mode === "media-svg" || mode === "media-vox") {
    return <RepositoryMediaVisualFixture mode={mode} />;
  }

  if (
    mode === "vault-overview-lab-simple" ||
    mode === "vault-overview-lab-monorepo" ||
    mode === "vault-overview-lab-stress" ||
    mode === "vault-overview-lab-attention"
  ) {
    return <VaultOverviewDesignLabVisualFixture key={`${mode}:${page}`} mode={mode} page={page} />;
  }

  if (
    mode === "fileview-layout" ||
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
    mode === "vault-dashboard-connect-cloudflare-open" ||
    mode === "vault-dashboard-connect-cloudflare-loading" ||
    mode === "vault-dashboard-connect-cloudflare-mobile-shell-open" ||
    mode === "vault-dashboard-connect-convex-open" ||
    mode === "vault-dashboard-connect-convex-loading" ||
    mode === "vault-dashboard-connect-convex-error" ||
    mode === "vault-dashboard-delete-open" ||
    mode === "vault-dashboard-infra-setup" ||
    mode === "vault-dashboard-cloudflare-github-app-auth-failure" ||
    mode === "vault-dashboard-cloudflare-build-trigger-missing" ||
    mode === "vault-dashboard-provisioning-log" ||
    mode === "vault-dashboard-sticky-header" ||
    mode === "vault-dashboard-root-picker" ||
    mode === "vault-dashboard-sidebar-list" ||
    mode === "vault-dashboard-list-spacing" ||
    mode === "vault-dashboard-default-branch" ||
    mode === "vault-dashboard-source-setup-failed" ||
    mode === "vault-overview-v2" ||
    mode === "vault-overview-v2-auto-pagination" ||
    mode === "vault-overview-v2-dev" ||
    mode === "vault-overview-v2-loading" ||
    mode === "vault-overview-v2-partial-loading" ||
    mode === "vault-overview-v2-root" ||
    mode === "vault-overview-v2-settings" ||
    mode === "vault-convex-schema-graph" ||
    mode === "vault-convex-schema-route-mobile" ||
    mode === "vault-pull-request-auto-pagination" ||
    mode === "vault-pull-request-filters"
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
    mode === "file-view-developer-tools-codemirror"
  ) {
    return <FileViewDeveloperToolsVisualFixture mode={mode} />;
  }

  if (mode === "fileview-monaco-drag" || mode === "fileview-monaco-flex-height") {
    return <FileViewMonacoDragVisualFixture mode={mode} />;
  }

  if (mode === "fileview-prosemark-flex-height") {
    return <FileViewProsemarkHeightVisualFixture mode={mode} />;
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

export function VisualFixturePage(props: { mode?: string; view?: string }) {
  const selection = readSelection(props.mode);
  const page = props.view === "settings" ? "settings" : "overview";

  return (
    <DialogProvider>
      {selection.status === "missing"
        ? renderVisualFixtureModeDirectory({})
        : selection.status === "invalid"
          ? renderVisualFixtureModeDirectory({
              invalidMode: selection.value,
            })
          : renderVisualFixture(selection.mode, page)}
    </DialogProvider>
  );
}
