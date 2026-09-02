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
  VaultOverviewVisualFixture,
  type VaultOverviewVisualMode,
} from "@/components/vault-dashboard/VaultOverviewVisualFixture";
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
import { ButtonVisualFixture } from "@/components/ButtonVisualFixture";
import {
  AppBootFailureStateVisualFixture,
  type AppBootFailureStateVisualMode,
} from "@/components/AppBootFailureStateVisualFixture";
import {
  SidebarLayoutVisualFixture,
  type SidebarLayoutVisualMode,
} from "@/components/SidebarLayoutVisualFixture";
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
import {
  ConnectRepositoryVisualFixture,
  type ConnectRepositoryVisualMode,
} from "@/components/ConnectRepositoryVisualFixture";
import {
  NewAppPageVisualFixture,
  type NewAppPageVisualMode,
} from "@/components/NewAppPageVisualFixture";
import {
  OrganizationMembersPageVisualFixture,
  type OrganizationMembersPageVisualMode,
} from "@/components/OrganizationMembersPageVisualFixture";
import { OrganizationsPageVisualFixture } from "@/components/OrganizationsPageVisualFixture";
import { TermsAcceptanceVisualFixture } from "@/components/TermsAcceptanceVisualFixture";

type VisualFixtureMode =
  | CommitReviewVisualMode
  | FileViewCompareVisualMode
  | FileViewCodeParityVisualMode
  | FileViewDeveloperToolsVisualMode
  | FileViewMonacoDragVisualMode
  | FileViewProsemarkHeightVisualMode
  | FileViewLayoutVisualMode
  | LogoSnapAnglesVisualMode
  | LogoThreeVisualMode
  | RepositoryMediaVisualMode
  | SidebarMediaUploadVisualMode
  | VaultOverviewVisualMode
  | VaultSyncStatusVisualMode
  | SidebarLayoutVisualMode
  | ProviderConnectionsPageVisualMode
  | RouteUrlEditorVisualMode
  | "public-account-checking-login"
  | "button"
  | AppBootFailureStateVisualMode
  | "corner-notch"
  | "corner-notch-detail"
  | AccountDeletionStatusVisualMode
  | ConnectRepositoryVisualMode
  | NewAppPageVisualMode
  | OrganizationMembersPageVisualMode
  | "organizations-page"
  | "terms-acceptance";

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
  "vault-overview-v2",
  "vault-overview-v2-auto-pagination",
  "vault-overview-v2-cloudflare-build-status-unavailable",
  "vault-overview-v2-cloudflare-builds-repair",
  "vault-overview-v2-cloudflare-dialog",
  "vault-overview-v2-cloudflare-dialog-normalized-name",
  "vault-overview-v2-cloudflare-dialog-loading",
  "vault-overview-v2-cloudflare-github-authorization-failed",
  "vault-overview-v2-convex-dialog",
  "vault-overview-v2-convex-dialog-error",
  "vault-overview-v2-convex-dialog-loading",
  "vault-overview-v2-convex-schema",
  "vault-overview-v2-dev",
  "vault-overview-v2-delete-dialog",
  "vault-overview-v2-loading",
  "vault-overview-v2-partial-loading",
  "vault-overview-v2-provider-failed",
  "vault-overview-v2-provisioning-source",
  "vault-overview-v2-provisioning-github",
  "vault-overview-v2-provisioning-early-empty",
  "vault-overview-v2-provisioning-complete-empty",
  "vault-overview-v2-provisioning-stale-empty",
  "vault-overview-v2-provisioning-commit",
  "vault-overview-v2-provisioning-worker",
  "vault-overview-v2-provisioning-ready",
  "vault-overview-v2-root",
  "vault-overview-v2-settings",
  "vault-overview-v2-settings-active",
  "vault-overview-v2-settings-checking",
  "vault-overview-v2-settings-completed",
  "vault-overview-v2-settings-drift",
  "vault-overview-v2-settings-loading",
] as const satisfies readonly VaultOverviewVisualMode[];

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

const SIDEBAR_LAYOUT_VISUAL_MODES = [
  "sidebar-layout-status-bar",
] as const satisfies readonly SidebarLayoutVisualMode[];
const ROUTE_URL_EDITOR_VISUAL_MODES = [
  "route-url-editor",
] as const satisfies readonly RouteUrlEditorVisualMode[];
const PROVIDER_CONNECTIONS_PAGE_VISUAL_MODES = [
  "providers-page-connected",
  "providers-page-authorization-error",
  "providers-page-loading",
  "providers-page-not-configured",
  "providers-page-personal",
  "providers-page-personal-sign-in-mismatch",
  "providers-page-personal-sign-in-required",
  "providers-page-recovery",
] as const satisfies readonly ProviderConnectionsPageVisualMode[];
const CONNECT_REPOSITORY_VISUAL_MODES = [
  "connect-repository-github-unavailable",
] as const satisfies readonly ConnectRepositoryVisualMode[];
const NEW_APP_VISUAL_MODES = [
  "new-app-build-token",
  "new-app-provider-blocked",
] as const satisfies readonly NewAppPageVisualMode[];
const ORGANIZATION_MEMBERS_VISUAL_MODES = [
  "organization-members-page-owner",
] as const satisfies readonly OrganizationMembersPageVisualMode[];
const ORGANIZATIONS_VISUAL_MODES = [
  "organizations-page",
] as const satisfies readonly VisualFixtureMode[];
const MISC_VISUAL_MODES = [
  "account-deletion-queued",
  "account-deletion-running",
  "account-deletion-attention",
  "public-account-checking-login",
  ...SIDEBAR_LAYOUT_VISUAL_MODES,
  "button",
  "app-boot-failure-stale",
  "app-boot-failure-generic",
  "corner-notch",
  "corner-notch-detail",
  "terms-acceptance",
] as const satisfies readonly VisualFixtureMode[];

const VISUAL_FIXTURE_GROUPS = [
  {
    label: "Commit Review",
    modes: COMMIT_REVIEW_VISUAL_MODES,
  },
  {
    label: "File View",
    modes: [
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
    label: "Vault Overview",
    modes: VAULT_DASHBOARD_VISUAL_MODES,
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
    label: "Connect Repository",
    modes: CONNECT_REPOSITORY_VISUAL_MODES,
  },
  {
    label: "New App",
    modes: NEW_APP_VISUAL_MODES,
  },
  {
    label: "Organization Members",
    modes: ORGANIZATION_MEMBERS_VISUAL_MODES,
  },
  {
    label: "Organizations",
    modes: ORGANIZATIONS_VISUAL_MODES,
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
  if (
    mode === "account-deletion-queued" ||
    mode === "account-deletion-running" ||
    mode === "account-deletion-attention"
  ) {
    return <AccountDeletionStatusVisualFixture mode={mode} />;
  }

  if (mode === "media-png" || mode === "media-svg" || mode === "media-vox") {
    return <RepositoryMediaVisualFixture mode={mode} />;
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

  if (includes(VAULT_DASHBOARD_VISUAL_MODES, mode)) {
    return <VaultOverviewVisualFixture mode={mode} />;
  }

  if (mode === "vault-sync-status-states") {
    return <VaultSyncStatusVisualFixture mode={mode} />;
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

  if (mode === "sidebar-layout-status-bar") {
    return <SidebarLayoutVisualFixture />;
  }

  if (mode === "route-url-editor") {
    return <RouteUrlEditorVisualFixture />;
  }

  if (
    mode === "providers-page-connected" ||
    mode === "providers-page-authorization-error" ||
    mode === "providers-page-loading" ||
    mode === "providers-page-not-configured" ||
    mode === "providers-page-personal" ||
    mode === "providers-page-personal-sign-in-mismatch" ||
    mode === "providers-page-personal-sign-in-required" ||
    mode === "providers-page-recovery"
  ) {
    return <ProviderConnectionsPageVisualFixture mode={mode} />;
  }

  if (mode === "connect-repository-github-unavailable") {
    return <ConnectRepositoryVisualFixture />;
  }

  if (mode === "new-app-build-token" || mode === "new-app-provider-blocked") {
    return <NewAppPageVisualFixture mode={mode} />;
  }

  if (mode === "organization-members-page-owner") {
    return <OrganizationMembersPageVisualFixture />;
  }

  if (mode === "organizations-page") {
    return <OrganizationsPageVisualFixture />;
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

  if (mode === "terms-acceptance") {
    return <TermsAcceptanceVisualFixture />;
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
