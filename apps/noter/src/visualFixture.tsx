import { ConvexAuthProvider } from "@convex-dev/auth/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import { DialogProvider } from "@/contexts/DialogContext";
import { client } from "@/lib/convexClient";
import { QueryProvider } from "@/lib/providers/query-provider";
import {
  CommitReviewVisualFixture,
  type CommitReviewVisualMode,
} from "@/components/CommitReviewVisualFixture";
import {
  CommitGraphVisualFixture,
  type CommitGraphVisualMode,
} from "@/components/CommitGraphVisualFixture";
import {
  RepositoryMediaVisualFixture,
  type RepositoryMediaVisualMode,
} from "@/components/RepositoryMediaVisualFixture";
import {
  AddRepositoryVisualFixture,
  type AddRepositoryVisualMode,
} from "@/components/AddRepositoryVisualFixture";
import {
  FileViewLayoutVisualFixture,
  type FileViewLayoutVisualMode,
} from "@/components/FileViewLayoutVisualFixture";
import {
  SimpleViewVisualFixture,
  type SimpleViewVisualMode,
} from "@/components/SimpleViewVisualFixture";
import {
  VaultDashboardVisualFixture,
  type VaultDashboardVisualMode,
} from "@/components/VaultDashboardVisualFixture";
import { MachineConnectVisualFixture } from "@/components/MachineConnectVisualFixture";
import { CornerNotchVisualFixture } from "@/components/CornerNotchVisualFixture";
import {
  LogoThreeVisualFixture,
  type LogoThreeVisualMode,
} from "@/components/LogoThreeVisualFixture";
import {
  LandingCopyVisualFixture,
  type LandingCopyVisualMode,
} from "@/components/LandingCopyVisualFixture";
import { CornerNotchDetailVisualFixture } from "@/components/CornerNotchDetailVisualFixture";
import {
  LogoSnapAnglesVisualFixture,
  type LogoSnapAnglesVisualMode,
} from "@/components/LogoSnapAnglesVisualFixture";
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
  RepositoryRouteConnectStateVisualFixture,
  type RepositoryRouteConnectStateVisualMode,
} from "@/components/RepositoryRouteConnectStateVisualFixture";
import {
  FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES,
  isFileViewPushActionsVisualMode,
  type FileViewPushActionsVisualMode,
} from "@/components/fileViewPushActionsVisualModes";
import { VaultDashboardBranchVisualFixture } from "@/components/VaultDashboardBranchVisualFixture";
import { ButtonVisualFixture } from "@/components/ButtonVisualFixture";
import {
  CodexThreadBrowserVisualFixture,
  type CodexThreadBrowserVisualMode,
} from "@/components/CodexThreadBrowserVisualFixture";
import {
  CodexAppServerResearchVisualFixture,
  type CodexAppServerResearchVisualMode,
} from "@/components/CodexAppServerResearchVisualFixture";
import { MachinesWorkspaceVisualFixture } from "@/components/MachinesWorkspaceVisualFixture";
import {
  CodexThreadHistoryVisualFixture,
  type CodexThreadHistoryVisualMode,
} from "@/components/CodexThreadHistoryVisualFixture";
import {
  EditorChatVisualFixture,
  type EditorChatVisualMode,
} from "@/components/EditorChatVisualFixture";
import {
  VaultBranchPreviewVisualFixture,
  type VaultBranchPreviewVisualMode,
} from "@/components/VaultBranchPreviewVisualFixture";
import {
  VaultSyncStatusVisualFixture,
  type VaultSyncStatusVisualMode,
} from "@/components/VaultSyncStatusVisualFixture";
import {
  SidebarMediaUploadVisualFixture,
  type SidebarMediaUploadVisualMode,
} from "@/components/SidebarMediaUploadVisualFixture";
import {
  ThreadBrowserVisualFixture,
  type ThreadBrowserVisualMode,
} from "@/components/ThreadBrowserVisualFixture";
import {
  ThreadHistoryVisualFixture,
  type ThreadHistoryVisualMode,
} from "@/components/ThreadHistoryVisualFixture";
import { GlobalGestureDebugOverlay } from "@/components/GlobalGestureDebugOverlay";
import { isMobileSidebarDebugEnabled } from "@/lib/mobileSidebarGestureDebug";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import "./index.css";

type VisualFixtureMode =
  | CommitGraphVisualMode
  | CommitReviewVisualMode
  | FileViewCompareVisualMode
  | FileViewCodeParityVisualMode
  | FileViewDeveloperToolsVisualMode
  | FileViewMonacoDragVisualMode
  | FileViewProsemarkHeightVisualMode
  | RepositoryRouteConnectStateVisualMode
  | FileViewLayoutVisualMode
  | FileViewPushActionsVisualMode
  | EditorChatVisualMode
  | LandingCopyVisualMode
  | LogoSnapAnglesVisualMode
  | LogoThreeVisualMode
  | AddRepositoryVisualMode
  | RepositoryMediaVisualMode
  | SidebarMediaUploadVisualMode
  | SimpleViewVisualMode
  | ThreadBrowserVisualMode
  | ThreadHistoryVisualMode
  | VaultDashboardVisualMode
  | VaultBranchPreviewVisualMode
  | VaultSyncStatusVisualMode
  | CodexAppServerResearchVisualMode
  | CodexThreadBrowserVisualMode
  | CodexThreadHistoryVisualMode
  | "machines-workspace"
  | "machine-connect"
  | "vault-dashboard-branch-pr-title"
  | "button"
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

const COMMIT_GRAPH_VISUAL_MODES = [
  "commit-graph",
] as const satisfies readonly CommitGraphVisualMode[];

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
] as const satisfies readonly FileViewLayoutVisualMode[];

const EDITOR_CHAT_VISUAL_MODES = [
  "editor-chat-open-desktop",
  "editor-chat-open-mobile",
  "editor-chat-closed",
] as const satisfies readonly EditorChatVisualMode[];

const ADD_REPOSITORY_VISUAL_MODES = [
  "add-repository-loading-more",
  "add-repository-background-error",
  "add-repository-retrying",
  "add-repository-empty-final",
] as const satisfies readonly AddRepositoryVisualMode[];

const LANDING_COPY_VISUAL_MODES = [
  "landing-copy-parity",
  "landing-copy-editable-parity-single-line",
  "landing-copy-editable-parity-two-line",
  "landing-copy-editable-parity-three-line",
] as const satisfies readonly LandingCopyVisualMode[];

const LOGO_VISUAL_MODES = [
  "logo-three-reference",
  "logo-snap-angles",
] as const satisfies readonly (
  | LogoThreeVisualMode
  | LogoSnapAnglesVisualMode
)[];

const SIMPLE_VIEW_VISUAL_MODES = [
  "simple-repository-config",
  "simple-missing-config",
] as const satisfies readonly SimpleViewVisualMode[];

const VAULT_DASHBOARD_VISUAL_MODES = [
  "dashboard-layout-minimal",
  "dashboard-provider-sidebar-wrap",
  "dashboard-shared-sidebar",
  "dashboard-shared-sidebar-mobile-chat",
  "vault-branch-filters",
  "vault-branch-pr-labels",
  "vault-branch-mobile-alignment",
] as const satisfies readonly VaultDashboardVisualMode[];

const VAULT_BRANCH_PREVIEW_VISUAL_MODES = [
  "vault-branch-preview-link",
  "vault-branch-preview-missing",
] as const satisfies readonly VaultBranchPreviewVisualMode[];

const VAULT_SYNC_STATUS_VISUAL_MODES = [
  "vault-sync-status-states",
] as const satisfies readonly VaultSyncStatusVisualMode[];

const THREAD_VISUAL_MODES = [
  "thread-browser",
  "thread-history",
] as const satisfies readonly (
  | ThreadBrowserVisualMode
  | ThreadHistoryVisualMode
)[];

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

const FILE_VIEW_ROUTE_CONNECT_VISUAL_MODES = [
  "file-view-connect-repository",
  "file-view-connect-github",
] as const satisfies readonly RepositoryRouteConnectStateVisualMode[];

const FILE_VIEW_MONACO_DRAG_VISUAL_MODES = [
  "fileview-monaco-drag",
  "fileview-monaco-flex-height",
] as const satisfies readonly FileViewMonacoDragVisualMode[];

const MISC_VISUAL_MODES = [
  "codex-app-server-research",
  "codex-thread-browser",
  "codex-thread-history",
  "machines-workspace",
  "machine-connect",
  "vault-dashboard-branch-pr-title",
  "button",
  "corner-notch",
  "corner-notch-detail",
] as const satisfies readonly VisualFixtureMode[];

const VISUAL_FIXTURE_GROUPS = [
  {
    label: "Commit Graph",
    modes: COMMIT_GRAPH_VISUAL_MODES,
  },
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
      ...FILE_VIEW_ROUTE_CONNECT_VISUAL_MODES,
    ],
  },
  {
    label: "File View Layout",
    modes: FILE_VIEW_LAYOUT_VISUAL_MODES,
  },
  {
    label: "Editor Chat",
    modes: EDITOR_CHAT_VISUAL_MODES,
  },
  {
    label: "Add Repository",
    modes: ADD_REPOSITORY_VISUAL_MODES,
  },
  {
    label: "Landing Copy",
    modes: LANDING_COPY_VISUAL_MODES,
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
    label: "Simple View",
    modes: SIMPLE_VIEW_VISUAL_MODES,
  },
  {
    label: "Vault Dashboard",
    modes: VAULT_DASHBOARD_VISUAL_MODES,
  },
  {
    label: "Vault Branch Preview",
    modes: VAULT_BRANCH_PREVIEW_VISUAL_MODES,
  },
  {
    label: "Vault Sync Status",
    modes: VAULT_SYNC_STATUS_VISUAL_MODES,
  },
  {
    label: "Thread Browser",
    modes: THREAD_VISUAL_MODES,
  },
  {
    label: "Misc",
    modes: MISC_VISUAL_MODES,
  },
] as const satisfies readonly {
  label: string;
  modes: readonly VisualFixtureMode[];
}[];

function isCommitReviewVisualMode(
  mode: VisualFixtureMode,
): mode is CommitReviewVisualMode {
  return COMMIT_REVIEW_VISUAL_MODES.some(
    (commitReviewMode) => commitReviewMode === mode,
  );
}

function isVisualFixtureMode(value: string): value is VisualFixtureMode {
  return VISUAL_FIXTURE_GROUPS.some((group) =>
    group.modes.some((mode) => mode === value),
  );
}

function readSelection(): VisualFixtureSelection {
  const value = new URLSearchParams(window.location.search).get("mode")?.trim();

  if (!value) {
    return { status: "missing" };
  }

  if (isVisualFixtureMode(value)) {
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
  if (mode === "commit-graph") {
    return <CommitGraphVisualFixture mode={mode} />;
  }

  if (mode === "media-png" || mode === "media-svg" || mode === "media-vox") {
    return <RepositoryMediaVisualFixture mode={mode} />;
  }

  if (mode === "fileview-layout" || mode === "fileview-layout-persistence") {
    return <FileViewLayoutVisualFixture mode={mode} />;
  }
  if (mode === "sidebar-media-upload") {
    return <SidebarMediaUploadVisualFixture />;
  }
  if (
    mode === "landing-copy-parity" ||
    mode === "landing-copy-editable-parity-single-line" ||
    mode === "landing-copy-editable-parity-two-line" ||
    mode === "landing-copy-editable-parity-three-line"
  ) {
    return <LandingCopyVisualFixture mode={mode} />;
  }

  if (mode === "logo-three-reference") {
    return <LogoThreeVisualFixture />;
  }

  if (mode === "logo-snap-angles") {
    return <LogoSnapAnglesVisualFixture />;
  }

  if (
    mode === "editor-chat-open-desktop" ||
    mode === "editor-chat-open-mobile" ||
    mode === "editor-chat-closed"
  ) {
    return <EditorChatVisualFixture mode={mode} />;
  }

  if (
    mode === "add-repository-loading-more" ||
    mode === "add-repository-background-error" ||
    mode === "add-repository-retrying" ||
    mode === "add-repository-empty-final"
  ) {
    return <AddRepositoryVisualFixture mode={mode} />;
  }

  if (mode === "simple-repository-config" || mode === "simple-missing-config") {
    return <SimpleViewVisualFixture mode={mode} />;
  }

  if (
    mode === "dashboard-layout-minimal" ||
    mode === "dashboard-provider-sidebar-wrap" ||
    mode === "dashboard-shared-sidebar" ||
    mode === "dashboard-shared-sidebar-mobile-chat" ||
    mode === "vault-branch-filters" ||
    mode === "vault-branch-pr-labels" ||
    mode === "vault-branch-mobile-alignment"
  ) {
    return <VaultDashboardVisualFixture mode={mode} />;
  }

  if (
    mode === "vault-branch-preview-link" ||
    mode === "vault-branch-preview-missing"
  ) {
    return <VaultBranchPreviewVisualFixture mode={mode} />;
  }

  if (mode === "vault-sync-status-states") {
    return <VaultSyncStatusVisualFixture mode={mode} />;
  }

  if (mode === "thread-browser") {
    return <ThreadBrowserVisualFixture mode={mode} />;
  }

  if (mode === "thread-history") {
    return <ThreadHistoryVisualFixture mode={mode} />;
  }

  if (isFileViewPushActionsVisualMode(mode)) {
    return <FileViewPushActionsVisualFixture mode={mode} />;
  }

  if (
    mode === "file-view-compare-sidebar" ||
    mode === "file-view-compare-loading"
  ) {
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

  if (
    mode === "fileview-monaco-drag" ||
    mode === "fileview-monaco-flex-height"
  ) {
    return <FileViewMonacoDragVisualFixture mode={mode} />;
  }

  if (mode === "fileview-prosemark-flex-height") {
    return <FileViewProsemarkHeightVisualFixture mode={mode} />;
  }

  if (
    mode === "file-view-connect-repository" ||
    mode === "file-view-connect-github"
  ) {
    return <RepositoryRouteConnectStateVisualFixture mode={mode} />;
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

  if (mode === "button") {
    return <ButtonVisualFixture />;
  }

  if (mode === "corner-notch") {
    return <CornerNotchVisualFixture />;
  }

  if (mode === "corner-notch-detail") {
    return <CornerNotchDetailVisualFixture />;
  }

  if (isCommitReviewVisualMode(mode)) {
    return <CommitReviewVisualFixture mode={mode} />;
  }

  mode satisfies never;
  return null;
}

function buildFixtureModeHref(mode: VisualFixtureMode) {
  return buildPathWithUpdatedQuery(window.location, (nextSearchParams) => {
    setQueryParam(nextSearchParams, "mode", mode);
  });
}

function renderVisualFixtureModeDirectory({
  invalidMode,
}: {
  invalidMode?: string;
}) {
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
              <div className="mb-3 text-sm font-medium text-stone-900">
                {group.label}
              </div>
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

const selection = readSelection();
const showGestureDebugOverlay = isMobileSidebarDebugEnabled(
  window.location.search,
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ConvexAuthProvider client={client}>
        <QueryProvider>
          <DialogProvider>
            {showGestureDebugOverlay ? <GlobalGestureDebugOverlay /> : null}
            {selection.status === "missing"
              ? renderVisualFixtureModeDirectory({})
              : selection.status === "invalid"
                ? renderVisualFixtureModeDirectory({
                    invalidMode: selection.value,
                  })
                : renderVisualFixture(selection.mode)}
          </DialogProvider>
        </QueryProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
