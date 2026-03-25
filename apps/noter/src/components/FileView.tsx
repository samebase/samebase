import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useAction, useMutation, useQuery as useLiveQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { CodeEditorWrapper } from "@/components/CodeEditor";
import {
  AgentGraphView,
  type AgentGraphEdge,
  type AgentGraphNode,
} from "@/components/AgentGraphView";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { Label } from "@/components/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { FileViewPushActions } from "@/components/FileViewPushActions";

import {
  ChevronDownIcon,
  GitHubLogoIcon,
  PlusIcon,
  FilePlusIcon,
} from "@radix-ui/react-icons";
import { SidebarProvider } from "@/components/sidebar";
import {
  buildPathWithUpdatedQuery,
  hasQueryParam,
  setQueryParam,
} from "@/lib/queryParams";
import { FileTree } from "./FileTree";
import { CommandPalette } from "./CommandPalette";
import { EditorChatDock } from "./EditorChatDock";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/hooks/use-sidebar";
import { UserMenu } from "@/components/UserMenu";
import { linkStyle } from "./styles";
import { useConvexAction, useConvexMutation } from "@/lib/convexUtils";
import { DialogProvider } from "@/contexts/DialogContext";
import { useDialog } from "@/hooks/useDialog";
import { FileCreationDialog } from "@/components/FileCreationDialog";
import { FolderCreationDialog } from "@/components/FolderCreationDialog";
import {
  ProsemarkMergeEditor,
  type ProsemarkMergeEditorOptions,
} from "@/components/ProsemarkMergeEditor";
import { nonNullable } from "@/lib/utils";
import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  hasSimpleViewConfigFile,
  hasStagedSimpleViewConfigFile,
  isStagedSimpleViewConfigDeleted,
  parseSimpleViewConfig,
  SIMPLE_VIEW_CONFIG_PATH,
  shouldLoadRepositorySimpleViewConfig,
} from "@/lib/simpleView";
import { type CommitReviewFileStatus as CommitPreviewFileStatus } from "@/lib/commitReviewStatus";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/treeRefreshDebounce";
import { buildFileViewRefreshDebounceKey } from "@/lib/fileViewRefresh";
import { getAncestorFolderPaths } from "@/lib/fileTreeState";
import { type GithubTreeType } from "convex/schema";
import { DaytonaPreviewPanel } from "./DaytonaPreviewPanel";
import { DaytonaSnapshotList } from "./DaytonaSnapshotList";
import { DaytonaWorkspaceButton } from "./DaytonaWorkspaceButton";
import { DaytonaSnapshotBanner } from "./DaytonaSnapshotBanner";
import { DraftPullRequestFeedbackBanner } from "./DraftPullRequestFeedbackBanner";
import { VaultSyncStatus } from "./VaultSyncStatus";
import { RepositoryMediaViewer } from "./RepositoryMediaViewer";
import { RepositoryWorkspaceFrame } from "./RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "./SidebarAccountSection";
import { isRenderableRepositoryMediaPath } from "../../shared/repositoryMedia";
import { isStaleBaseVersionError } from "../../shared/stagingErrors";
import { decodeRouteSegmentSafe } from "@/lib/vaultRoutes";
import { resolveLegacyBranchlessFilePath } from "@/lib/legacyBranchlessRoute";
import {
  buildStagingPreviewRefreshKey,
  getBranchComparePreviewReloadMode,
} from "@/lib/fileViewCompare";

function isFileTreeNodeType(type: string): type is "tree" | "blob" {
  return type === "tree" || type === "blob";
}

// Function to find the best file to display
function findBestInitialFile(files: GithubTreeType[]) {
  // Only consider blob (file) types, not directories
  const fileList = files.filter((item) => item.type === "blob");

  if (fileList.length === 0) return null;

  // 1. Look for README files (case insensitive, various extensions)
  const readmeFile = fileList.find((file) =>
    /^readme(\.(md|txt|rst|org))?$/i.test(file.path),
  );
  if (readmeFile) return readmeFile.path;

  // 2. Look for any markdown files
  const markdownFile = fileList.find((file) =>
    /\.(md|markdown)$/i.test(file.path),
  );
  if (markdownFile) return markdownFile.path;

  // 3. Return first file (sorted alphabetically)
  const sortedFiles = fileList.sort((a, b) => a.path.localeCompare(b.path));
  return sortedFiles[0]?.path || null;
}

function encodeVaultFilePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

type CommitPreviewFile = {
  status: CommitPreviewFileStatus;
  path: string;
  previousPath?: string;
  additions: number;
  deletions: number;
  oldLineCount: number;
  newLineCount: number;
  isMarkdown: boolean;
  richOldContent?: string;
  richNewContent?: string;
  richContentTruncated?: boolean;
  patchTruncated: boolean;
  patch?: string;
};

type CommitPreview = {
  branch: string;
  hasDestructiveChanges: boolean;
  files: CommitPreviewFile[];
  totals: {
    files: number;
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    additions: number;
    deletions: number;
  };
  safety: {
    destructiveFileCount: number;
    truncatedPatchFileCount: number;
    includesTruncatedPatches: boolean;
  };
};

type BranchComparePreview =
  (typeof api.fileStagingActions.getBranchComparePreview)["_returnType"];
type RebaseConflictPreviewFile = {
  path: string;
  previousPath?: string;
  isMarkdown: boolean;
  baseBlobSha?: string;
  upstreamBlobSha: string;
  baseToStagedPatchTruncated: boolean;
  baseToStagedPatch?: string;
  baseToUpstreamPatchTruncated: boolean;
  baseToUpstreamPatch?: string;
};

type RebaseConflictPreview = {
  branch: string;
  files: RebaseConflictPreviewFile[];
};

type CommitReviewMode = "editor" | "review";
type SidebarMode = "simple" | "all";
type EffectiveSidebarMode = SidebarMode | "compare";
type StagedFileRecord = NonNullable<
  (typeof api.fileStaging.listStagedFiles)["_returnType"]
>[number];
type InlinePreviewSaveSnapshot = {
  stagingId: StagedFileRecord["_id"];
  content: string;
  baseVersion: number;
};

type RefreshTrigger = "focus" | "page_load";
const BRANCH_COMPARE_PREVIEW_STAGING_DEBOUNCE_MS = 1000;

function isStorageBackedFileError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toLowerCase().includes("in storage")
  );
}

function readGraphViewMode(storageKey: string): "editor" | "graph" | null {
  try {
    const storedMode = localStorage.getItem(storageKey);
    if (storedMode === "editor" || storedMode === "graph") {
      return storedMode;
    }
  } catch (error) {
    console.warn("Failed to read graph view preference", error);
  }
  return null;
}

function getPatchLineClassName(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (line.startsWith("@@")) {
    return "text-muted-foreground";
  }
  return "";
}

function matchesInlinePreviewSaveSnapshot(
  left: InlinePreviewSaveSnapshot | null,
  right: InlinePreviewSaveSnapshot,
): boolean {
  return (
    left?.stagingId === right.stagingId &&
    left.content === right.content &&
    left.baseVersion === right.baseVersion
  );
}

function buildInlinePreviewAutosaveContextKey(
  reviewMode: CommitReviewMode,
  activeStagingId: StagedFileRecord["_id"] | null,
  draftStagingId: StagedFileRecord["_id"] | null,
): string {
  return `${reviewMode}:${activeStagingId ?? "none"}:${draftStagingId ?? "none"}`;
}

const DEFAULT_INLINE_PREVIEW_OPTIONS = {
  allowInlineDiffs: false,
  syntaxHighlightDeletions: true,
} satisfies ProsemarkMergeEditorOptions;

const DEFAULT_SHOW_INLINE_PREVIEW_PATCH = false;
const UPSTREAM_CONFLICT_ERROR_PREFIX =
  "Commit conflicts with upstream changes. Resolve and retry: ";

function parseUpstreamConflictPaths(message: string | null): string[] {
  if (!message || !message.startsWith(UPSTREAM_CONFLICT_ERROR_PREFIX)) {
    return [];
  }

  return message
    .slice(UPSTREAM_CONFLICT_ERROR_PREFIX.length)
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

function getStagedFileStatus(
  file: StagedFileRecord,
): CommitPreviewFileStatus | null {
  if (file.fileDeleted) {
    return "deleted";
  }
  if (file.parentCommitSha === null) {
    return "added";
  }
  if (file.filePath !== file.initialFilePath) {
    return "renamed";
  }
  if (file.content !== file.initialContent) {
    return "modified";
  }
  return null;
}

function encodeGitHubPath(path: string): string {
  return encodeVaultFilePath(path);
}

function FileViewWrapper() {
  const navigate = useNavigate();
  const location = useLocation();
  const { search, state } = location;
  const isCompareRequested = useMemo(
    () => hasQueryParam(search, "compare"),
    [search],
  );

  const {
    owner,
    repoName,
    branch: branchParam,
    "*": filePathParam,
  } = useParams<{
    owner: string;
    repoName: string;
    branch?: string;
    "*": string;
  }>();

  const firstDocAction = useAction(api.fileStagingActions.getFileForEditing);
  const refreshTree = useAction(api.github.refreshRepositoryTree);
  const routeBranch = branchParam
    ? decodeRouteSegmentSafe(branchParam)
    : undefined;
  const selectedFile = filePathParam ?? "";
  const selectedFileFromBranchlessRoute = branchParam
    ? [routeBranch ?? branchParam, selectedFile]
        .filter((segment) => segment.length > 0)
        .join("/")
    : selectedFile;
  const repositoryFullName = owner && repoName ? `${owner}/${repoName}` : null;

  // Get vault for this repository
  // TODO: Keep vault existence checks on live query until useCacheQuery exposes
  // freshness metadata (cached null can trigger a false redirect to dashboard).
  const vault = useLiveQuery(api.vault.getVaultByRepository, {
    repositoryFullName: repositoryFullName ?? "skip",
    branch: routeBranch,
  });
  const branch = routeBranch ?? vault?.resolvedBranch;
  const storageBackedSelectionKey = `${branch ?? "unknown"}:${selectedFile}`;
  const vaultId = vault?._id;
  const selectedTreeEntry = useMemo(
    () =>
      vault?.treeData.tree.find(
        (item: { path: string }) => item.path === selectedFile,
      ) ?? null,
    [vault, selectedFile],
  );
  const selectedFileExistsInTree = selectedTreeEntry?.type === "blob";
  const legacyBranchlessFilePath = useMemo(
    () =>
      vault &&
      !vault.branchNotFound &&
      resolveLegacyBranchlessFilePath({
        branchSegment: routeBranch,
        selectedFile,
        selectedFileExistsInTree,
        tree: vault.treeData.tree,
      }),
    [vault, routeBranch, selectedFile, selectedFileExistsInTree],
  );
  const selectedFileIsRenderableMedia =
    isRenderableRepositoryMediaPath(selectedFile);
  const [storageBackedSelection, setStorageBackedSelection] = useState<
    Partial<Record<string, true>>
  >({});
  const appendCurrentSearch = useCallback(
    (path: string) => `${path}${search.length > 0 ? search : ""}`,
    [search],
  );

  useEffect(() => {
    if (vaultId) {
      setStorageBackedSelection({});
    }
  }, [vaultId, branch]);

  useEffect(() => {
    if (vault === null) {
      void navigate("/", { replace: true });
    }
  }, [vault, navigate]);

  useEffect(() => {
    if (!owner || !repoName || !branchParam || !vault?.branchNotFound) {
      return;
    }

    const resolvedBranch = vault.resolvedBranch;
    const encodedResolvedBranch = encodeURIComponent(resolvedBranch);
    const nextPath = selectedFileFromBranchlessRoute
      ? `/vault/${owner}/${repoName}/${encodedResolvedBranch}/${encodeVaultFilePath(selectedFileFromBranchlessRoute)}`
      : `/vault/${owner}/${repoName}/${encodedResolvedBranch}`;
    void navigate(appendCurrentSearch(nextPath), { replace: true, state });
  }, [
    appendCurrentSearch,
    owner,
    repoName,
    branchParam,
    selectedFileFromBranchlessRoute,
    state,
    vault?.branchNotFound,
    vault?.resolvedBranch,
    navigate,
  ]);

  useEffect(() => {
    if (!owner || !repoName || !branch || branchParam) {
      return;
    }
    const nextPath = selectedFile
      ? `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}/${encodeVaultFilePath(selectedFile)}`
      : `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}`;
    void navigate(appendCurrentSearch(nextPath), { replace: true, state });
  }, [
    appendCurrentSearch,
    owner,
    repoName,
    branch,
    branchParam,
    selectedFile,
    state,
    navigate,
  ]);

  useEffect(() => {
    if (
      !owner ||
      !repoName ||
      !branch ||
      !branchParam ||
      !legacyBranchlessFilePath
    ) {
      return;
    }
    const nextPath = `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}/${encodeVaultFilePath(legacyBranchlessFilePath)}`;
    void navigate(appendCurrentSearch(nextPath), { replace: true, state });
  }, [
    appendCurrentSearch,
    owner,
    repoName,
    branch,
    branchParam,
    legacyBranchlessFilePath,
    state,
    navigate,
  ]);

  const refreshTreeIfNeeded = useCallback(
    (trigger: RefreshTrigger = "focus") => {
      if (!vaultId || !owner || !repoName) return;
      const key = buildFileViewRefreshDebounceKey({
        owner,
        repoName,
        branch,
      });
      if (!claimRefreshDebounce("file_view", key)) return;
      void refreshTree({
        owner,
        repo: repoName,
        branch,
        includeAheadBehind: true,
        includePullRequestLinks: true,
        trigger,
      }).catch((error: unknown) => {
        console.error("Failed to refresh repository tree:", error);
        releaseRefreshDebounce("file_view", key);
      });
    },
    [vaultId, owner, repoName, branch, refreshTree],
  );

  // Refresh tree from GitHub when the page regains focus (debounced to 2 min).
  // Initial page-load refreshes use a shorter server-side debounce window.
  useEffect(() => {
    if (!vaultId || !owner || !repoName) return;

    const handleFocus = () => {
      refreshTreeIfNeeded();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshTreeIfNeeded();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Initial sync when the vault loads while this tab is already active.
    if (document.visibilityState === "visible") {
      refreshTreeIfNeeded("page_load");
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [vaultId, owner, repoName, refreshTreeIfNeeded]);

  // Auto-redirect to best file when no file is selected
  useEffect(() => {
    if (
      isCompareRequested ||
      selectedFile ||
      !branch ||
      !owner ||
      !repoName ||
      (vault?.treeData.tree ?? []).length === 0
    ) {
      return;
    }

    const bestFile = findBestInitialFile(vault?.treeData.tree ?? []);
    if (bestFile) {
      void navigate(
        appendCurrentSearch(
          `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}/${encodeVaultFilePath(bestFile)}`,
        ),
        {
          replace: true,
          state,
        },
      );
    }
  }, [
    appendCurrentSearch,
    selectedFile,
    vault,
    owner,
    repoName,
    branch,
    isCompareRequested,
    state,
    navigate,
  ]);

  const stagedFile = useQuery(
    api.fileStaging.getByNewPath,
    vault && branch && selectedFile
      ? {
          branch,
          newPath: selectedFile,
          vaultId: vault._id,
        }
      : "skip",
  );

  // If a selected file path does not exist in this vault, redirect to the best initial file.
  useEffect(() => {
    if (isCompareRequested) return;
    if (!selectedFile || !vault || !owner || !repoName || !branch) return;
    // Wait until staging query resolves before deciding that the file is missing.
    if (stagedFile === undefined) return;
    if (stagedFile || selectedFileExistsInTree) return;

    const bestFile = findBestInitialFile(vault.treeData.tree);
    if (bestFile) {
      void navigate(
        appendCurrentSearch(
          `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}/${encodeVaultFilePath(bestFile)}`,
        ),
        {
          replace: true,
          state,
        },
      );
      return;
    }

    void navigate(
      appendCurrentSearch(
        `/vault/${owner}/${repoName}/${encodeURIComponent(branch)}`,
      ),
      {
        replace: true,
        state,
      },
    );
  }, [
    appendCurrentSearch,
    selectedFile,
    vault,
    owner,
    repoName,
    stagedFile,
    selectedFileExistsInTree,
    branch,
    isCompareRequested,
    state,
    navigate,
  ]);

  // If file not staged,
  useEffect(() => {
    if (
      !isCompareRequested &&
      selectedFile &&
      branch &&
      vault &&
      stagedFile === null &&
      selectedFileExistsInTree &&
      !selectedFileIsRenderableMedia &&
      !storageBackedSelection[storageBackedSelectionKey]
    ) {
      void firstDocAction({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: selectedFile,
        branch,
      }).catch((error: unknown) => {
        if (isStorageBackedFileError(error)) {
          setStorageBackedSelection((previous) => ({
            ...previous,
            [storageBackedSelectionKey]: true,
          }));
          return;
        }
        console.error("Failed to stage file for editing:", error);
      });
    }
  }, [
    selectedFile,
    branch,
    vault,
    stagedFile,
    selectedFileExistsInTree,
    selectedFileIsRenderableMedia,
    isCompareRequested,
    storageBackedSelection,
    storageBackedSelectionKey,
    firstDocAction,
    owner,
    repoName,
  ]);

  if (!vault || !owner || !repoName || !branch) {
    return null;
  }

  return (
    <FileViewInner
      vault={vault}
      selectedFile={selectedFile}
      branch={branch}
      owner={owner}
      repoName={repoName}
      stagedFile={stagedFile ?? null}
    />
  );
}

function FileViewInner({
  vault,
  selectedFile,
  branch,
  owner,
  repoName,
  stagedFile,
}: {
  vault: NonNullable<(typeof api.vault.getVaultByRepository)["_returnType"]>;
  branch: string;
  selectedFile: string;
  owner: string;
  repoName: string;
  stagedFile: (typeof api.fileStaging.getByNewPath)["_returnType"];
}) {
  const { setOpenMobile } = useSidebar();

  const navigate = useNavigate();
  const { search, state } = useLocation();
  const reviewOnMountRequested = useMemo(
    () => hasQueryParam(search, "review"),
    [search],
  );
  const isCompareRequested = useMemo(
    () => hasQueryParam(search, "compare"),
    [search],
  );

  // Get current user for sidebar
  const user = useQuery(api.users.viewer);
  const remoteBranches = useQuery(api.vault.getVaultRemoteBranches, {
    vaultId: vault._id,
  });
  const refreshRepositoryTree = useAction(api.github.refreshRepositoryTree);
  const [mobileEditorChatDockInset, setMobileEditorChatDockInset] = useState<
    string | undefined
  >(undefined);

  // Dialog state management
  const {
    fileCreationDialog,
    folderCreationDialog,
    openFileCreation,
    closeFileCreation,
    openFolderCreation,
    closeFolderCreation,
  } = useDialog();

  const repositoryFullName = `${owner}/${repoName}`;
  const encodedBranch = encodeURIComponent(branch);
  const selectedFileIsRenderableMedia =
    isRenderableRepositoryMediaPath(selectedFile);
  const commitSha = vault.commitSHA;
  const selectedFileGitHubUrl = selectedFile
    ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/blob/${encodeGitHubPath(branch)}/${encodeGitHubPath(selectedFile)}`
    : `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/tree/${encodeGitHubPath(branch)}`;

  // Folder expansion state
  const folderExpansionStates = useQuery(
    api.folderExpansion.getFolderExpansionStates,
    { vaultId: vault._id },
  );
  const setFolderExpansionState = useMutation(
    api.folderExpansion.setFolderExpansionState,
  ).withOptimisticUpdate((localStore, args) => {
    const currentValue = localStore.getQuery(
      api.folderExpansion.getFolderExpansionStates,
      {
        vaultId: vault._id,
      },
    );

    if (currentValue) {
      const newState = [...currentValue];

      const folderIndex = newState.findIndex(
        (folder) => folder.folderPath === args.folderPath,
      );

      if (folderIndex !== -1) {
        newState[folderIndex].isExpanded = args.isExpanded;
      } else {
        newState.push({
          folderPath: args.folderPath,
          isExpanded: args.isExpanded,
        });
      }

      localStore.setQuery(
        api.folderExpansion.getFolderExpansionStates,
        {
          vaultId: vault._id,
        },
        newState,
      );
    }
  });

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [draftPullRequestError, setDraftPullRequestError] = useState<
    string | null
  >(null);
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(
    null,
  );
  const [commitPreviewError, setCommitPreviewError] = useState<string | null>(
    null,
  );
  const [branchComparePreview, setBranchComparePreview] =
    useState<BranchComparePreview | null>(null);
  const [branchComparePreviewError, setBranchComparePreviewError] = useState<
    string | null
  >(null);
  const [rebaseConflictPreview, setRebaseConflictPreview] =
    useState<RebaseConflictPreview | null>(null);
  const [rebaseConflictPreviewError, setRebaseConflictPreviewError] = useState<
    string | null
  >(null);
  const [rebaseConflictBundleFeedback, setRebaseConflictBundleFeedback] =
    useState<string | null>(null);
  const [restoringDeletedFilePath, setRestoringDeletedFilePath] = useState<
    string | null
  >(null);
  const [inlinePreviewDraftStagingId, setInlinePreviewDraftStagingId] =
    useState<StagedFileRecord["_id"] | null>(null);
  const [inlinePreviewDraftContent, setInlinePreviewDraftContent] =
    useState("");
  const [inlinePreviewDraftBaseVersion, setInlinePreviewDraftBaseVersion] =
    useState(0);
  const [
    inlinePreviewHasPendingLocalEdit,
    setInlinePreviewHasPendingLocalEdit,
  ] = useState(false);
  const [inlinePreviewOptions, setInlinePreviewOptions] =
    useState<ProsemarkMergeEditorOptions>(DEFAULT_INLINE_PREVIEW_OPTIONS);
  const [showInlinePreviewPatch, setShowInlinePreviewPatch] = useState(
    DEFAULT_SHOW_INLINE_PREVIEW_PATCH,
  );
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [inlinePreviewSaveError, setInlinePreviewSaveError] = useState<
    string | null
  >(null);
  const [inlinePreviewInFlightSave, setInlinePreviewInFlightSave] =
    useState<InlinePreviewSaveSnapshot | null>(null);
  const [inlinePreviewFailedSave, setInlinePreviewFailedSave] =
    useState<InlinePreviewSaveSnapshot | null>(null);
  const inlinePreviewDraftContentRef = useRef("");
  const restoringDeletedFilePathRef = useRef<string | null>(null);
  const activePreviewStagingIdRef = useRef<StagedFileRecord["_id"] | null>(
    null,
  );
  const flushPendingInlinePreviewSaveRef = useRef<(() => void) | null>(null);
  const inlinePreviewAutosaveContextKeyRef = useRef("");
  const inlinePreviewMountedRef = useRef(true);

  // Convex hooks for staging
  const [commitStaging, manualComittingStatus] = useConvexAction(
    api.fileStagingActions.commitStaging,
  );
  const [createDraftPullRequest, draftPullRequestStatus] = useConvexAction(
    api.fileStagingActions.createDraftPullRequest,
  );
  const [
    createDraftPullRequestFromDefaultBranch,
    defaultBranchDraftPullRequestStatus,
  ] = useConvexAction(
    api.fileStagingActions.createDraftPullRequestFromDefaultBranch,
  );
  const [getCommitPreview, commitPreviewStatus] = useConvexAction(
    api.fileStagingActions.getCommitPreview,
  );
  const [getBranchComparePreview] = useConvexAction(
    api.fileStagingActions.getBranchComparePreview,
  );
  const [getRebaseConflictPreview, rebaseConflictPreviewStatus] =
    useConvexAction(api.fileStagingActions.getRebaseConflictPreview);
  const [getRebaseConflictBundle, rebaseConflictBundleStatus] = useConvexAction(
    api.fileStagingActions.getRebaseConflictBundle,
  );
  const [pullFromGitHub, pullFromGitHubStatus] = useConvexAction(
    api.fileStagingActions.pullFromGitHub,
  );
  const [clearAllStaging, clearingStagingStatus] = useConvexMutation(
    api.fileStaging.clearAllStaging,
  );
  const [updateStagedFileContent] = useConvexMutation(
    api.fileStaging.updateStagedFileContent,
  );

  const [markFileForDeletion] = useConvexMutation(
    api.fileStaging.markFileForDeletion,
  );
  const [revertDeletedFileInStaging] = useConvexMutation(
    api.fileStaging.revertDeletedFileInStaging,
  );
  const [restoreComparedDeletedFileToStaging] = useConvexAction(
    api.fileStagingActions.restoreComparedDeletedFileToStaging,
  );
  const [renameFileInStaging] = useConvexAction(
    api.fileStagingActions.renameFileInStaging,
  );
  const loadRepositoryFileContent = useAction(
    api.github.getRepositoryFileContent,
  );
  const stageFileForEditing = useAction(
    api.fileStagingActions.getFileForEditing,
  );
  const isDiffRequested = useMemo(
    () => hasQueryParam(search, "diff"),
    [search],
  );

  // Get count of staged files for this vault
  const stagedFiles = useQuery(
    api.fileStaging.listStagedFiles,
    {
      vaultId: vault._id,
      branch,
    },
    {
      dontCache: isDiffRequested || reviewOnMountRequested,
    },
  );
  const stagedNoterFile = useQuery(
    api.fileStaging.getByNewPath,
    {
      branch,
      vaultId: vault._id,
      newPath: SIMPLE_VIEW_CONFIG_PATH,
    },
    {
      dontCache: true,
    },
  );
  const [repositoryNoterContent, setRepositoryNoterContent] = useState<
    string | null
  >(null);
  const [didAttemptRepositoryNoterLoad, setDidAttemptRepositoryNoterLoad] =
    useState(false);
  const [didResolveRepositoryNoterLoad, setDidResolveRepositoryNoterLoad] =
    useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("all");
  const [sidebarModeHydrated, setSidebarModeHydrated] = useState(false);

  const createFileInStaging = useMutation(api.fileStaging.createFileInStaging);
  const showMobileEditorLineNumbers = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("mobileLineNumbers") === "1";
  }, [search]);
  const commitReviewMode = useMemo<CommitReviewMode>(() => {
    return isDiffRequested ? "review" : "editor";
  }, [isDiffRequested]);
  const [allowAutoExitReview, setAllowAutoExitReview] = useState(true);
  const reviewRouteKeyRef = useRef<string | null>(null);
  const branchComparePreviewRequestKeyRef = useRef<string | null>(null);
  const branchComparePreviewRequestedTargetKeyRef = useRef<string | null>(null);
  const branchComparePreviewRequestedStagingKeyRef = useRef<string | null>(
    null,
  );
  const branchComparePreviewReloadTimeoutRef = useRef<number | null>(null);
  const currentRemoteBranch = useMemo(
    () =>
      remoteBranches?.find(
        (remoteBranch) =>
          remoteBranch.name === branch && remoteBranch.remoteState === "active",
      ) ?? null,
    [branch, remoteBranches],
  );
  const currentPullRequestNumber = currentRemoteBranch?.pullRequestNumber;
  const currentPullRequestUrl = currentRemoteBranch?.pullRequestUrl;
  const didResolveRemoteBranches = remoteBranches !== undefined;
  const isDefaultBranch =
    currentRemoteBranch?.isDefault ??
    (typeof vault.defaultBranch === "string" && branch === vault.defaultBranch);
  const currentBranchPullRequestNumber = isDefaultBranch
    ? undefined
    : currentPullRequestNumber;
  const currentBranchPullRequestUrl = isDefaultBranch
    ? undefined
    : currentPullRequestUrl;
  const hasCurrentBranchPullRequest = currentBranchPullRequestUrl != null;

  // Add command palette keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "p" &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasNoterConfigFile = hasSimpleViewConfigFile(
    stagedNoterFile,
    repositoryNoterContent,
  );
  const hasDeletedStagedNoterFile =
    isStagedSimpleViewConfigDeleted(stagedNoterFile);
  const didResolveSimpleViewConfigSource =
    stagedNoterFile !== undefined &&
    (hasStagedSimpleViewConfigFile(stagedNoterFile) ||
      hasDeletedStagedNoterFile ||
      didResolveRepositoryNoterLoad);

  const sidebarModeStorageKey = useMemo(
    () => getSimpleViewPreferenceStorageKey(vault._id),
    [vault._id],
  );
  const graphViewStorageKey = useMemo(
    () => `noter:graph-view:${vault._id}`,
    [vault._id],
  );
  const [viewMode, setViewMode] = useState<"editor" | "graph">(() => {
    return readGraphViewMode(graphViewStorageKey) ?? "editor";
  });
  const [viewModeHydrated, setViewModeHydrated] = useState(false);

  useEffect(() => {
    setRepositoryNoterContent(null);
    setDidAttemptRepositoryNoterLoad(false);
    setDidResolveRepositoryNoterLoad(false);
    setSidebarModeHydrated(false);
  }, [vault._id, branch]);

  useEffect(() => {
    setViewModeHydrated(false);
    const storedMode = readGraphViewMode(graphViewStorageKey);
    setViewMode(storedMode ?? "editor");
    setViewModeHydrated(true);
  }, [graphViewStorageKey]);

  useEffect(() => {
    if (!viewModeHydrated) {
      return;
    }
    try {
      localStorage.setItem(graphViewStorageKey, viewMode);
    } catch (error) {
      console.warn("Failed to persist graph view preference", error);
    }
  }, [graphViewStorageKey, viewMode, viewModeHydrated]);

  useEffect(() => {
    if (viewMode === "graph" && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  }, [viewMode, isPreviewOpen]);

  useEffect(() => {
    if (commitReviewMode === "review" && viewMode !== "editor") {
      setViewMode("editor");
    }
  }, [commitReviewMode, setViewMode, viewMode]);

  useEffect(() => {
    if (
      !shouldLoadRepositorySimpleViewConfig(
        stagedNoterFile,
        didAttemptRepositoryNoterLoad,
      )
    ) {
      return;
    }

    let cancelled = false;

    void loadRepositoryFileContent({
      repositoryFullName,
      filePath: SIMPLE_VIEW_CONFIG_PATH,
      branch,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDidAttemptRepositoryNoterLoad(true);
        setRepositoryNoterContent(result.exists ? result.content : null);
        setDidResolveRepositoryNoterLoad(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setDidAttemptRepositoryNoterLoad(true);
        setRepositoryNoterContent(null);
        setDidResolveRepositoryNoterLoad(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    branch,
    didAttemptRepositoryNoterLoad,
    loadRepositoryFileContent,
    repositoryFullName,
    stagedNoterFile,
  ]);

  useEffect(() => {
    if (!didResolveSimpleViewConfigSource) {
      return;
    }
    const defaultMode: SidebarMode = hasNoterConfigFile ? "simple" : "all";

    try {
      const storedMode = localStorage.getItem(sidebarModeStorageKey);
      if (storedMode === "simple" || storedMode === "all") {
        setSidebarMode(storedMode);
        setSidebarModeHydrated(true);
        return;
      }
    } catch (error) {
      console.warn("Failed to read sidebar view preference", error);
    }

    setSidebarMode(defaultMode);
    setSidebarModeHydrated(true);
  }, [
    didResolveSimpleViewConfigSource,
    hasNoterConfigFile,
    sidebarModeStorageKey,
  ]);

  useEffect(() => {
    if (!didResolveSimpleViewConfigSource || !sidebarModeHydrated) {
      return;
    }
    try {
      localStorage.setItem(sidebarModeStorageKey, sidebarMode);
    } catch (error) {
      console.warn("Failed to persist sidebar view preference", error);
    }
  }, [
    didResolveSimpleViewConfigSource,
    sidebarMode,
    sidebarModeHydrated,
    sidebarModeStorageKey,
  ]);

  const stagedNoterContent = hasStagedSimpleViewConfigFile(stagedNoterFile)
    ? stagedNoterFile.content
    : null;
  const noterConfigContent = hasDeletedStagedNoterFile
    ? null
    : stagedNoterContent ?? repositoryNoterContent;

  const simpleViewConfig = useMemo(
    () => parseSimpleViewConfig(noterConfigContent),
    [noterConfigContent],
  );
  const buildVaultFileUrl = useCallback(
    (
      path: string,
      options?: {
        branch?: string;
        reviewMode?: CommitReviewMode;
        compare?: boolean;
      },
    ) => {
      const targetBranch = options?.branch ?? branch;
      const encodedTargetBranch = encodeURIComponent(targetBranch);
      const preserveCurrentReviewMode = options?.reviewMode === undefined;
      const preserveCurrentCompareMode = options?.compare === undefined;
      const preserveReviewOnMount =
        preserveCurrentReviewMode &&
        hasQueryParam(search, "review") &&
        !hasQueryParam(search, "diff");
      const includeDiff =
        options?.reviewMode === "review" ||
        (preserveCurrentReviewMode && hasQueryParam(search, "diff"));
      const includeCompare =
        options?.compare === true ||
        (preserveCurrentCompareMode && hasQueryParam(search, "compare"));
      const pathname =
        path.length > 0
          ? `/vault/${owner}/${repoName}/${encodedTargetBranch}/${encodeVaultFilePath(path)}`
          : `/vault/${owner}/${repoName}/${encodedTargetBranch}`;
      return buildPathWithUpdatedQuery(
        {
          pathname,
          search,
        },
        (searchParams) => {
          setQueryParam(searchParams, "review", preserveReviewOnMount);
          setQueryParam(searchParams, "diff", includeDiff);
          setQueryParam(searchParams, "compare", includeCompare);
        },
      );
    },
    [branch, owner, repoName, search],
  );
  const setReviewModeInQuery = useCallback(
    (
      mode: CommitReviewMode,
      options?: {
        replace?: boolean;
      },
    ) => {
      void navigate(buildVaultFileUrl(selectedFile, { reviewMode: mode }), {
        replace: options?.replace,
        state,
      });
    },
    [buildVaultFileUrl, navigate, selectedFile, state],
  );
  const setCompareModeInQuery = useCallback(
    (
      enabled: boolean,
      options?: {
        replace?: boolean;
      },
    ) => {
      void navigate(buildVaultFileUrl(selectedFile, { compare: enabled }), {
        replace: options?.replace,
        state,
      });
    },
    [buildVaultFileUrl, navigate, selectedFile, state],
  );
  const resetRebaseConflictState = useCallback(() => {
    setRebaseConflictPreview(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);
  }, []);
  const loadRebaseConflictPreview = useCallback(
    (fallbackMessage?: string) => {
      setRebaseConflictPreviewError(null);
      setRebaseConflictBundleFeedback(null);

      return getRebaseConflictPreview({
        repositoryFullName,
        branch,
      })
        .then((preview) => {
          setCommitPreview(null);
          setCommitPreviewError(null);

          if (preview.files.length === 0) {
            setRebaseConflictPreview(null);
            setRebaseConflictPreviewError(
              fallbackMessage ??
                "Commit was blocked by upstream changes, but no current conflict preview was found.",
            );
            return null;
          }

          setRebaseConflictPreview(preview);

          if (!preview.files.some((file) => file.path === selectedFile)) {
            void navigate(
              buildVaultFileUrl(preview.files[0].path, {
                reviewMode: "review",
              }),
              { state },
            );
          }

          return preview;
        })
        .catch((error) => {
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to load rebase conflict preview";
          setRebaseConflictPreview(null);
          setRebaseConflictPreviewError(message);
        });
    },
    [
      branch,
      buildVaultFileUrl,
      getRebaseConflictPreview,
      navigate,
      repositoryFullName,
      selectedFile,
      state,
    ],
  );
  const handleUpstreamConflictDetected = useCallback(
    (message: string) => {
      setAllowAutoExitReview(false);
      setCommitError(message);
      setCommitPreview(null);
      setCommitPreviewError(null);
      if (commitReviewMode !== "review") {
        setReviewModeInQuery("review");
      }
      void loadRebaseConflictPreview(message);
    },
    [commitReviewMode, loadRebaseConflictPreview, setReviewModeInQuery],
  );
  const handleCopyRebaseConflictBundle = useCallback(() => {
    if (!rebaseConflictPreview || rebaseConflictPreview.files.length === 0) {
      return;
    }

    try {
      void getRebaseConflictBundle({
        repositoryFullName,
        branch: rebaseConflictPreview.branch,
      })
        .then((bundle) => navigator.clipboard.writeText(bundle))
        .then(() => {
          setRebaseConflictBundleFeedback("Conflict bundle copied.");
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to copy conflict bundle.";
          setRebaseConflictBundleFeedback(message);
        });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Clipboard is unavailable in this browser.";
      setRebaseConflictBundleFeedback(message);
    }
  }, [getRebaseConflictBundle, rebaseConflictPreview, repositoryFullName]);

  const handleFileSelect = useCallback(
    (path: string, status?: CommitPreviewFileStatus) => {
      if (owner && repoName) {
        void navigate(
          buildVaultFileUrl(path, {
            reviewMode: status === "deleted" ? "review" : undefined,
          }),
          { state },
        );

        // close the sidebar
        setOpenMobile(false);
      }
    },
    [buildVaultFileUrl, navigate, owner, repoName, setOpenMobile, state],
  );

  const handleOpenFileFromGraph = useCallback(
    (path: string) => {
      setViewMode("editor");
      handleFileSelect(path);
    },
    [handleFileSelect],
  );

  const handleFileRename = async (originalPath: string, newPath: string) => {
    if (!owner || !repoName) return;

    try {
      await stageFileForEditing({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: originalPath,
        branch,
      });

      // Rename the file in staging instead of committing immediately
      await renameFileInStaging({
        vaultId: vault._id,
        originalPath,
        newPath,
        branch,
      });

      // Renamed staging rows keep their initial path as the mutation key, so a
      // second rename needs to follow either the current selected path or the
      // selected staged row's initial path.
      if (
        selectedFile === originalPath ||
        stagedFile?.initialFilePath === originalPath
      ) {
        void navigate(buildVaultFileUrl(newPath), { state });
      }

      console.log(`File ${originalPath} renamed to ${newPath} in staging`);
    } catch (error) {
      console.error("Failed to rename file:", error);
    }
  };

  // Handler for deleting files from the file tree
  const handleFileDelete = async (
    filePath: string,
    originalPath = filePath,
  ) => {
    if (!owner || !repoName) return;

    try {
      // Get the file's SHA from the tree (null for new files)
      const fileSha =
        vault.treeData.tree.find((t: GithubTreeType) => t.path === originalPath)
          ?.sha ?? null;

      // Ensure we retain original file content in staging for review mode.
      if (fileSha) {
        try {
          await stageFileForEditing({
            repositoryFullName: `${owner}/${repoName}`,
            originalFilePath: originalPath,
            branch,
          });
        } catch (error) {
          if (!isStorageBackedFileError(error)) {
            throw error;
          }
        }
      }

      // Mark the file for deletion in staging
      await markFileForDeletion({
        vaultId: vault._id,
        filePath,
        parentCommitSha: fileSha,
        branch,
      });

      // If the deleted file is currently selected, navigate away
      if (selectedFile === filePath) {
        if (commitReviewMode === "review") {
          return;
        }
        void navigate(buildVaultFileUrl("", { reviewMode: "editor" }), {
          state,
        });
      }

      console.log(`File ${filePath} marked for deletion`);
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  };

  const handleRestoreDeletedFile = async (
    filePath: string,
    originalPath = filePath,
  ) => {
    if (restoringDeletedFilePathRef.current !== null) {
      return;
    }

    restoringDeletedFilePathRef.current = filePath;
    setRestoringDeletedFilePath(filePath);

    try {
      const deletedStagedFile =
        stagedFiles?.find(
          (candidate) =>
            candidate.filePath === filePath && candidate.fileDeleted,
        ) ?? null;
      const comparedDeletedFile =
        branchComparePreview?.files.find(
          (file) => file.path === filePath && file.status === "deleted",
        ) ?? null;

      if (deletedStagedFile) {
        await revertDeletedFileInStaging({
          vaultId: vault._id,
          filePath,
          branch,
        });
      } else if (comparedDeletedFile) {
        await restoreComparedDeletedFileToStaging({
          repositoryFullName,
          branch,
          filePath,
          previousPath:
            originalPath !== filePath
              ? originalPath
              : comparedDeletedFile.previousPath,
        });
      } else {
        throw new Error("Deleted file is not available to restore.");
      }

      if (selectedFile === filePath) {
        void navigate(buildVaultFileUrl(filePath, { reviewMode: "editor" }), {
          replace: true,
          state,
        });
      }
    } catch (error) {
      console.error("Failed to restore deleted file:", error);
    } finally {
      if (restoringDeletedFilePathRef.current === filePath) {
        restoringDeletedFilePathRef.current = null;
      }
      setRestoringDeletedFilePath((current) =>
        current === filePath ? null : current,
      );
    }
  };

  // Handler for creating files in specific folders from the file tree
  const handleCreateFileInFolder = (folderPath: string, fileName: string) => {
    if (!owner || !repoName || !fileName.trim()) return;

    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

    createFileInStaging({
      vaultId: vault._id,
      filePath,
      content: "",
      branch,
    })
      .then(() => {
        // Navigate to the new file
        void navigate(
          `/vault/${owner}/${repoName}/${encodedBranch}/${encodeVaultFilePath(filePath)}`,
        );
      })
      .catch((error) => {
        console.error("Failed to create file:", error);
      });
  };

  // Handler for creating folders in specific paths from the file tree
  const handleCreateFolderInFolder = (
    folderPath: string,
    folderName: string,
  ) => {
    if (!owner || !repoName || !folderName.trim()) return;

    const newFolderPath = folderPath
      ? `${folderPath}/${folderName}`
      : folderName;
    const readmeFilePath = `${newFolderPath}/README.md`;

    // Create a README file in the folder to make the folder exist in Git
    createFileInStaging({
      vaultId: vault._id,
      filePath: readmeFilePath,
      content: `# ${folderName}\n\nThis folder was created automatically.`,
      branch,
    }).catch((error) => {
      console.error("Failed to create folder:", error);
    });
  };

  const handleManualCommit = useCallback(() => {
    setCommitError(null);
    setDraftPullRequestError(null);
    setCommitPreviewError(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    void commitStaging({
      repositoryFullName: repositoryFullName,
      branch,
    }).catch((error) => {
      console.error("Failed to commit changes:", error);
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Commit failed";
      if (parseUpstreamConflictPaths(message).length > 0) {
        handleUpstreamConflictDetected(message);
        return;
      }
      setCommitError(message);
    });
  }, [
    branch,
    commitStaging,
    handleUpstreamConflictDetected,
    repositoryFullName,
  ]);

  const handleDraftPullRequest = useCallback(() => {
    setCommitError(null);
    setDraftPullRequestError(null);
    setCommitPreviewError(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    if (currentBranchPullRequestUrl) {
      window.open(currentBranchPullRequestUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!isDefaultBranch && !didResolveRemoteBranches) {
      return;
    }

    const pendingPullRequestWindow = window.open("", "_blank");
    const handleCreatedPullRequest = async (args: {
      url: string;
      nextBranch: string;
    }) => {
      try {
        await refreshRepositoryTree({
          owner,
          repo: repoName,
          branch: args.nextBranch,
          includeAheadBehind: true,
          includePullRequestLinks: true,
        });
      } catch (error) {
        console.warn("Failed to refresh tree after draft PR:", error);
      }
      if (args.nextBranch !== branch) {
        void navigate(
          buildVaultFileUrl(selectedFile, { branch: args.nextBranch }),
          {
            state,
          },
        );
      }
      if (pendingPullRequestWindow && !pendingPullRequestWindow.closed) {
        pendingPullRequestWindow.opener = null;
        pendingPullRequestWindow.location.replace(args.url);
        return;
      }
      const openedWindow = window.open(
        args.url,
        "_blank",
        "noopener,noreferrer",
      );
      if (!openedWindow) {
        setDraftPullRequestError(
          "Draft pull request created, but the browser blocked opening a new tab.",
        );
      }
    };

    const handleDraftPullRequestError = (error: unknown) => {
      if (pendingPullRequestWindow && !pendingPullRequestWindow.closed) {
        pendingPullRequestWindow.close();
      }
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Failed to create draft pull request";
      if (parseUpstreamConflictPaths(message).length > 0) {
        handleUpstreamConflictDetected(message);
        return;
      }
      setDraftPullRequestError(message);
    };

    if (isDefaultBranch) {
      void createDraftPullRequestFromDefaultBranch({
        repositoryFullName,
        branch,
      })
        .then((result) =>
          handleCreatedPullRequest({
            url: result.url,
            nextBranch: result.branch,
          }),
        )
        .catch(handleDraftPullRequestError);
      return;
    }

    void createDraftPullRequest({
      repositoryFullName,
      branch,
    })
      .then((result) =>
        handleCreatedPullRequest({
          url: result.url,
          nextBranch: branch,
        }),
      )
      .catch(handleDraftPullRequestError);
  }, [
    branch,
    buildVaultFileUrl,
    createDraftPullRequest,
    createDraftPullRequestFromDefaultBranch,
    currentBranchPullRequestUrl,
    didResolveRemoteBranches,
    handleUpstreamConflictDetected,
    isDefaultBranch,
    navigate,
    owner,
    refreshRepositoryTree,
    repoName,
    repositoryFullName,
    selectedFile,
    state,
  ]);

  const handleResetToGitHub = useCallback(() => {
    setCommitError(null);
    setDraftPullRequestError(null);
    setCommitPreviewError(null);
    resetRebaseConflictState();
    void clearAllStaging({
      vaultId: vault._id,
      branch,
    }).catch((error) => {
      console.error("Failed to reset staged files:", error);
    });
  }, [branch, clearAllStaging, resetRebaseConflictState, vault._id]);

  const loadCommitPreview = useCallback(() => {
    setCommitPreviewError(null);
    return getCommitPreview({
      repositoryFullName,
      branch,
      includePatch: true,
    })
      .then((preview) => {
        setCommitPreview(preview);
        resetRebaseConflictState();
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Failed to load commit preview";
        if (parseUpstreamConflictPaths(message).length > 0) {
          handleUpstreamConflictDetected(message);
          return;
        }
        setCommitPreviewError(message);
      });
  }, [
    branch,
    getCommitPreview,
    handleUpstreamConflictDetected,
    repositoryFullName,
    resetRebaseConflictState,
  ]);
  const loadBranchComparePreview = useCallback(
    (requestKey: string) => {
      setBranchComparePreviewError(null);
      return getBranchComparePreview({
        repositoryFullName,
        branch,
        includePatch: true,
      })
        .then((preview) => {
          if (branchComparePreviewRequestKeyRef.current !== requestKey) {
            return;
          }
          setBranchComparePreview(preview);
        })
        .catch((error) => {
          if (branchComparePreviewRequestKeyRef.current !== requestKey) {
            return;
          }
          const message =
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to load branch comparison";
          setBranchComparePreview(null);
          setBranchComparePreviewError(message);
        });
    },
    [branch, getBranchComparePreview, repositoryFullName],
  );
  const clearBranchComparePreviewReloadTimeout = useCallback(() => {
    if (branchComparePreviewReloadTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(branchComparePreviewReloadTimeoutRef.current);
    branchComparePreviewReloadTimeoutRef.current = null;
  }, []);

  const handleRebaseOntoLatestGitHub = useCallback(() => {
    setAllowAutoExitReview(false);
    setCommitError(null);
    setCommitPreviewError(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    void pullFromGitHub({ vaultId: vault._id })
      .then(() => {
        resetRebaseConflictState();
        return loadCommitPreview();
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Failed to rebase staging onto latest GitHub.";
        setRebaseConflictPreviewError(message);
      });
  }, [loadCommitPreview, pullFromGitHub, resetRebaseConflictState, vault._id]);

  const resetCommitPreviewState = useCallback(() => {
    setCommitPreview(null);
    setInlinePreviewSaveError(null);
    resetRebaseConflictState();
  }, [resetRebaseConflictState]);

  const handleToggleReviewMode = useCallback(() => {
    if (commitReviewMode === "review") {
      setReviewModeInQuery("editor");
      return;
    }

    setAllowAutoExitReview(true);
    resetCommitPreviewState();
    setReviewModeInQuery("review");
  }, [commitReviewMode, resetCommitPreviewState, setReviewModeInQuery]);

  const handleFolderToggle = useCallback(
    (folderPath: string, isExpanded: boolean) => {
      void setFolderExpansionState({
        vaultId: vault._id,
        folderPath,
        isExpanded,
      });
    },
    [setFolderExpansionState, vault._id],
  );

  if (!owner || !repoName) {
    void navigate("/");
  }

  const selectedRebaseConflictFile =
    rebaseConflictPreview?.files.find((file) => file.path === selectedFile) ??
    null;
  const selectedCommitPreviewFile =
    commitPreview?.files.find((file) => file.path === selectedFile) ?? null;
  const selectedComparedFile =
    branchComparePreview?.files.find((file) => file.path === selectedFile) ??
    null;
  const selectedPreviewFile = isCompareRequested
    ? selectedComparedFile ?? selectedCommitPreviewFile
    : selectedCommitPreviewFile;
  const selectedPreviewStagedFile = stagedFile ?? null;
  const sidebarSelectedFile = selectedFile;
  // Compare-only text files do not have staging rows, so their merge view has
  // to come from the preview payload instead of fileStaging.
  const selectedPreviewHasRichTextDiff = Boolean(
    selectedPreviewFile &&
      typeof selectedPreviewFile.richOldContent === "string" &&
      typeof selectedPreviewFile.richNewContent === "string",
  );
  const selectedPreviewCanRenderInline = Boolean(
    !selectedFileIsRenderableMedia &&
      (isCompareRequested
        ? selectedPreviewHasRichTextDiff ||
          (!selectedComparedFile && selectedPreviewStagedFile)
        : selectedPreviewStagedFile || selectedPreviewHasRichTextDiff),
  );
  const selectedPreviewBaseContent =
    isCompareRequested &&
    typeof selectedComparedFile?.richOldContent === "string"
      ? selectedComparedFile.richOldContent
      : selectedPreviewStagedFile?.initialContent ??
        selectedPreviewFile?.richOldContent ??
        "";
  const selectedComparedFileCanRenderInline = Boolean(
    selectedComparedFile &&
      typeof selectedComparedFile.richOldContent === "string" &&
      typeof selectedComparedFile.richNewContent === "string" &&
      !selectedFileIsRenderableMedia,
  );
  const activePreviewPersistedContent = selectedPreviewStagedFile
    ? selectedPreviewStagedFile.fileDeleted
      ? ""
      : selectedPreviewStagedFile.content
    : selectedPreviewFile?.richNewContent ?? "";
  const activePreviewPersistedVersion = selectedPreviewStagedFile?.version ?? 0;
  const activePreviewStagingId = selectedPreviewStagedFile?._id ?? null;
  const inlinePreviewEditable = Boolean(
    selectedPreviewStagedFile && !selectedPreviewStagedFile.fileDeleted,
  );
  const inlinePreviewEditorContent =
    inlinePreviewDraftStagingId === activePreviewStagingId
      ? inlinePreviewDraftContent
      : activePreviewPersistedContent;
  const inlinePreviewAutosaveContextKey = buildInlinePreviewAutosaveContextKey(
    commitReviewMode,
    activePreviewStagingId,
    inlinePreviewDraftStagingId,
  );
  inlinePreviewDraftContentRef.current = inlinePreviewDraftContent;
  activePreviewStagingIdRef.current = activePreviewStagingId;
  inlinePreviewAutosaveContextKeyRef.current = inlinePreviewAutosaveContextKey;

  const persistInlinePreviewSave = useCallback(
    (
      nextSave: InlinePreviewSaveSnapshot,
      options?: {
        trackStartState?: boolean;
      },
    ) => {
      if (options?.trackStartState !== false) {
        setInlinePreviewInFlightSave(nextSave);
      }
      void updateStagedFileContent({
        stagingId: nextSave.stagingId,
        content: nextSave.content,
        expectedVersion: nextSave.baseVersion,
      })
        .then((updatedStaging) => {
          if (!inlinePreviewMountedRef.current) {
            return;
          }
          setInlinePreviewInFlightSave((current) =>
            matchesInlinePreviewSaveSnapshot(current, nextSave)
              ? null
              : current,
          );
          if (activePreviewStagingIdRef.current !== nextSave.stagingId) {
            return;
          }
          setInlinePreviewDraftBaseVersion(updatedStaging.version);
          setInlinePreviewFailedSave(null);
          setInlinePreviewSaveError(null);
          if (inlinePreviewDraftContentRef.current === nextSave.content) {
            setInlinePreviewHasPendingLocalEdit(false);
          }
        })
        .catch((error: unknown) => {
          if (!inlinePreviewMountedRef.current) {
            return;
          }
          setInlinePreviewInFlightSave((current) =>
            matchesInlinePreviewSaveSnapshot(current, nextSave)
              ? null
              : current,
          );
          if (activePreviewStagingIdRef.current !== nextSave.stagingId) {
            return;
          }
          const message = isStaleBaseVersionError(error)
            ? "Inline review is out of date. Reopen the file to continue editing."
            : error instanceof Error && error.message.length > 0
              ? error.message
              : "Failed to save inline review edits.";
          setInlinePreviewFailedSave(nextSave);
          setInlinePreviewSaveError(message);
        });
    },
    [updateStagedFileContent],
  );

  const flushPendingInlinePreviewSave = useCallback(() => {
    if (
      !activePreviewStagingId ||
      inlinePreviewDraftStagingId !== activePreviewStagingId ||
      !inlinePreviewEditable ||
      !inlinePreviewHasPendingLocalEdit
    ) {
      return;
    }

    if (
      activePreviewPersistedVersion >= inlinePreviewDraftBaseVersion &&
      inlinePreviewDraftContent === activePreviewPersistedContent
    ) {
      return;
    }

    if (inlinePreviewInFlightSave?.stagingId === activePreviewStagingId) {
      return;
    }

    const nextSave: InlinePreviewSaveSnapshot = {
      stagingId: activePreviewStagingId,
      content: inlinePreviewDraftContent,
      baseVersion: inlinePreviewDraftBaseVersion,
    };

    if (matchesInlinePreviewSaveSnapshot(inlinePreviewFailedSave, nextSave)) {
      return;
    }

    persistInlinePreviewSave(nextSave, { trackStartState: false });
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    inlinePreviewDraftBaseVersion,
    inlinePreviewDraftContent,
    inlinePreviewDraftStagingId,
    inlinePreviewEditable,
    inlinePreviewFailedSave,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewInFlightSave,
    persistInlinePreviewSave,
  ]);

  useLayoutEffect(() => {
    flushPendingInlinePreviewSaveRef.current = flushPendingInlinePreviewSave;
  }, [flushPendingInlinePreviewSave]);

  useEffect(() => {
    return () => {
      flushPendingInlinePreviewSaveRef.current?.();
      inlinePreviewMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (inlinePreviewDraftStagingId !== activePreviewStagingId) {
      setInlinePreviewDraftStagingId(activePreviewStagingId);
      setInlinePreviewDraftContent(activePreviewPersistedContent);
      setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
      setInlinePreviewHasPendingLocalEdit(false);
      setInlinePreviewInFlightSave(null);
      setInlinePreviewFailedSave(null);
      setInlinePreviewSaveError(null);
      return;
    }

    if (activePreviewPersistedVersion < inlinePreviewDraftBaseVersion) {
      return;
    }

    if (inlinePreviewHasPendingLocalEdit) {
      return;
    }

    setInlinePreviewDraftContent(activePreviewPersistedContent);
    setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
    setInlinePreviewFailedSave(null);
    setInlinePreviewSaveError(null);
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    inlinePreviewDraftBaseVersion,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewDraftStagingId,
  ]);

  useEffect(() => {
    setShowInlinePreviewPatch(false);
  }, [selectedFile]);

  useEffect(() => {
    if (
      commitReviewMode !== "review" ||
      !inlinePreviewEditable ||
      !activePreviewStagingId ||
      inlinePreviewDraftStagingId !== activePreviewStagingId ||
      !inlinePreviewHasPendingLocalEdit
    ) {
      return;
    }

    if (
      activePreviewPersistedVersion >= inlinePreviewDraftBaseVersion &&
      inlinePreviewDraftContent === activePreviewPersistedContent
    ) {
      setInlinePreviewDraftBaseVersion(activePreviewPersistedVersion);
      setInlinePreviewHasPendingLocalEdit(false);
      setInlinePreviewFailedSave(null);
      setInlinePreviewSaveError(null);
      return;
    }

    if (inlinePreviewInFlightSave?.stagingId === activePreviewStagingId) {
      return;
    }

    const nextSave: InlinePreviewSaveSnapshot = {
      stagingId: activePreviewStagingId,
      content: inlinePreviewDraftContent,
      baseVersion: inlinePreviewDraftBaseVersion,
    };

    if (matchesInlinePreviewSaveSnapshot(inlinePreviewFailedSave, nextSave)) {
      return;
    }

    let didStartSave = false;
    const timeoutId = window.setTimeout(() => {
      didStartSave = true;
      persistInlinePreviewSave(nextSave);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      if (
        didStartSave ||
        inlinePreviewAutosaveContextKeyRef.current ===
          inlinePreviewAutosaveContextKey
      ) {
        return;
      }
      persistInlinePreviewSave(nextSave, { trackStartState: false });
    };
  }, [
    activePreviewPersistedContent,
    activePreviewPersistedVersion,
    activePreviewStagingId,
    commitReviewMode,
    inlinePreviewDraftContent,
    inlinePreviewDraftBaseVersion,
    inlinePreviewEditable,
    inlinePreviewFailedSave,
    inlinePreviewHasPendingLocalEdit,
    inlinePreviewInFlightSave,
    inlinePreviewDraftStagingId,
    inlinePreviewAutosaveContextKey,
    persistInlinePreviewSave,
  ]);

  const finalTreeData = useMemo(() => {
    const stagedFilesByInitialPath = new Map(
      (stagedFiles ?? []).map((file) => [file.initialFilePath, file]),
    );
    const treeItems = vault.treeData.tree
      .map((item: GithubTreeType) => {
        if (!isFileTreeNodeType(item.type)) {
          return null;
        }
        const stagedFile = stagedFilesByInitialPath.get(item.path);
        const path = stagedFile ? stagedFile.filePath : item.path;
        const status = stagedFile ? getStagedFileStatus(stagedFile) : null;

        return {
          deleted: status === "deleted",
          path,
          originalPath: item.path,
          type: item.type,
          size: item.size,
          status: status ?? undefined,
        };
      })
      .filter(nonNullable);

    // Add new files from staging (parentCommitSha is null)
    const newFiles = (stagedFiles || [])
      .filter(
        (staged: StagedFileRecord) =>
          getStagedFileStatus(staged) === "added" && !staged.fileDeleted,
      )
      .map((staged: StagedFileRecord) => ({
        deleted: false,
        path: staged.filePath,
        originalPath: staged.initialFilePath,
        type: "blob" as const,
        size: undefined,
        status: "added" as const,
      }));
    const existingPaths = new Set(
      [...treeItems, ...newFiles].map((item) => item.path),
    );
    const deletedFiles = (stagedFiles || [])
      .filter(
        (staged: StagedFileRecord) =>
          getStagedFileStatus(staged) === "deleted" &&
          !existingPaths.has(staged.filePath),
      )
      .map((staged: StagedFileRecord) => ({
        deleted: true,
        path: staged.filePath,
        originalPath: staged.initialFilePath,
        type: "blob" as const,
        size: undefined,
        status: "deleted" as const,
      }));

    return [...treeItems, ...newFiles, ...deletedFiles];
  }, [vault.treeData.tree, stagedFiles]);
  const comparedTreeData = useMemo(() => {
    return (branchComparePreview?.files ?? []).map((file) => ({
      deleted: file.status === "deleted",
      path: file.path,
      originalPath: file.path,
      type: "blob" as const,
      size: undefined,
      status: file.status,
    }));
  }, [branchComparePreview]);
  const effectiveSidebarMode: EffectiveSidebarMode = isCompareRequested
    ? "compare"
    : sidebarMode;

  const { agentGraphNodes, agentGraphEdges } = useMemo(() => {
    const nodes: AgentGraphNode[] = [];
    const edges: AgentGraphEdge[] = [];
    const hasAgents = finalTreeData.some(
      (item) => item.type === "blob" && item.path === "AGENTS.md",
    );
    const hasTools = finalTreeData.some(
      (item) => item.type === "blob" && item.path === "tools.json",
    );

    if (hasAgents) {
      nodes.push({
        id: "agents",
        type: "agentNode",
        position: { x: 0, y: 0 },
        data: { label: "AGENTS.md", path: "AGENTS.md", kind: "agent" },
      });
    }

    if (hasTools) {
      nodes.push({
        id: "tools",
        type: "agentNode",
        position: { x: 280, y: 0 },
        data: { label: "tools.json", path: "tools.json", kind: "tool" },
      });
    }

    if (hasAgents && hasTools) {
      edges.push({
        id: "agents-tools",
        source: "agents",
        target: "tools",
      });
    }

    return { agentGraphNodes: nodes, agentGraphEdges: edges };
  }, [finalTreeData]);

  const forceSidebarSelectionVisible =
    reviewOnMountRequested || commitReviewMode === "review";
  const alwaysVisibleSimpleViewPaths = useMemo(() => {
    return finalTreeData
      .filter((item) => {
        if (item.type !== "blob" || !item.status) {
          return false;
        }

        return (
          item.status === "deleted" ||
          (forceSidebarSelectionVisible && item.path === selectedFile)
        );
      })
      .map((item) => item.path);
  }, [finalTreeData, forceSidebarSelectionVisible, selectedFile]);
  const visibleTreeData = useMemo(() => {
    if (effectiveSidebarMode === "compare") {
      return comparedTreeData;
    }

    if (effectiveSidebarMode !== "simple") {
      return finalTreeData;
    }

    if (
      !simpleViewConfig.hasValidConfig ||
      simpleViewConfig.excludePatterns.length === 0
    ) {
      return finalTreeData;
    }

    // Review keeps the sidebar stable, so staged files hidden by simple-view
    // rules still need a navigation entry while review is active. Deleted files
    // stay visible even outside review because they do not exist in the
    // repository tree anymore.
    return filterSimpleViewTreeItems(
      finalTreeData,
      simpleViewConfig.excludePatterns,
      {
        alwaysIncludePaths: alwaysVisibleSimpleViewPaths,
      },
    );
  }, [
    alwaysVisibleSimpleViewPaths,
    comparedTreeData,
    effectiveSidebarMode,
    finalTreeData,
    simpleViewConfig,
  ]);
  const autoExpandedSidebarPaths = useMemo(() => {
    if (effectiveSidebarMode === "compare") {
      return Array.from(
        new Set(
          comparedTreeData.flatMap((item) => getAncestorFolderPaths(item.path)),
        ),
      );
    }

    if (!forceSidebarSelectionVisible) {
      return [];
    }

    // Keep the active review target visible in the stable sidebar even when a
    // parent folder was previously collapsed.
    return getAncestorFolderPaths(selectedFile);
  }, [
    comparedTreeData,
    effectiveSidebarMode,
    forceSidebarSelectionVisible,
    selectedFile,
  ]);

  const emptyRepository = visibleTreeData.length === 0;
  const didResolveStagedFiles = stagedFiles !== undefined;

  // Check if there are any changes to commit
  const hasChangesToCommit =
    stagedFiles &&
    stagedFiles.length > 0 &&
    stagedFiles.some(
      (file: NonNullable<typeof stagedFiles>[number]) =>
        file.content !== file.initialContent ||
        file.filePath !== file.initialFilePath ||
        file.fileDeleted ||
        file.parentCommitSha === null,
    );
  const canCreateDraftPullRequest = isDefaultBranch
    ? hasChangesToCommit === true
    : !hasCurrentBranchPullRequest &&
      didResolveRemoteBranches &&
      (hasChangesToCommit === true || (currentRemoteBranch?.aheadBy ?? 0) > 0);
  const draftButtonLabel = isDefaultBranch ? "draft" : "create draft";
  const isCreatingDraftPullRequest =
    draftPullRequestStatus === "loading" ||
    defaultBranchDraftPullRequestStatus === "loading";
  const isResettingToGitHub = clearingStagingStatus === "loading";
  const resetToGitHubDisabled =
    isResettingToGitHub ||
    manualComittingStatus === "loading" ||
    isCreatingDraftPullRequest ||
    !hasChangesToCommit;
  const commitPreviewRefreshKey = useMemo(
    () => buildStagingPreviewRefreshKey(stagedFiles),
    [stagedFiles],
  );
  const branchCompareTargetRefreshKey = useMemo(
    () =>
      [
        branch,
        commitSha ?? "no-commit",
        currentBranchPullRequestNumber ?? "no-pr",
        vault.lastTreeRefreshAt ?? "no-refresh",
      ].join(":"),
    [
      branch,
      commitSha,
      currentBranchPullRequestNumber,
      vault.lastTreeRefreshAt,
    ],
  );
  const branchComparePreviewStagingRefreshKey = useMemo(
    () => buildStagingPreviewRefreshKey(stagedFiles),
    [stagedFiles],
  );
  const compareModeSummary = useMemo(() => {
    if (!isCompareRequested) {
      return null;
    }
    if (branchComparePreviewError) {
      return {
        text: "Compare unavailable",
        ariaLabel: "Changed Files compare is unavailable",
      };
    }
    if (!branchComparePreview) {
      return {
        text: "Loading compare...",
        ariaLabel: "Loading changed files compare target",
      };
    }

    const baseSummary = `vs ${branchComparePreview.baseBranch}`;
    const sourceSummary =
      branchComparePreview.source === "pull_request" &&
      typeof branchComparePreview.pullRequestNumber === "number"
        ? `PR #${branchComparePreview.pullRequestNumber} ${baseSummary}`
        : `${baseSummary} (no open PR)`;
    const truncationSummary = branchComparePreview.safety
      .includesTruncatedPatches
      ? " · truncated patches"
      : "";
    const sourceListSummary = branchComparePreview.sourceFileListTruncated
      ? " · file list may be truncated"
      : "";

    return {
      text: `${sourceSummary}${truncationSummary}${sourceListSummary}`,
      ariaLabel: `Changed Files comparing ${sourceSummary}${truncationSummary}${sourceListSummary}`,
    };
  }, [branchComparePreview, branchComparePreviewError, isCompareRequested]);

  useEffect(() => {
    const nextRouteKey = `${branch}:${selectedFile}`;
    if (reviewRouteKeyRef.current === nextRouteKey) {
      return;
    }
    reviewRouteKeyRef.current = nextRouteKey;
    setAllowAutoExitReview((current) =>
      commitReviewMode === "review" ? current : true,
    );
  }, [branch, selectedFile, commitReviewMode]);

  useEffect(() => {
    if (
      !didResolveStagedFiles ||
      !allowAutoExitReview ||
      hasChangesToCommit ||
      commitReviewMode !== "review" ||
      isCompareRequested
    ) {
      return;
    }
    setReviewModeInQuery("editor", { replace: true });
  }, [
    allowAutoExitReview,
    didResolveStagedFiles,
    hasChangesToCommit,
    commitReviewMode,
    isCompareRequested,
    setReviewModeInQuery,
  ]);

  useEffect(() => {
    if (
      !reviewOnMountRequested ||
      commitReviewMode === "review" ||
      !didResolveStagedFiles
    ) {
      return;
    }
    resetCommitPreviewState();
    if (!hasChangesToCommit) {
      setReviewModeInQuery("editor", { replace: true });
      return;
    }
    // Dashboard staged-file links enter through ?review so we wait for branch
    // staging to resolve before switching the canonical URL to ?diff.
    setReviewModeInQuery("review", { replace: true });
  }, [
    reviewOnMountRequested,
    commitReviewMode,
    didResolveStagedFiles,
    hasChangesToCommit,
    resetCommitPreviewState,
    setReviewModeInQuery,
  ]);

  useEffect(() => {
    if (commitReviewMode !== "review" || !hasChangesToCommit) return;
    void loadCommitPreview();
  }, [
    commitReviewMode,
    hasChangesToCommit,
    commitPreviewRefreshKey,
    loadCommitPreview,
  ]);

  useEffect(() => {
    return () => {
      clearBranchComparePreviewReloadTimeout();
    };
  }, [clearBranchComparePreviewReloadTimeout]);

  useEffect(() => {
    if (!isCompareRequested) {
      clearBranchComparePreviewReloadTimeout();
      branchComparePreviewRequestKeyRef.current = null;
      branchComparePreviewRequestedTargetKeyRef.current = null;
      branchComparePreviewRequestedStagingKeyRef.current = null;
      setBranchComparePreview(null);
      setBranchComparePreviewError(null);
      return;
    }

    const reloadMode = getBranchComparePreviewReloadMode({
      previousTargetKey: branchComparePreviewRequestedTargetKeyRef.current,
      previousStagingKey: branchComparePreviewRequestedStagingKeyRef.current,
      nextTargetKey: branchCompareTargetRefreshKey,
      nextStagingKey: branchComparePreviewStagingRefreshKey,
    });
    if (reloadMode === "none") {
      return;
    }

    const nextRequestKey = `${branchCompareTargetRefreshKey}:${branchComparePreviewStagingRefreshKey}`;
    const startBranchCompareReload = (resetPreview: boolean) => {
      clearBranchComparePreviewReloadTimeout();
      branchComparePreviewRequestKeyRef.current = nextRequestKey;
      branchComparePreviewRequestedTargetKeyRef.current =
        branchCompareTargetRefreshKey;
      branchComparePreviewRequestedStagingKeyRef.current =
        branchComparePreviewStagingRefreshKey;
      if (resetPreview) {
        setBranchComparePreview(null);
      }
      setBranchComparePreviewError(null);
      void loadBranchComparePreview(nextRequestKey);
    };

    if (reloadMode === "immediate") {
      startBranchCompareReload(true);
      return;
    }

    branchComparePreviewReloadTimeoutRef.current = window.setTimeout(() => {
      startBranchCompareReload(false);
    }, BRANCH_COMPARE_PREVIEW_STAGING_DEBOUNCE_MS);

    return () => {
      clearBranchComparePreviewReloadTimeout();
    };
  }, [
    branchComparePreviewStagingRefreshKey,
    branchCompareTargetRefreshKey,
    clearBranchComparePreviewReloadTimeout,
    isCompareRequested,
    loadBranchComparePreview,
  ]);

  useEffect(() => {
    if (!isCompareRequested || !branchComparePreview) {
      return;
    }

    if (branchComparePreview.files.some((file) => file.path === selectedFile)) {
      return;
    }

    const firstComparedFile = branchComparePreview.files.at(0);
    if (!firstComparedFile) {
      return;
    }

    void navigate(
      buildVaultFileUrl(firstComparedFile.path, {
        reviewMode:
          firstComparedFile.status === "deleted" ? "review" : undefined,
      }),
      {
        replace: true,
        state,
      },
    );
  }, [
    branchComparePreview,
    buildVaultFileUrl,
    isCompareRequested,
    navigate,
    selectedFile,
    state,
  ]);

  // MARK: Return

  const userDisplayName = user?.name ?? user?.email ?? user?.githubUsername;
  const sidebarHeader = userDisplayName ? (
    <SidebarAccountSection>
      <Link to="/" className={`flex items-center justify-between ${linkStyle}`}>
        <UserMenu className="w-full min-w-0 justify-between">
          <span className="block min-w-0 truncate">{userDisplayName}</span>
        </UserMenu>
      </Link>
    </SidebarAccountSection>
  ) : null;

  const sidebarContent = (
    <>
      <div className="border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <a
            className={`truncate text-xs font-medium text-muted-foreground ${linkStyle}`}
            href={`https://github.com/${owner}/${repoName}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {owner}/{repoName}
          </a>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            onClick={() => openFileCreation("")}
            title="Create new file"
            aria-label="Create new file"
          >
            <PlusIcon className="h-4 w-4 md:h-3 md:w-3" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            onClick={() => openFolderCreation("")}
            title="Create new folder"
            aria-label="Create new folder"
          >
            <FilePlusIcon className="h-4 w-4 md:h-3 md:w-3" />
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={effectiveSidebarMode}
            className="justify-start"
            onValueChange={(value) => {
              if (value === "simple" || value === "all") {
                setSidebarMode(value);
                if (isCompareRequested) {
                  setCompareModeInQuery(false);
                }
              }
              if (value === "compare") {
                setCompareModeInQuery(true);
              }
            }}
          >
            <ToggleGroupItem
              value="simple"
              aria-label="Simple View"
              className="h-7 px-2 text-xs"
            >
              Simple View
            </ToggleGroupItem>
            <ToggleGroupItem
              value="all"
              aria-label="All Files"
              className="h-7 px-2 text-xs"
            >
              All Files
            </ToggleGroupItem>
            <ToggleGroupItem
              value="compare"
              aria-label="Changed Files"
              className="h-7 px-2 text-xs"
            >
              Changed Files
            </ToggleGroupItem>
          </ToggleGroup>
          {isCompareRequested && compareModeSummary ? (
            <div
              aria-label={compareModeSummary.ariaLabel}
              aria-live="polite"
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            >
              {compareModeSummary.text}
            </div>
          ) : null}
        </div>
      </div>
      {emptyRepository ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 overflow-auto">
          <FileTree
            items={visibleTreeData}
            onFileSelect={handleFileSelect}
            onFileRename={(originalPath, newPath) =>
              void handleFileRename(originalPath, newPath)
            }
            onFileCreate={handleCreateFileInFolder}
            onFileDelete={(filePath, originalPath) =>
              void handleFileDelete(filePath, originalPath)
            }
            onFileRestore={(filePath, originalPath) =>
              void handleRestoreDeletedFile(filePath, originalPath)
            }
            restoringFilePath={restoringDeletedFilePath}
            selectedFile={sidebarSelectedFile}
            folderExpansionStates={folderExpansionStates ?? []}
            onFolderToggle={handleFolderToggle}
            autoExpandedPaths={autoExpandedSidebarPaths}
            forceAutoExpandedPaths={
              forceSidebarSelectionVisible || effectiveSidebarMode === "compare"
            }
          />
        </div>
      )}
    </>
  );

  const editorSurfaceTabs = (
    <Tabs
      value={viewMode}
      onValueChange={(value) => {
        if (value === "editor" || value === "graph") {
          setViewMode(value);
        }
      }}
    >
      <TabsList className="h-7">
        <TabsTrigger value="editor" className="px-2 text-xs">
          Editor
        </TabsTrigger>
        <TabsTrigger value="graph" className="px-2 text-xs">
          Graph
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const handleInlinePreviewChange = useCallback((nextContent: string) => {
    setInlinePreviewDraftContent(nextContent);
    setInlinePreviewHasPendingLocalEdit(true);
    setInlinePreviewFailedSave(null);
    setInlinePreviewSaveError(null);
  }, []);
  const renderPatchLines = useCallback((patch: string) => {
    return patch.split("\n").map((line, index) => (
      <div
        key={`${index}:${line}`}
        className={`whitespace-pre-wrap corner-notch-1 px-1 ${getPatchLineClassName(line)}`}
      >
        {line.length > 0 ? line : " "}
      </div>
    ));
  }, []);

  const headerTitle = selectedFile
    ? selectedFile.split("/").slice(0, -1).join("/") || "/"
    : undefined;

  return (
    <>
      <RepositoryWorkspaceFrame
        sidebarHeader={sidebarHeader}
        sidebarContent={sidebarContent}
        headerTitle={headerTitle}
        onQuickOpen={() => setIsCommandPaletteOpen(true)}
        contentClassName="flex-1 min-h-0 p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="max-w-none flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4"
            style={
              mobileEditorChatDockInset
                ? {
                    // Keep the fixed mobile dock from obscuring the scrollable
                    // editor surface underneath it.
                    paddingBottom: mobileEditorChatDockInset,
                    scrollPaddingBottom: mobileEditorChatDockInset,
                  }
                : undefined
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="min-w-0">
                  <div className="mb-0.5 font-mono text-[11px] text-muted-foreground">
                    {branch}
                  </div>
                  {selectedFile ? (
                    <h2 className="text-base md:text-sm font-medium">
                      <a
                        className={`block truncate ${linkStyle}`}
                        href={selectedFileGitHubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selectedFile}
                      </a>
                    </h2>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <DaytonaSnapshotBanner
                  branch={branch}
                  commitSha={vault.commitSHA}
                  snapshotName={vault.daytonaCurrentSnapshotName}
                  snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                  lastError={vault.daytonaCurrentSnapshotLastError}
                  className="w-full"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <VaultSyncStatus
                    vaultId={vault._id}
                    repositoryFullName={repositoryFullName}
                    branch={branch}
                    owner={owner}
                    repoName={repoName}
                    commitSha={commitSha}
                    treeRefreshStartedAt={vault.treeRefreshStartedAt}
                    lastTreeRefreshAt={vault.lastTreeRefreshAt}
                    stagedFiles={stagedFiles}
                    disableStagedFilesQuery
                  />

                  {viewMode === "editor" && (
                    <Button
                      size="sm"
                      variant={isPreviewOpen ? "secondary" : "outline"}
                      onClick={() => setIsPreviewOpen((current) => !current)}
                      className="h-6 px-2 text-xs"
                    >
                      {isPreviewOpen ? "Hide Preview" : "Show Preview"}
                    </Button>
                  )}

                  {viewMode === "editor" && (
                    <Button
                      size="sm"
                      variant={
                        commitReviewMode === "review" ? "secondary" : "outline"
                      }
                      onClick={handleToggleReviewMode}
                      disabled={
                        commitReviewMode === "editor" &&
                        (!hasChangesToCommit ||
                          commitPreviewStatus === "loading")
                      }
                      className="h-6 px-2 text-xs"
                    >
                      {commitReviewMode === "review"
                        ? "Back to Editor"
                        : commitPreviewStatus === "loading"
                          ? "Loading..."
                          : "Review Changes"}
                    </Button>
                  )}

                  <FileViewPushActions
                    canCreateDraftPullRequest={canCreateDraftPullRequest}
                    currentPullRequestNumber={currentBranchPullRequestNumber}
                    currentPullRequestUrl={currentBranchPullRequestUrl}
                    draftButtonLabel={draftButtonLabel}
                    hasChangesToCommit={Boolean(hasChangesToCommit)}
                    isCreatingDraftPullRequest={isCreatingDraftPullRequest}
                    isPushing={manualComittingStatus === "loading"}
                    onCreateDraftPullRequest={handleDraftPullRequest}
                    onManualCommit={handleManualCommit}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetToGitHub}
                    disabled={resetToGitHubDisabled}
                    className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                  >
                    {isResettingToGitHub ? "Resetting..." : "Reset to GitHub"}
                  </Button>
                </div>

                <Collapsible
                  className="space-y-1.5"
                  open={developerToolsOpen}
                  onOpenChange={setDeveloperToolsOpen}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto self-start gap-1 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground [&[data-state=open]>svg]:rotate-180"
                    >
                      Developer tools
                      <ChevronDownIcon className="h-3.5 w-3.5 transition-transform" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent
                    forceMount
                    className="space-y-1.5 data-[state=closed]:hidden"
                  >
                    <DaytonaWorkspaceButton
                      vaultId={vault._id}
                      branch={branch}
                      sandboxId={vault.daytonaSandboxId}
                      sandboxName={vault.daytonaSandboxName}
                      commitSha={vault.commitSHA}
                      snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                      snapshotName={vault.daytonaCurrentSnapshotName}
                      snapshotError={vault.daytonaCurrentSnapshotLastError}
                      className="text-xs"
                    />
                    <DaytonaSnapshotList vaultId={vault._id} />
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
            {commitError ? (
              <div className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                Commit failed: {commitError}
              </div>
            ) : null}
            {draftPullRequestError ? (
              <DraftPullRequestFeedbackBanner message={draftPullRequestError} />
            ) : null}
            {branchComparePreviewError ? (
              <div className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                {branchComparePreviewError}
              </div>
            ) : null}

            {viewMode === "editor" && isPreviewOpen && (
              <DaytonaPreviewPanel
                vaultId={vault._id}
                className="mb-4"
                onResetToGitHub={handleResetToGitHub}
                isResettingToGitHub={isResettingToGitHub}
                resetToGitHubDisabled={resetToGitHubDisabled}
              />
            )}

            <div className="mb-2 flex flex-wrap items-center gap-2">
              {editorSurfaceTabs}
            </div>

            <div className="relative flex-1 min-h-0">
              {viewMode === "editor" ? (
                commitReviewMode === "review" ? (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden">
                    {commitPreviewError ? (
                      <div className="mx-3 mt-3 corner-notch-1 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {commitPreviewError}
                      </div>
                    ) : null}
                    {rebaseConflictPreviewError ? (
                      <div className="mx-3 mt-3 corner-notch-1 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {rebaseConflictPreviewError}
                      </div>
                    ) : null}

                    {commitPreview ||
                    rebaseConflictPreview ||
                    branchComparePreview ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 flex-col">
                          {selectedFile ? (
                            <div className="flex min-h-0 flex-1 flex-col">
                              <div className="flex-1 overflow-auto">
                                {selectedRebaseConflictFile ? (
                                  <div className="min-h-full">
                                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-3">
                                      <div className="text-sm font-medium text-amber-950">
                                        Commit blocked by upstream changes in{" "}
                                        {selectedRebaseConflictFile.path}
                                      </div>
                                      <div className="mt-1 text-xs text-amber-900/80">
                                        {rebaseConflictPreview &&
                                        rebaseConflictPreview.files.length > 1
                                          ? `${rebaseConflictPreview.files.length} files need review. Rebase staging onto the latest GitHub state to materialize conflict markers or auto-merge clean files.`
                                          : "Review the conflict patches below, then rebase staging onto the latest GitHub state before editing a manual resolution."}
                                      </div>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Button
                                          size="sm"
                                          onClick={handleRebaseOntoLatestGitHub}
                                          disabled={
                                            pullFromGitHubStatus === "loading"
                                          }
                                          className="h-7 px-2 text-xs"
                                        >
                                          {pullFromGitHubStatus === "loading"
                                            ? "Rebasing..."
                                            : "Rebase onto latest GitHub"}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={
                                            handleCopyRebaseConflictBundle
                                          }
                                          disabled={
                                            rebaseConflictPreviewStatus ===
                                              "loading" ||
                                            rebaseConflictBundleStatus ===
                                              "loading" ||
                                            !rebaseConflictPreview ||
                                            rebaseConflictPreview.files
                                              .length === 0
                                          }
                                          className="h-7 px-2 text-xs"
                                        >
                                          {rebaseConflictBundleStatus ===
                                          "loading"
                                            ? "Copying..."
                                            : "Copy conflict bundle"}
                                        </Button>
                                      </div>
                                      <div className="mt-2 text-[11px] text-amber-950/70">
                                        {selectedRebaseConflictFile.baseBlobSha ? (
                                          <>
                                            Base blob:{" "}
                                            {
                                              selectedRebaseConflictFile.baseBlobSha
                                            }
                                            {"  "}
                                          </>
                                        ) : null}
                                        Upstream blob:{" "}
                                        {
                                          selectedRebaseConflictFile.upstreamBlobSha
                                        }
                                      </div>
                                      {rebaseConflictBundleFeedback ? (
                                        <div className="mt-2 text-xs text-amber-950">
                                          {rebaseConflictBundleFeedback}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="grid min-h-0 md:grid-cols-2 md:divide-x">
                                      <div className="min-h-0">
                                        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                                          Base -&gt; Yours
                                        </div>
                                        {selectedRebaseConflictFile.baseToStagedPatchTruncated ? (
                                          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            Patch output is truncated for this
                                            file.
                                          </div>
                                        ) : null}
                                        <div className="p-3 font-mono text-xs leading-5">
                                          {selectedRebaseConflictFile.baseToStagedPatch
                                            ? renderPatchLines(
                                                selectedRebaseConflictFile.baseToStagedPatch,
                                              )
                                            : null}
                                        </div>
                                      </div>
                                      <div className="min-h-0 border-t md:border-t-0">
                                        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                                          Base -&gt; Upstream
                                        </div>
                                        {selectedRebaseConflictFile.baseToUpstreamPatchTruncated ? (
                                          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            Patch output is truncated for this
                                            file.
                                          </div>
                                        ) : null}
                                        <div className="p-3 font-mono text-xs leading-5">
                                          {selectedRebaseConflictFile.baseToUpstreamPatch
                                            ? renderPatchLines(
                                                selectedRebaseConflictFile.baseToUpstreamPatch,
                                              )
                                            : null}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : rebaseConflictPreview ? (
                                  <div className="p-3 text-sm text-muted-foreground">
                                    Loading conflicting file...
                                  </div>
                                ) : selectedPreviewCanRenderInline ? (
                                  <div className="min-h-full">
                                    <div className="border-b px-3 py-2">
                                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            id="inline-option-show-patch"
                                            checked={showInlinePreviewPatch}
                                            disabled={
                                              !selectedPreviewFile?.patch
                                            }
                                            onCheckedChange={(checked) => {
                                              setShowInlinePreviewPatch(
                                                checked === true,
                                              );
                                            }}
                                          />
                                          <Label
                                            htmlFor="inline-option-show-patch"
                                            className="text-xs font-medium text-muted-foreground"
                                          >
                                            Show patch
                                          </Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            id="inline-option-allow-inline-diffs"
                                            checked={
                                              inlinePreviewOptions.allowInlineDiffs
                                            }
                                            onCheckedChange={(checked) => {
                                              setInlinePreviewOptions(
                                                (current) => ({
                                                  ...current,
                                                  allowInlineDiffs:
                                                    checked === true,
                                                }),
                                              );
                                            }}
                                          />
                                          <Label
                                            htmlFor="inline-option-allow-inline-diffs"
                                            className="text-xs font-medium text-muted-foreground"
                                          >
                                            Inline diffs
                                          </Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Checkbox
                                            id="inline-option-syntax-deletions"
                                            checked={
                                              inlinePreviewOptions.syntaxHighlightDeletions
                                            }
                                            onCheckedChange={(checked) => {
                                              setInlinePreviewOptions(
                                                (current) => ({
                                                  ...current,
                                                  syntaxHighlightDeletions:
                                                    checked === true,
                                                }),
                                              );
                                            }}
                                          />
                                          <Label
                                            htmlFor="inline-option-syntax-deletions"
                                            className="text-xs font-medium text-muted-foreground"
                                          >
                                            Syntax deleted
                                          </Label>
                                        </div>
                                      </div>
                                    </div>
                                    {inlinePreviewSaveError ? (
                                      <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                        {inlinePreviewSaveError}
                                      </div>
                                    ) : null}
                                    {showInlinePreviewPatch &&
                                    selectedPreviewFile?.patch ? (
                                      <div>
                                        {selectedPreviewFile.patchTruncated ? (
                                          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            Patch output is truncated for this
                                            file.
                                          </div>
                                        ) : null}
                                        <div className="p-3 font-mono text-xs leading-5">
                                          {renderPatchLines(
                                            selectedPreviewFile.patch,
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <ProsemarkMergeEditor
                                        key={`${selectedFile}:${activePreviewStagingId ?? "inline"}`}
                                        value={inlinePreviewEditorContent}
                                        baseValue={selectedPreviewBaseContent}
                                        options={inlinePreviewOptions}
                                        editable={inlinePreviewEditable}
                                        onChange={handleInlinePreviewChange}
                                        className="text-sm leading-6"
                                      />
                                    )}
                                  </div>
                                ) : selectedPreviewFile?.patch ? (
                                  <div>
                                    {selectedPreviewFile.patchTruncated ? (
                                      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                        Patch output is truncated for this file.
                                      </div>
                                    ) : null}
                                    <div className="p-3 font-mono text-xs leading-5">
                                      {renderPatchLines(
                                        selectedPreviewFile.patch,
                                      )}
                                    </div>
                                  </div>
                                ) : selectedFileIsRenderableMedia ? (
                                  <RepositoryMediaViewer
                                    repositoryFullName={repositoryFullName}
                                    filePath={selectedFile}
                                    branch={branch}
                                  />
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : selectedFileIsRenderableMedia ? (
                  <RepositoryMediaViewer
                    repositoryFullName={repositoryFullName}
                    filePath={selectedFile}
                    branch={branch}
                  />
                ) : stagedFile ? (
                  <CodeEditorWrapper
                    key={`${branch}/${selectedFile}-${stagedFile.parentCommitSha ?? "new"}`}
                    repositoryFullName={repositoryFullName}
                    branch={branch}
                    filePath={selectedFile}
                    vaultId={vault._id}
                    stagedFile={stagedFile}
                    tree={vault.treeData.tree}
                    treeSHA={vault.treeSHA}
                    showMobileLineNumbers={showMobileEditorLineNumbers}
                  />
                ) : isCompareRequested &&
                  selectedComparedFileCanRenderInline ? (
                  <div className="min-h-full">
                    <ProsemarkMergeEditor
                      key={`${selectedFile}:compare`}
                      value={selectedComparedFile?.richNewContent ?? ""}
                      baseValue={selectedComparedFile?.richOldContent ?? ""}
                      options={inlinePreviewOptions}
                      editable={false}
                      className="text-sm leading-6"
                    />
                  </div>
                ) : isCompareRequested && selectedComparedFile?.patch ? (
                  <div>
                    {selectedComparedFile.patchTruncated ? (
                      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Patch output is truncated for this file.
                      </div>
                    ) : null}
                    <div className="p-3 font-mono text-xs leading-5">
                      {renderPatchLines(selectedComparedFile.patch)}
                    </div>
                  </div>
                ) : null
              ) : (
                <AgentGraphView
                  nodes={agentGraphNodes}
                  edges={agentGraphEdges}
                  onOpenFile={handleOpenFileFromGraph}
                  vaultId={vault._id}
                  repositoryFullName={repositoryFullName}
                  branch={branch}
                  filePath={selectedFile || undefined}
                />
              )}
            </div>
          </div>
          <EditorChatDock
            vaultId={vault._id}
            repositoryFullName={repositoryFullName}
            branch={branch}
            filePath={selectedFile || undefined}
            desktopMode="inline"
            onMobileDockInsetChange={setMobileEditorChatDockInset}
          />
        </div>
      </RepositoryWorkspaceFrame>

      {/* File Creation Dialog */}
      {fileCreationDialog.isOpen && (
        <FileCreationDialog
          isOpen={true}
          onClose={closeFileCreation}
          initialFolderPath={fileCreationDialog.folderPath || ""}
          onFileCreate={handleCreateFileInFolder}
          folders={vault.treeData.tree
            .map((item: GithubTreeType) => {
              if (!isFileTreeNodeType(item.type)) {
                return null;
              }

              return {
                path: item.path,
                type: item.type,
                size: item.size,
              };
            })
            .filter(nonNullable)}
        />
      )}

      {/* Folder Creation Dialog */}
      {folderCreationDialog.isOpen && (
        <FolderCreationDialog
          isOpen={true}
          onClose={closeFolderCreation}
          initialFolderPath={folderCreationDialog.folderPath || ""}
          onFolderCreate={handleCreateFolderInFolder}
          folders={finalTreeData}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        files={visibleTreeData}
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
      />
    </>
  );
}

// Main export with sidebar provider wrapper
export function FileView() {
  return (
    <DialogProvider>
      <SidebarProvider className="h-full min-h-0">
        <FileViewWithSwipe />
      </SidebarProvider>
    </DialogProvider>
  );
}

// Component with sidebar context and mobile edge swipe gesture
function FileViewWithSwipe() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useSwipeToOpenSidebar(() => {
    if (isMobile && !openMobile) {
      setOpenMobile(true);
    }
  });

  return <FileViewWrapper />;
}
