import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction, useMutation, useQuery as useLiveQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { CodeEditorWrapper } from "@/components/CodeEditor";
import { Button } from "@/components/ui/button";
import { FileViewPushActions } from "@/repository/editor/FileViewPushActions";
import {
  FileViewInlinePreviewControls,
  FileViewPatchPreview,
  FileViewPatchText,
  FileViewSplitPreview,
} from "@/repository/editor/FileViewPreviewParts";
import { ChangedFilesLoadingState } from "@/repository/editor/ChangedFilesLoadingState";
import {
  FileViewDeveloperTools,
  type FileViewEditorOverride,
} from "@/repository/editor/FileViewDeveloperTools";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { CommandPalette } from "@/repository/editor/CommandPalette";
import { FileViewSidebarContent, FileViewSidebarFooter } from "@/repository/editor/FileViewSidebar";
import { FileViewMainHeader } from "@/repository/editor/FileViewMainHeader";
import { useFileViewInlinePreview } from "@/repository/editor/useFileViewInlinePreview";
import { useFileViewMediaUpload } from "@/repository/editor/useFileViewMediaUpload";
import {
  useBranchComparePreviewQuery,
  useCommitPreviewQuery,
} from "@/repository/editor/useFileViewPreviewQueries";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { linkStyle } from "@/components/styles";
import { useConvexAction, useConvexMutation } from "@/lib/convexUtils";
import { DialogProvider } from "@/contexts/DialogContext";
import { useDialog } from "@/hooks/useDialog";
import { FileCreationDialog } from "@/repository/editor/FileCreationDialog";
import { FolderCreationDialog } from "@/repository/editor/FolderCreationDialog";
import { ProsemarkMergeEditor } from "@/components/ProsemarkMergeEditor";
import { notEmpty } from "@samebase/dependent";
import { hasStagedFileChanges } from "@samebase/git-editor/stagingChanges";
import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  hasSimpleViewConfigFile,
  hasStagedSimpleViewConfigFile,
  isStagedSimpleViewConfigDeleted,
  parseSimpleViewConfig,
  SIMPLE_VIEW_CONFIG_PATH,
} from "@/repository/editor/simpleView";
import { type CommitReviewFileStatus as CommitPreviewFileStatus } from "@/repository/editor/commitReviewStatus";
import { claimRefreshDebounce } from "@/lib/refreshDebounce";
import { getAncestorFolderPaths } from "@/repository/editor/fileTreeState";
import { type GitHubTree } from "@samebase/git-editor/model";
import { formatStopwatchDuration } from "@/lib/stopwatch";
import { DraftPullRequestFeedbackBanner } from "@/repository/editor/DraftPullRequestFeedbackBanner";
import { RepositorySyncStatus } from "@/repository/editor/RepositorySyncStatus";
import { RepositoryMediaViewer } from "@/repository/editor/RepositoryMediaViewer";
import { useRepositorySimpleViewConfig } from "@/repository/editor/useRepositorySimpleViewConfig";
import { RepositoryWorkspacePaneHeader } from "@/repository/editor/RepositoryWorkspacePaneHeader";
import { MediaUploadDialog } from "@/repository/editor/MediaUploadDialog";
import { isRenderableRepositoryMediaPath } from "@samebase/git-editor/repositoryMedia";
import { TREE_REFRESH_STALE_LOCK_MS } from "@samebase/git-editor/treeRefresh";
import { buildRepositoryFileRoute, parseRepositoryPathContext } from "@/lib/repositoryRoutes";
import { resolveLegacyBranchlessFilePath } from "@/lib/legacyBranchlessRoute";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  buildStagingPreviewRefreshKey,
  getPreviewBaseFilePath,
} from "@/repository/editor/fileViewCompare";
import {
  shouldClearCompareOnReviewExit,
  shouldShowCompareBackToEditor,
} from "@/repository/editor/fileViewReview";
import {
  buildFileViewSearchHref,
  buildFileViewRouteSearch,
  mergeFileViewRouteSearch,
  type FileViewRouteSearchPatch,
  useFileViewRouteSearch,
} from "@/routeSearch/fileView";
import { encodeGitHubPath } from "@/lib/githubUrls";
import {
  type CommitReviewMode,
  type EffectiveSidebarMode,
  findBestInitialFile,
  getStagedFileStatus,
  isFileTreeNodeType,
  isStorageBackedFileError,
  parseUpstreamConflictPaths,
  type RebaseConflictPreview,
  type SidebarMode,
  type StagedFileRecord,
} from "./fileViewShared";

type FileViewAutoRefreshIntent = Extract<
  (typeof api.github.refreshRepositoryTree)["_args"]["intent"],
  "passive"
>;

type FileViewBranchHydrationState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | {
      kind: "deferred";
      reason: "cooldown" | "in_progress";
    }
  | { kind: "unavailable" }
  | { kind: "failed" };

type FileViewBranchHydrationFeedback = {
  key: string;
  state: FileViewBranchHydrationState;
};

export function FileViewRepositoryUnavailableState() {
  return (
    <AppWorkspaceRouteChrome>
      <main className="grid gap-4 p-4">
        <h1 className="text-base font-semibold">Repository unavailable</h1>
        <Button asChild className="w-fit" variant="outline">
          <Link to={DASHBOARD_ROUTE}>All repositories</Link>
        </Button>
      </main>
    </AppWorkspaceRouteChrome>
  );
}

function FileViewWrapper() {
  const router = useRouter();
  const location = useLocation();
  const routeSearch = useFileViewRouteSearch();
  const { pathname } = location;
  const isCompareRequested = routeSearch.compare ?? false;
  const {
    owner,
    repoName,
    branch: branchParam,
    filePath: filePathParam,
    isInvalidRepositoryRoute,
  } = useMemo(() => parseRepositoryPathContext(pathname), [pathname]);

  const firstDocAction = useAction(api.fileStagingActions.getFileForEditing);
  const refreshTree = useAction(api.github.refreshRepositoryTree);
  const routeBranch = branchParam;
  const selectedFile = filePathParam ?? "";
  const githubRepositoryFullName =
    owner && repoName && !isInvalidRepositoryRoute ? `${owner}/${repoName}` : null;

  // Get the Samebase repository record for these GitHub coordinates.
  // TODO: Keep repository existence checks on live query until useCacheQuery exposes
  // freshness metadata (cached null can trigger a false redirect to dashboard).
  const repository = useLiveQuery(
    api.repository.records.getRepositoryByRepository,
    githubRepositoryFullName
      ? {
          githubRepositoryFullName,
          branch: routeBranch,
        }
      : "skip",
  );
  const branch = routeBranch ?? repository?.resolvedBranch;
  const storageBackedSelectionKey = `${branch ?? "unknown"}:${selectedFile}`;
  const repositoryId = repository?.repositoryId;
  const stagedFiles = useQuery(
    api.fileStaging.listStagedFiles,
    repositoryId && branch ? { repositoryId, branch } : "skip",
  );
  // Tree paths deleted in staging must not be reopened as the best initial file.
  const stagedDeletedPaths = useMemo(
    () =>
      new Set(
        (stagedFiles ?? []).filter((file) => file.fileDeleted).map((file) => file.initialFilePath),
      ),
    [stagedFiles],
  );
  const selectedTreeEntry = useMemo(
    () =>
      repository?.treeData?.tree.find((item: { path: string }) => item.path === selectedFile) ??
      null,
    [repository, selectedFile],
  );
  const selectedFileExistsInTree = selectedTreeEntry?.type === "blob";
  const legacyBranchlessFilePath = useMemo(() => {
    if (!repository) {
      return null;
    }

    return resolveLegacyBranchlessFilePath({
      branchSegment: routeBranch,
      selectedFile,
      selectedFileExistsInTree,
      tree: repository.treeData?.tree ?? [],
    });
  }, [repository, routeBranch, selectedFile, selectedFileExistsInTree]);
  const selectedFileIsRenderableMedia = isRenderableRepositoryMediaPath(selectedFile);
  const [storageBackedSelection, setStorageBackedSelection] = useState<
    Partial<Record<string, true>>
  >({});
  const [branchHydrationFeedback, setBranchHydrationFeedback] =
    useState<FileViewBranchHydrationFeedback | null>(null);
  const branchHydrationInFlightKeyRef = useRef<string | null>(null);
  const confirmedMissingBranchKeyRef = useRef<string | null>(null);
  const [branchHydrationRetryNonce, setBranchHydrationRetryNonce] = useState(0);
  const appendCurrentSearch = useCallback(
    (path: string) =>
      buildPathWithTanStackSearch({
        pathname: path,
        search: location.search,
      }),
    [location.search],
  );
  const navigateByHref = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      // Preserve current user history state while the `/repo/$` route still
      // depends on the intentionally encoded raw file path boundary.
      void router.navigate({
        href,
        replace: options?.replace,
        state: true,
      });
    },
    [router],
  );

  /**
   * Clear `storageBackedSelection` whenever we switch to a different repository or
   * branch. This map only exists to remember "we already tried to stage this
   * file and got a storage-backed-file error" for the current branch.
   */
  useEffect(() => {
    if (repositoryId) {
      setStorageBackedSelection({});
    }
  }, [repositoryId, branch]);

  /**
   * Old routes could omit the branch segment. Once we know the real branch,
   * rewrite `/repo/:owner/:repository` into `/repo/:owner/:repository/fs/:branch`.
   */
  useEffect(() => {
    if (!owner || !repoName || !branch || branchParam) {
      return;
    }
    const nextPath = buildRepositoryFileRoute({
      owner,
      repoName,
      branch,
      filePath: selectedFile.length > 0 ? selectedFile : undefined,
    });
    navigateByHref(appendCurrentSearch(nextPath), { replace: true });
  }, [appendCurrentSearch, owner, repoName, branch, branchParam, selectedFile, navigateByHref]);

  /**
   * If we recovered a file path from an old branchless URL, rewrite the URL to
   * the canonical `/repo/:owner/:repository/fs/:branch/:file` form.
   */
  useEffect(() => {
    if (!owner || !repoName || !branch || !branchParam || !legacyBranchlessFilePath) {
      return;
    }
    const nextPath = buildRepositoryFileRoute({
      owner,
      repoName,
      branch,
      filePath: legacyBranchlessFilePath,
    });
    navigateByHref(appendCurrentSearch(nextPath), { replace: true });
  }, [
    appendCurrentSearch,
    owner,
    repoName,
    branch,
    branchParam,
    legacyBranchlessFilePath,
    navigateByHref,
  ]);

  const refreshTreeIfNeeded = useCallback(
    (intent: FileViewAutoRefreshIntent = "passive") => {
      if (!repositoryId || !owner || !repoName || !branch) {
        return;
      }
      const key = `${owner}/${repoName}:branch:${branch}`;
      const hasTree = repository.branchTreeState === "ready";
      const hasConfirmedMissingBranch = confirmedMissingBranchKeyRef.current === key;
      const now = Date.now();
      if (
        !hasTree &&
        typeof repository.treeRefreshStartedAt === "number" &&
        repository.treeRefreshStartedAt + TREE_REFRESH_STALE_LOCK_MS > now &&
        branchHydrationInFlightKeyRef.current !== key
      ) {
        setBranchHydrationFeedback({ key, state: { kind: "deferred", reason: "in_progress" } });
        return;
      }
      if (
        typeof repository.treeRefreshCooldownUntil === "number" &&
        repository.treeRefreshCooldownUntil > now
      ) {
        if (!hasTree) {
          setBranchHydrationFeedback((previous) =>
            previous?.key === key &&
            (previous.state.kind === "failed" || previous.state.kind === "unavailable")
              ? previous
              : { key, state: { kind: "deferred", reason: "cooldown" } },
          );
        }
        return;
      }
      if ((hasTree || hasConfirmedMissingBranch) && !claimRefreshDebounce("file_view", key)) {
        return;
      }
      if (!hasTree && branchHydrationInFlightKeyRef.current === key) {
        return;
      }

      branchHydrationInFlightKeyRef.current = key;
      if (!hasTree) {
        setBranchHydrationFeedback({ key, state: { kind: "loading" } });
      }
      void refreshTree({ repositoryId, branch, intent })
        .then((result) => {
          switch (result.kind) {
            case "ready":
              if (confirmedMissingBranchKeyRef.current === key) {
                confirmedMissingBranchKeyRef.current = null;
              }
              setBranchHydrationFeedback((previous) => (previous?.key === key ? null : previous));
              break;
            case "not_found":
              confirmedMissingBranchKeyRef.current = key;
              claimRefreshDebounce("file_view", key);
              setBranchHydrationFeedback({ key, state: { kind: "not_found" } });
              break;
            case "deferred":
              setBranchHydrationFeedback({
                key,
                state: { kind: "deferred", reason: result.reason },
              });
              break;
            case "unavailable":
              setBranchHydrationFeedback({ key, state: { kind: "unavailable" } });
              break;
            case "failed":
              setBranchHydrationFeedback({ key, state: { kind: "failed" } });
              break;
            default:
              result satisfies never;
          }
        })
        .catch((error: unknown) => {
          setBranchHydrationFeedback({ key, state: { kind: "failed" } });
          console.error("Failed to refresh repository tree:", error);
        })
        .finally(() => {
          if (branchHydrationInFlightKeyRef.current === key) {
            branchHydrationInFlightKeyRef.current = null;
          }
        });
    },
    [
      repositoryId,
      owner,
      repoName,
      branch,
      refreshTree,
      repository?.branchTreeState,
      repository?.treeRefreshCooldownUntil,
      repository?.treeRefreshStartedAt,
    ],
  );

  /** Retry an unhydrated branch once the active refresh lock and cooldown have elapsed. */
  useEffect(() => {
    if (!repository || repository.branchTreeState === "ready") {
      return;
    }
    const lockUntil =
      typeof repository.treeRefreshStartedAt === "number"
        ? repository.treeRefreshStartedAt + TREE_REFRESH_STALE_LOCK_MS
        : 0;
    const cooldownUntil = repository.treeRefreshCooldownUntil ?? 0;
    const waitMs = Math.max(lockUntil, cooldownUntil) - Date.now();
    if (waitMs <= 0) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setBranchHydrationRetryNonce((nonce) => nonce + 1);
    }, waitMs + 50);
    return () => window.clearTimeout(timeoutId);
  }, [repository]);

  /**
   * Refresh the active branch when the file route becomes active. Route load,
   * visibility resume, and window focus are the same passive demand.
   */
  useEffect(() => {
    if (!repositoryId || !owner || !repoName) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshTreeIfNeeded();
      }
    };

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        refreshTreeIfNeeded();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    // Initial sync when the repository loads while this tab is already active.
    if (document.visibilityState === "visible") {
      refreshTreeIfNeeded();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [repositoryId, owner, repoName, refreshTreeIfNeeded, branchHydrationRetryNonce]);

  /**
   * When the tree is loaded and the route does not name a file, pick the best
   * initial file and navigate to it automatically.
   */
  useEffect(() => {
    if (
      isCompareRequested ||
      selectedFile ||
      !branch ||
      !owner ||
      !repoName ||
      stagedFiles === undefined ||
      (repository?.treeData?.tree ?? []).length === 0
    ) {
      return;
    }

    const bestFile = findBestInitialFile(repository?.treeData?.tree ?? [], stagedDeletedPaths);
    if (bestFile) {
      navigateByHref(
        appendCurrentSearch(
          buildRepositoryFileRoute({
            owner,
            repoName,
            branch,
            filePath: bestFile,
          }),
        ),
        {
          replace: true,
        },
      );
    }
  }, [
    appendCurrentSearch,
    selectedFile,
    repository,
    owner,
    repoName,
    branch,
    isCompareRequested,
    navigateByHref,
    stagedFiles,
    stagedDeletedPaths,
  ]);

  const stagedFile = useQuery(
    api.fileStaging.getByNewPath,
    repository && branch && selectedFile
      ? {
          branch,
          newPath: selectedFile,
          repositoryId: repository.repositoryId,
        }
      : "skip",
  );

  /**
   * If the selected file is missing from both staging and the repository tree,
   * the current URL is stale. Redirect to the best remaining file, or to the
   * branch root when no file can be opened.
   */
  useEffect(() => {
    if (isCompareRequested) return;
    if (!selectedFile || !repository?.treeData || !owner || !repoName || !branch) {
      return;
    }
    // Wait until staging query resolves before deciding that the file is missing.
    if (stagedFile === undefined) return;
    if (stagedFile || selectedFileExistsInTree) return;

    const bestFile = findBestInitialFile(repository.treeData.tree, stagedDeletedPaths);
    if (bestFile) {
      navigateByHref(
        appendCurrentSearch(
          buildRepositoryFileRoute({
            owner,
            repoName,
            branch,
            filePath: bestFile,
          }),
        ),
        {
          replace: true,
        },
      );
      return;
    }

    navigateByHref(
      appendCurrentSearch(
        buildRepositoryFileRoute({
          owner,
          repoName,
          branch,
        }),
      ),
      {
        replace: true,
      },
    );
  }, [
    appendCurrentSearch,
    selectedFile,
    repository,
    owner,
    repoName,
    stagedFile,
    selectedFileExistsInTree,
    branch,
    isCompareRequested,
    navigateByHref,
    stagedDeletedPaths,
  ]);

  /**
   * If the selected file exists in the repo but has no staged editing document
   * yet, create one with `firstDocAction`. If that fails with a
   * storage-backed-file error, remember the file key in `storageBackedSelection`
   * so we do not retry on every render.
   */
  useEffect(() => {
    if (
      !isCompareRequested &&
      selectedFile &&
      branch &&
      repository &&
      stagedFile === null &&
      selectedFileExistsInTree &&
      !selectedFileIsRenderableMedia &&
      !storageBackedSelection[storageBackedSelectionKey]
    ) {
      void firstDocAction({
        githubRepositoryFullName: `${owner}/${repoName}`,
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
    repository,
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

  if (isInvalidRepositoryRoute) {
    return <FileViewInvalidRouteState />;
  }
  if (repository === null) {
    return <FileViewRepositoryUnavailableState />;
  }
  if (repository === undefined || !owner || !repoName || !branch) {
    return null;
  }
  if (!hasFileViewRepositoryTree(repository)) {
    const hydrationKey = `${owner}/${repoName}:branch:${branch}`;
    return (
      <FileViewRepositorySetupState
        githubRepositoryFullName={`${owner}/${repoName}`}
        branch={branch}
        state={
          branchHydrationFeedback?.key === hydrationKey
            ? branchHydrationFeedback.state
            : { kind: "loading" }
        }
      />
    );
  }
  const hydrationKey = `${owner}/${repoName}:branch:${branch}`;

  return (
    <FileViewInner
      repository={repository}
      selectedFile={selectedFile}
      branch={branch}
      owner={owner}
      repoName={repoName}
      stagedFile={stagedFile ?? null}
      branchHydrationState={
        branchHydrationFeedback?.key === hydrationKey ? branchHydrationFeedback.state : null
      }
    />
  );
}

function FileViewInvalidRouteState() {
  return (
    <AppWorkspaceRouteChrome>
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Invalid repository route.</p>
      </div>
    </AppWorkspaceRouteChrome>
  );
}

function getFileViewRepositorySetupMessage(state: FileViewBranchHydrationState): string {
  switch (state.kind) {
    case "loading":
      return "Loading this branch from GitHub.";
    case "not_found":
      return "Branch not found on GitHub.";
    case "deferred":
      switch (state.reason) {
        case "cooldown":
          return "GitHub refresh is paused. This branch will load after the cooldown.";
        case "in_progress":
          return "Waiting for another branch refresh to finish.";
        default:
          state.reason satisfies never;
          return "Branch loading is deferred.";
      }
    case "unavailable":
      return "GitHub access is unavailable.";
    case "failed":
      return "This branch could not be loaded from GitHub.";
    default:
      state satisfies never;
      return "This branch could not be loaded.";
  }
}

function FileViewRepositorySetupState({
  githubRepositoryFullName,
  branch,
  state,
}: {
  githubRepositoryFullName: string;
  branch: string;
  state: FileViewBranchHydrationState;
}) {
  return (
    <AppWorkspaceRouteChrome
      headerAccessory={
        <RepositoryWorkspacePaneHeader
          title={githubRepositoryFullName}
          right={
            <a
              href={`https://github.com/${githubRepositoryFullName}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <h1 className="text-xl font-semibold">{githubRepositoryFullName}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{branch}</p>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground">
            {getFileViewRepositorySetupMessage(state)}
          </p>
        </div>
      </div>
    </AppWorkspaceRouteChrome>
  );
}

type FileViewRepository = NonNullable<
  (typeof api.repository.records.getRepositoryByRepository)["_returnType"]
> & {
  treeData: NonNullable<
    NonNullable<
      (typeof api.repository.records.getRepositoryByRepository)["_returnType"]
    >["treeData"]
  >;
  treeSHA: string;
};

function hasFileViewRepositoryTree(
  repository: NonNullable<(typeof api.repository.records.getRepositoryByRepository)["_returnType"]>,
  // eslint-disable-next-line samebase/no-hand-written-type-predicate -- property-presence intersection: the checks narrow property references, not the repository object
): repository is FileViewRepository {
  return Boolean(repository.treeSHA && repository.treeData);
}

function FileViewInner({
  repository,
  selectedFile,
  branch,
  owner,
  repoName,
  stagedFile,
  branchHydrationState,
}: {
  repository: FileViewRepository;
  branch: string;
  selectedFile: string;
  owner: string;
  repoName: string;
  stagedFile: (typeof api.fileStaging.getByNewPath)["_returnType"];
  branchHydrationState: FileViewBranchHydrationState | null;
}) {
  const router = useRouter();
  const location = useLocation();
  const routeSearch = useFileViewRouteSearch();
  const buildCurrentFileViewHref = useCallback(
    (fileViewSearch: FileViewRouteSearchPatch) =>
      buildFileViewSearchHref({
        pathname: location.pathname,
        search: location.search,
        fileViewSearch: {
          ...fileViewSearch,
          mobileLineNumbers: routeSearch.mobileLineNumbers,
        },
        hash: location.hash,
      }),
    [location.hash, location.pathname, location.search, routeSearch.mobileLineNumbers],
  );
  const navigateByHref = useCallback(
    (href: string, options?: { replace?: boolean; resetScroll?: boolean }) => {
      // Preserve current user history state while the `/repo/$` route still
      // depends on the intentionally encoded raw file path boundary.
      void router.navigate({
        href,
        replace: options?.replace,
        resetScroll: options?.resetScroll,
        state: true,
      });
    },
    [router],
  );
  const isCompareRequested = routeSearch.compare ?? false;

  const refreshRepositoryTree = useAction(api.github.refreshRepositoryTree);
  const getOpenPullRequestForBranch = useAction(
    api.repositoryPullRequests.getOpenPullRequestForBranch,
  );
  // Dialog state management
  const {
    fileCreationDialog,
    folderCreationDialog,
    openFileCreation,
    closeFileCreation,
    openFolderCreation,
    closeFolderCreation,
  } = useDialog();

  const githubRepositoryFullName = `${owner}/${repoName}`;
  const isDefaultBranch = branch === repository.defaultBranch;
  const branchPullRequestQuery = useTanStackQuery({
    queryKey: ["repository-branch-pull-request", repository.repositoryId, branch],
    queryFn: () => getOpenPullRequestForBranch({ repositoryId: repository.repositoryId, branch }),
    enabled: !isDefaultBranch,
    staleTime: 60_000,
    retry: false,
  });
  const selectedFileIsRenderableMedia = isRenderableRepositoryMediaPath(selectedFile);
  const commitSha = repository.commitSHA;
  const selectedFileGitHubUrl = selectedFile
    ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/blob/${encodeGitHubPath(branch)}/${encodeGitHubPath(selectedFile)}`
    : `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/tree/${encodeGitHubPath(branch)}`;

  // Folder expansion state
  const folderExpansionStates = useQuery(api.folderExpansion.getFolderExpansionStates, {
    repositoryId: repository.repositoryId,
  });
  const setFolderExpansionState = useMutation(
    api.folderExpansion.setFolderExpansionState,
  ).withOptimisticUpdate((localStore, args) => {
    const currentValue = localStore.getQuery(api.folderExpansion.getFolderExpansionStates, {
      repositoryId: repository.repositoryId,
    });

    if (currentValue) {
      const newState = [...currentValue];

      const folderIndex = newState.findIndex((folder) => folder.folderPath === args.folderPath);

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
          repositoryId: repository.repositoryId,
        },
        newState,
      );
    }
  });
  const setFolderExpansionStateRef = useRef(setFolderExpansionState);
  setFolderExpansionStateRef.current = setFolderExpansionState;

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [draftPullRequestError, setDraftPullRequestError] = useState<string | null>(null);
  const [branchCompareLoadingStartedAt, setBranchCompareLoadingStartedAt] = useState<number | null>(
    null,
  );
  const [branchCompareLoadingElapsedMs, setBranchCompareLoadingElapsedMs] = useState(0);
  const [rebaseConflictPreview, setRebaseConflictPreview] = useState<RebaseConflictPreview | null>(
    null,
  );
  const [rebaseConflictPreviewError, setRebaseConflictPreviewError] = useState<string | null>(null);
  const [rebaseConflictBundleFeedback, setRebaseConflictBundleFeedback] = useState<string | null>(
    null,
  );
  const [restoringDeletedFilePath, setRestoringDeletedFilePath] = useState<string | null>(null);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [editorOverride, setEditorOverride] = useState<FileViewEditorOverride>("default");
  const restoringDeletedFilePathRef = useRef<string | null>(null);
  const clearInlinePreviewSaveErrorRef = useRef<() => void>(() => {});

  // Convex hooks for staging
  const [commitStaging, manualComittingStatus] = useConvexAction(
    api.fileStagingActions.commitStaging,
  );
  const [createDraftPullRequest, draftPullRequestStatus] = useConvexAction(
    api.fileStagingActions.createDraftPullRequest,
  );
  const [createDraftPullRequestFromDefaultBranch, defaultBranchDraftPullRequestStatus] =
    useConvexAction(api.fileStagingActions.createDraftPullRequestFromDefaultBranch);
  const [getRebaseConflictPreview, rebaseConflictPreviewStatus] = useConvexAction(
    api.fileStagingActions.getRebaseConflictPreview,
  );
  const [getRebaseConflictBundle, rebaseConflictBundleStatus] = useConvexAction(
    api.fileStagingActions.getRebaseConflictBundle,
  );
  const [pullFromGitHub, pullFromGitHubStatus] = useConvexAction(
    api.fileStagingActions.pullFromGitHub,
  );
  const [clearAllStaging, clearingStagingStatus] = useConvexMutation(
    api.fileStaging.clearAllStaging,
  );
  const [updateStagedFileContent] = useConvexMutation(api.fileStaging.updateStagedFileContent);
  const [generateUploadUrl] = useConvexMutation(api.fileStaging.generateUploadUrl);
  const [deletePendingUploadBlob] = useConvexMutation(api.fileStaging.deletePendingUploadBlob);

  const [markFileForDeletion] = useConvexMutation(api.fileStaging.markFileForDeletion);
  const [revertDeletedFileInStaging] = useConvexMutation(
    api.fileStaging.revertDeletedFileInStaging,
  );
  const [restoreComparedDeletedFileToStaging] = useConvexAction(
    api.fileStagingActions.restoreComparedDeletedFileToStaging,
  );
  const [renameFileInStaging] = useConvexAction(api.fileStagingActions.renameFileInStaging);
  const stageFileForEditing = useAction(api.fileStagingActions.getFileForEditing);
  const [stageUploadedMedia] = useConvexAction(api.fileStagingActions.stageUploadedMedia);
  const isDiffRequested = routeSearch.diff ?? false;

  // Get count of staged files for this repository
  const stagedFiles = useQuery(
    api.fileStaging.listStagedFiles,
    {
      repositoryId: repository.repositoryId,
      branch,
    },
    {
      dontCache: isDiffRequested,
    },
  );
  const stagedSimpleViewConfigFile = useQuery(
    api.fileStaging.getByNewPath,
    {
      branch,
      repositoryId: repository.repositoryId,
      newPath: SIMPLE_VIEW_CONFIG_PATH,
    },
    {
      dontCache: true,
    },
  );
  const repositorySimpleViewConfig = useRepositorySimpleViewConfig({
    branch,
    githubRepositoryFullName,
    stagedConfigFile: stagedSimpleViewConfigFile,
    treeSHA: repository.treeSHA,
    repositoryId: repository.repositoryId,
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("all");
  const [sidebarModeHydrated, setSidebarModeHydrated] = useState(false);

  const createFileInStaging = useMutation(api.fileStaging.createFileInStaging);
  const hasStagedChangesToCommit = useMemo(
    () => stagedFiles?.some(hasStagedFileChanges) ?? false,
    [stagedFiles],
  );
  const showMobileEditorLineNumbers = useMemo(() => {
    return routeSearch.mobileLineNumbers === "1";
  }, [routeSearch.mobileLineNumbers]);
  const commitReviewMode = useMemo<CommitReviewMode>(() => {
    return isDiffRequested ? "review" : "editor";
  }, [isDiffRequested]);
  const [allowAutoExitReview, setAllowAutoExitReview] = useState(true);
  const reviewRouteKeyRef = useRef<string | null>(null);
  const branchCompareLoadingTargetKeyRef = useRef<string | null>(null);
  const branchPullRequest = branchPullRequestQuery.data;
  const currentPullRequestNumber = branchPullRequest?.pullRequest?.number;
  const currentPullRequestUrl = branchPullRequest?.pullRequest?.url;
  const didResolveBranchPullRequest = isDefaultBranch || branchPullRequestQuery.isSuccess;
  const currentBranchPullRequestNumber = isDefaultBranch ? undefined : currentPullRequestNumber;
  const currentBranchPullRequestUrl = isDefaultBranch ? undefined : currentPullRequestUrl;
  const hasCurrentBranchPullRequest = currentBranchPullRequestUrl != null;

  /** Listen for Cmd/Ctrl + P and open the file view command palette. */
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

  const hasSimpleViewConfig = hasSimpleViewConfigFile(
    stagedSimpleViewConfigFile,
    repositorySimpleViewConfig.content,
  );
  const hasDeletedStagedSimpleViewConfigFile = isStagedSimpleViewConfigDeleted(
    stagedSimpleViewConfigFile,
  );
  const didResolveSimpleViewConfigSource =
    stagedSimpleViewConfigFile !== undefined &&
    (hasStagedSimpleViewConfigFile(stagedSimpleViewConfigFile) ||
      hasDeletedStagedSimpleViewConfigFile ||
      repositorySimpleViewConfig.resolved);

  const sidebarModeStorageKey = useMemo(
    () => getSimpleViewPreferenceStorageKey(repository.repositoryId),
    [repository.repositoryId],
  );

  /** Reset browser-owned sidebar hydration when the query source changes. */
  useEffect(() => {
    setSidebarModeHydrated(false);
  }, [repository.repositoryId, branch]);

  /**
   * Once we know whether a simple-view config exists, load the saved sidebar
   * mode from localStorage. If there is no saved value, default to `simple`
   * when config exists and `all` when it does not.
   */
  useEffect(() => {
    if (!didResolveSimpleViewConfigSource) {
      return;
    }
    const defaultMode: SidebarMode = hasSimpleViewConfig ? "simple" : "all";

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
  }, [didResolveSimpleViewConfigSource, hasSimpleViewConfig, sidebarModeStorageKey]);

  /** Save the current sidebar mode (`simple` or `all`) after the initial load completes. */
  useEffect(() => {
    if (!didResolveSimpleViewConfigSource || !sidebarModeHydrated) {
      return;
    }
    try {
      localStorage.setItem(sidebarModeStorageKey, sidebarMode);
    } catch (error) {
      console.warn("Failed to persist sidebar view preference", error);
    }
  }, [didResolveSimpleViewConfigSource, sidebarMode, sidebarModeHydrated, sidebarModeStorageKey]);

  const stagedSimpleViewConfigContent = hasStagedSimpleViewConfigFile(stagedSimpleViewConfigFile)
    ? stagedSimpleViewConfigFile.content
    : null;
  const simpleViewConfigContent = hasDeletedStagedSimpleViewConfigFile
    ? null
    : (stagedSimpleViewConfigContent ?? repositorySimpleViewConfig.content);

  const simpleViewConfig = useMemo(
    () => parseSimpleViewConfig(simpleViewConfigContent),
    [simpleViewConfigContent],
  );
  const buildRepositoryFileUrl = useCallback(
    (
      path: string,
      options?: {
        branch?: string;
        reviewMode?: CommitReviewMode;
        compare?: boolean;
      },
    ) => {
      const targetBranch = options?.branch ?? branch;
      const preserveCurrentReviewMode = options?.reviewMode === undefined;
      const preserveCurrentCompareMode = options?.compare === undefined;
      const includeDiff =
        options?.reviewMode === "review" || (preserveCurrentReviewMode && routeSearch.diff);
      const includeCompare =
        options?.compare === true || (preserveCurrentCompareMode && routeSearch.compare);
      const pathname = buildRepositoryFileRoute({
        owner,
        repoName,
        branch: targetBranch,
        filePath: path.length > 0 ? path : undefined,
      });
      const nextFileViewSearch = {
        ...buildFileViewRouteSearch({
          diff: includeDiff,
          compare: includeCompare,
        }),
        mobileLineNumbers: routeSearch.mobileLineNumbers,
      };
      return buildPathWithTanStackSearch({
        pathname,
        search: mergeFileViewRouteSearch(location.search, nextFileViewSearch),
      });
    },
    [
      branch,
      location.search,
      owner,
      repoName,
      routeSearch.mobileLineNumbers,
      routeSearch.compare,
      routeSearch.diff,
    ],
  );
  const {
    handleCloseMediaUploadDialog,
    handleMediaUploadDrop,
    handleMediaUploadInputChange,
    handleMediaUploadSubmit,
    handleRequestMediaUpload,
    isMediaUploadDragOver,
    isUploadingMedia,
    mediaUploadError,
    mediaUploadInputRef,
    pendingMediaUpload,
    setIsMediaUploadDragOver,
  } = useFileViewMediaUpload({
    branch,
    buildRepositoryFileUrl,
    deletePendingUploadBlob,
    generateUploadUrl,
    navigateByHref,
    githubRepositoryFullName,
    selectedFile,
    stageUploadedMedia,
    repositoryId: repository.repositoryId,
  });

  const setReviewModeInQuery = useCallback(
    (
      mode: CommitReviewMode,
      options?: {
        replace?: boolean;
        compare?: boolean;
      },
    ) => {
      navigateByHref(
        buildCurrentFileViewHref(
          buildFileViewRouteSearch({
            diff: mode === "review",
            compare: options?.compare ?? routeSearch.compare,
          }),
        ),
        { replace: options?.replace, resetScroll: false },
      );
    },
    [buildCurrentFileViewHref, navigateByHref, routeSearch.compare],
  );
  const setCompareModeInQuery = useCallback(
    (
      enabled: boolean,
      options?: {
        replace?: boolean;
      },
    ) => {
      navigateByHref(
        buildCurrentFileViewHref(
          buildFileViewRouteSearch({
            compare: enabled,
            diff: routeSearch.diff,
          }),
        ),
        { replace: options?.replace, resetScroll: false },
      );
    },
    [buildCurrentFileViewHref, navigateByHref, routeSearch.diff],
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
        githubRepositoryFullName,
        branch,
      })
        .then((preview) => {
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
            navigateByHref(
              buildRepositoryFileUrl(preview.files[0].path, {
                reviewMode: "review",
              }),
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
      buildRepositoryFileUrl,
      getRebaseConflictPreview,
      navigateByHref,
      githubRepositoryFullName,
      selectedFile,
    ],
  );
  const handleUpstreamConflictDetected = useCallback(
    (message: string) => {
      setAllowAutoExitReview(false);
      setCommitError(message);
      if (commitReviewMode !== "review") {
        setReviewModeInQuery("review");
      }
      void loadRebaseConflictPreview(message);
    },
    [commitReviewMode, loadRebaseConflictPreview, setReviewModeInQuery],
  );
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
        repository.lastTreeRefreshAt ?? "no-refresh",
      ].join(":"),
    [branch, commitSha, currentBranchPullRequestNumber, repository.lastTreeRefreshAt],
  );
  const branchComparePreviewStagingRefreshKey = useMemo(
    () => buildStagingPreviewRefreshKey(stagedFiles),
    [stagedFiles],
  );
  const {
    error: commitPreviewError,
    isFetching: isCommitPreviewFetching,
    preview: commitPreview,
    refetch: refetchCommitPreview,
  } = useCommitPreviewQuery({
    branch,
    enabled: commitReviewMode === "review" && hasStagedChangesToCommit,
    onSuccess: resetRebaseConflictState,
    onUpstreamConflict: handleUpstreamConflictDetected,
    refreshKey: commitPreviewRefreshKey,
    githubRepositoryFullName,
    repositoryId: repository.repositoryId,
  });
  const {
    error: branchComparePreviewError,
    isLoading: isBranchCompareLoading,
    preview: branchComparePreview,
  } = useBranchComparePreviewQuery({
    branch,
    enabled: isCompareRequested,
    githubRepositoryFullName,
    stagingRefreshKey: branchComparePreviewStagingRefreshKey,
    targetRefreshKey: branchCompareTargetRefreshKey,
    repositoryId: repository.repositoryId,
  });

  /** Track elapsed time only for a fresh compare target request. */
  useEffect(() => {
    if (!isBranchCompareLoading) {
      branchCompareLoadingTargetKeyRef.current = null;
      setBranchCompareLoadingStartedAt(null);
      return;
    }

    if (branchCompareLoadingTargetKeyRef.current === branchCompareTargetRefreshKey) {
      return;
    }

    branchCompareLoadingTargetKeyRef.current = branchCompareTargetRefreshKey;
    setBranchCompareLoadingStartedAt(Date.now());
  }, [branchCompareTargetRefreshKey, isBranchCompareLoading]);

  const handleCopyRebaseConflictBundle = useCallback(() => {
    if (!rebaseConflictPreview || rebaseConflictPreview.files.length === 0) {
      return;
    }

    try {
      void getRebaseConflictBundle({
        githubRepositoryFullName,
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
  }, [getRebaseConflictBundle, rebaseConflictPreview, githubRepositoryFullName]);

  const handleFileSelect = useCallback(
    (path: string, status?: CommitPreviewFileStatus) => {
      if (owner && repoName) {
        navigateByHref(
          buildRepositoryFileUrl(path, {
            reviewMode: status === "deleted" ? "review" : undefined,
          }),
        );
      }
    },
    [buildRepositoryFileUrl, navigateByHref, owner, repoName],
  );

  const handleFileRename = useCallback(
    async (originalPath: string, newPath: string) => {
      if (!owner || !repoName) return;

      try {
        await stageFileForEditing({
          githubRepositoryFullName: `${owner}/${repoName}`,
          originalFilePath: originalPath,
          branch,
        });

        // Rename the file in staging instead of committing immediately
        await renameFileInStaging({
          repositoryId: repository.repositoryId,
          originalPath,
          newPath,
          branch,
        });

        // Renamed staging rows keep their initial path as the mutation key, so a
        // second rename needs to follow either the current selected path or the
        // selected staged row's initial path.
        if (selectedFile === originalPath || stagedFile?.initialFilePath === originalPath) {
          navigateByHref(buildRepositoryFileUrl(newPath));
        }

        console.log(`File ${originalPath} renamed to ${newPath} in staging`);
      } catch (error) {
        console.error("Failed to rename file:", error);
      }
    },
    [
      branch,
      buildRepositoryFileUrl,
      navigateByHref,
      owner,
      renameFileInStaging,
      repoName,
      selectedFile,
      stageFileForEditing,
      stagedFile?.initialFilePath,
      repository.repositoryId,
    ],
  );

  // Handler for deleting files from the file tree
  const handleFileDelete = useCallback(
    async (filePath: string, originalPath = filePath) => {
      if (!owner || !repoName) return;

      try {
        // Get the file's SHA from the tree (null for new files)
        const fileSha =
          repository.treeData.tree.find((t: GitHubTree) => t.path === originalPath)?.sha ?? null;

        // Ensure we retain original file content in staging for review mode.
        if (fileSha) {
          try {
            await stageFileForEditing({
              githubRepositoryFullName: `${owner}/${repoName}`,
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
          repositoryId: repository.repositoryId,
          filePath,
          parentCommitSha: fileSha,
          branch,
        });

        // If the deleted file is currently selected, navigate away
        if (selectedFile === filePath) {
          if (commitReviewMode === "review") {
            return;
          }
          navigateByHref(buildRepositoryFileUrl("", { reviewMode: "editor" }));
        }

        console.log(`File ${filePath} marked for deletion`);
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    },
    [
      branch,
      buildRepositoryFileUrl,
      commitReviewMode,
      markFileForDeletion,
      navigateByHref,
      owner,
      repoName,
      selectedFile,
      stageFileForEditing,
      repository.repositoryId,
      repository.treeData.tree,
    ],
  );

  const handleRestoreDeletedFile = useCallback(
    async (filePath: string, originalPath = filePath) => {
      if (restoringDeletedFilePathRef.current !== null) {
        return;
      }

      restoringDeletedFilePathRef.current = filePath;
      setRestoringDeletedFilePath(filePath);

      try {
        const deletedStagedFile =
          stagedFiles?.find(
            (candidate) => candidate.filePath === filePath && candidate.fileDeleted,
          ) ??
          // Compare mode lists a deleted rename at its original path.
          stagedFiles?.find(
            (candidate) =>
              candidate.fileDeleted &&
              (candidate.initialFilePath === filePath ||
                candidate.initialFilePath === originalPath),
          ) ??
          null;
        const restoredFilePath = deletedStagedFile?.filePath ?? filePath;
        const comparedDeletedFile =
          branchComparePreview?.files.find(
            (file) => file.path === filePath && file.status === "deleted",
          ) ?? null;

        if (deletedStagedFile) {
          await revertDeletedFileInStaging({
            repositoryId: repository.repositoryId,
            filePath: deletedStagedFile.filePath,
            branch,
          });
        } else if (comparedDeletedFile) {
          await restoreComparedDeletedFileToStaging({
            githubRepositoryFullName,
            branch,
            filePath,
            previousPath:
              originalPath !== filePath ? originalPath : comparedDeletedFile.previousPath,
          });
        } else {
          throw new Error("Deleted file is not available to restore.");
        }

        if (selectedFile === filePath || selectedFile === restoredFilePath) {
          await router.navigate({
            href: buildRepositoryFileUrl(restoredFilePath, {
              reviewMode: "editor",
              compare: false,
            }),
            replace: true,
            state: true,
          });
        }
      } catch (error) {
        console.error("Failed to restore deleted file:", error);
      } finally {
        if (restoringDeletedFilePathRef.current === filePath) {
          restoringDeletedFilePathRef.current = null;
        }
        setRestoringDeletedFilePath((current) => (current === filePath ? null : current));
      }
    },
    [
      branch,
      branchComparePreview,
      buildRepositoryFileUrl,
      githubRepositoryFullName,
      restoreComparedDeletedFileToStaging,
      revertDeletedFileInStaging,
      router,
      selectedFile,
      stagedFiles,
      repository.repositoryId,
    ],
  );

  // Handler for creating files in specific folders from the file tree
  const handleCreateFileInFolder = useCallback(
    (folderPath: string, fileName: string) => {
      if (!owner || !repoName || !fileName.trim()) return;

      const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

      createFileInStaging({
        repositoryId: repository.repositoryId,
        filePath,
        content: "",
        branch,
      })
        .then(() => {
          navigateByHref(
            buildRepositoryFileUrl(filePath, {
              reviewMode: "editor",
              compare: false,
            }),
          );
        })
        .catch((error) => {
          console.error("Failed to create file:", error);
        });
    },
    [
      branch,
      buildRepositoryFileUrl,
      createFileInStaging,
      navigateByHref,
      owner,
      repoName,
      repository.repositoryId,
    ],
  );

  // Handler for creating folders in specific paths from the file tree
  const handleCreateFolderInFolder = (folderPath: string, folderName: string) => {
    if (!owner || !repoName || !folderName.trim()) return;

    const newFolderPath = folderPath ? `${folderPath}/${folderName}` : folderName;
    const readmeFilePath = `${newFolderPath}/README.md`;

    // Create a README file in the folder to make the folder exist in Git
    createFileInStaging({
      repositoryId: repository.repositoryId,
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
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    void commitStaging({
      githubRepositoryFullName,
      branch,
    }).catch((error) => {
      console.error("Failed to commit changes:", error);
      const message =
        error instanceof Error && error.message.length > 0 ? error.message : "Commit failed";
      if (parseUpstreamConflictPaths(message).length > 0) {
        handleUpstreamConflictDetected(message);
        return;
      }
      setCommitError(message);
    });
  }, [branch, commitStaging, handleUpstreamConflictDetected, githubRepositoryFullName]);

  const handleDraftPullRequest = useCallback(() => {
    setCommitError(null);
    setDraftPullRequestError(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    if (currentBranchPullRequestUrl) {
      window.open(currentBranchPullRequestUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!isDefaultBranch && !didResolveBranchPullRequest) {
      return;
    }

    const pendingPullRequestWindow = window.open("", "_blank");
    const handleCreatedPullRequest = async (args: { url: string; nextBranch: string }) => {
      let didHydrateNextBranch = false;
      try {
        const refreshResult = await refreshRepositoryTree({
          repositoryId: repository.repositoryId,
          branch: args.nextBranch,
          intent: "manual",
        });
        didHydrateNextBranch = refreshResult.kind === "ready";
        if (refreshResult.kind !== "ready") {
          setDraftPullRequestError(
            refreshResult.kind === "deferred" && refreshResult.reason === "cooldown"
              ? "Draft pull request created, but GitHub sync is paused. Staying on the current branch until sync resumes."
              : "Draft pull request created, but the new branch is still syncing. Staying on the current branch for now.",
          );
        }
      } catch (error) {
        console.warn("Failed to refresh tree after draft PR:", error);
        setDraftPullRequestError(
          "Draft pull request created, but the new branch is still syncing. Staying on the current branch for now.",
        );
      }
      if (didHydrateNextBranch && args.nextBranch !== branch) {
        navigateByHref(buildRepositoryFileUrl(selectedFile, { branch: args.nextBranch }));
      }
      if (pendingPullRequestWindow && !pendingPullRequestWindow.closed) {
        pendingPullRequestWindow.opener = null;
        pendingPullRequestWindow.location.replace(args.url);
        return;
      }
      const openedWindow = window.open(args.url, "_blank", "noopener,noreferrer");
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
        githubRepositoryFullName,
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
      githubRepositoryFullName,
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
    buildRepositoryFileUrl,
    createDraftPullRequest,
    createDraftPullRequestFromDefaultBranch,
    currentBranchPullRequestUrl,
    didResolveBranchPullRequest,
    handleUpstreamConflictDetected,
    isDefaultBranch,
    navigateByHref,
    refreshRepositoryTree,
    githubRepositoryFullName,
    selectedFile,
    repository.repositoryId,
  ]);

  const handleResetToGitHub = useCallback(() => {
    setCommitError(null);
    setDraftPullRequestError(null);
    resetRebaseConflictState();
    void clearAllStaging({
      repositoryId: repository.repositoryId,
      branch,
    }).catch((error) => {
      console.error("Failed to reset staged files:", error);
    });
  }, [branch, clearAllStaging, resetRebaseConflictState, repository.repositoryId]);

  const handleRebaseOntoLatestGitHub = useCallback(() => {
    setAllowAutoExitReview(false);
    setCommitError(null);
    setRebaseConflictPreviewError(null);
    setRebaseConflictBundleFeedback(null);

    void pullFromGitHub({ repositoryId: repository.repositoryId })
      .then(() => {
        resetRebaseConflictState();
        void refetchCommitPreview();
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Failed to rebase staging onto latest GitHub.";
        setRebaseConflictPreviewError(message);
      });
  }, [pullFromGitHub, refetchCommitPreview, resetRebaseConflictState, repository.repositoryId]);

  const resetCommitPreviewState = useCallback(() => {
    clearInlinePreviewSaveErrorRef.current();
    resetRebaseConflictState();
  }, [resetRebaseConflictState]);

  const handleToggleReviewMode = useCallback(() => {
    const selectedComparedPreviewFile =
      branchComparePreview?.files.find((file) => file.path === selectedFile) ?? null;
    const hasComparedEditorTarget = Boolean(
      selectedComparedPreviewFile && selectedComparedPreviewFile.status !== "deleted",
    );

    if (
      shouldShowCompareBackToEditor({
        commitReviewMode,
        isCompareRequested,
        hasComparedEditorTarget,
        hasStagedSelection: Boolean(stagedFile),
      })
    ) {
      setCompareModeInQuery(false);
      return;
    }

    if (commitReviewMode === "review") {
      setReviewModeInQuery("editor", {
        compare: shouldClearCompareOnReviewExit({
          isCompareRequested,
          hasComparedSelection: Boolean(selectedComparedPreviewFile),
          hasComparedEditorTarget,
          hasStagedSelection: Boolean(stagedFile),
        })
          ? false
          : undefined,
      });
      return;
    }

    setAllowAutoExitReview(true);
    resetCommitPreviewState();
    setReviewModeInQuery("review");
  }, [
    branchComparePreview,
    commitReviewMode,
    isCompareRequested,
    resetCommitPreviewState,
    selectedFile,
    setCompareModeInQuery,
    setReviewModeInQuery,
    stagedFile,
  ]);

  const handleFolderToggle = useCallback(
    (folderPath: string, isExpanded: boolean) => {
      void setFolderExpansionStateRef.current({
        repositoryId: repository.repositoryId,
        folderPath,
        isExpanded,
      });
    },
    [repository.repositoryId],
  );

  if (!owner || !repoName) {
    void router.navigate({ to: DASHBOARD_ROUTE });
  }

  const selectedRebaseConflictFile =
    rebaseConflictPreview?.files.find((file) => file.path === selectedFile) ?? null;
  const selectedCommitPreviewFile =
    commitPreview?.files.find((file) => file.path === selectedFile) ?? null;
  const selectedComparedFile =
    branchComparePreview?.files.find((file) => file.path === selectedFile) ?? null;
  const selectedPreviewFile = isCompareRequested
    ? (selectedComparedFile ?? selectedCommitPreviewFile)
    : selectedCommitPreviewFile;
  const selectedPreviewStagedFile = stagedFile ?? null;
  const selectedMediaContentKey = stagedFile
    ? JSON.stringify([
        stagedFile._id,
        stagedFile.version,
        stagedFile.fileDeleted,
        stagedFile.stagedBlobSha,
        stagedFile.storageId,
      ])
    : (repository.treeData.tree.find((entry) => entry.path === selectedFile)?.sha ?? null);
  const sidebarSelectedFile = selectedFile;
  // Compare-only text files do not have staging rows, so their merge view has
  // to come from the preview payload instead of repositoryStagedFiles.
  const selectedPreviewHasRichTextDiff = Boolean(
    selectedPreviewFile &&
    typeof selectedPreviewFile.richOldContent === "string" &&
    typeof selectedPreviewFile.richNewContent === "string",
  );
  const selectedPreviewCanRenderInline = Boolean(
    !selectedFileIsRenderableMedia &&
    (isCompareRequested
      ? selectedPreviewHasRichTextDiff || (!selectedComparedFile && selectedPreviewStagedFile)
      : selectedPreviewStagedFile || selectedPreviewHasRichTextDiff),
  );
  const selectedPreviewBaseContent =
    isCompareRequested && typeof selectedComparedFile?.richOldContent === "string"
      ? selectedComparedFile.richOldContent
      : (selectedPreviewStagedFile?.initialContent ?? selectedPreviewFile?.richOldContent ?? "");
  const selectedPreviewBaseFilePath = getPreviewBaseFilePath({
    comparedPreviousPath: selectedComparedFile?.previousPath,
    currentFilePath: selectedFile,
    previewPreviousPath: selectedPreviewFile?.previousPath,
    stagedCurrentFilePath: selectedPreviewStagedFile?.filePath,
    stagedInitialFilePath: selectedPreviewStagedFile?.initialFilePath,
  });
  const selectedComparedFileCanRenderInline = Boolean(
    selectedComparedFile &&
    typeof selectedComparedFile.richOldContent === "string" &&
    typeof selectedComparedFile.richNewContent === "string" &&
    !selectedFileIsRenderableMedia,
  );
  const {
    activePreviewStagingId,
    clearInlinePreviewSaveError,
    handleInlinePreviewChange,
    inlinePreviewEditorContent,
    inlinePreviewEditable,
    inlinePreviewOptions,
    inlinePreviewSaveError,
    inlinePreviewSplitDiffHighlights,
    setInlinePreviewOptions,
    setShowInlinePreviewPatch,
    setShowInlinePreviewSideBySide,
    showInlinePreviewPatch,
    showInlinePreviewSideBySide,
  } = useFileViewInlinePreview({
    repositoryId: repository.repositoryId,
    branch,
    commitReviewMode,
    selectedFile,
    selectedPreviewBaseContent,
    selectedPreviewRichNewContent: selectedPreviewFile?.richNewContent,
    selectedPreviewStagedFile,
    updateStagedFileContent,
  });
  clearInlinePreviewSaveErrorRef.current = clearInlinePreviewSaveError;

  const finalTreeData = useMemo(() => {
    const stagedFilesByInitialPath = new Map(
      (stagedFiles ?? []).map((file) => [file.initialFilePath, file]),
    );
    const treeItems = repository.treeData.tree
      .map((item: GitHubTree) => {
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
      .filter(notEmpty);

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
    const existingPaths = new Set([...treeItems, ...newFiles].map((item) => item.path));
    const deletedFiles = (stagedFiles || [])
      .filter(
        (staged: StagedFileRecord) =>
          getStagedFileStatus(staged) === "deleted" && !existingPaths.has(staged.filePath),
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
  }, [repository.treeData.tree, stagedFiles]);
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
  const effectiveSidebarMode: EffectiveSidebarMode = isCompareRequested ? "compare" : sidebarMode;

  const forceSidebarSelectionVisible = commitReviewMode === "review";
  const alwaysVisibleSimpleViewPaths = useMemo(() => {
    return finalTreeData
      .filter((item) => {
        if (item.type !== "blob" || !item.status) {
          return false;
        }

        return (
          item.status === "deleted" || (forceSidebarSelectionVisible && item.path === selectedFile)
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

    if (!simpleViewConfig.hasValidConfig || simpleViewConfig.excludePatterns.length === 0) {
      return finalTreeData;
    }

    // Review keeps the sidebar stable, so staged files hidden by simple-view
    // rules still need a navigation entry while review is active. Deleted files
    // stay visible even outside review because they do not exist in the
    // repository tree anymore.
    return filterSimpleViewTreeItems(finalTreeData, simpleViewConfig.excludePatterns, {
      alwaysIncludePaths: alwaysVisibleSimpleViewPaths,
    });
  }, [
    alwaysVisibleSimpleViewPaths,
    comparedTreeData,
    effectiveSidebarMode,
    finalTreeData,
    simpleViewConfig,
  ]);
  const existingUploadTargetPaths = useMemo(() => {
    return finalTreeData.filter((item) => item.type === "blob").map((item) => item.path);
  }, [finalTreeData]);
  const autoExpandedSidebarPaths = useMemo(() => {
    if (effectiveSidebarMode === "compare") {
      return Array.from(
        new Set(comparedTreeData.flatMap((item) => getAncestorFolderPaths(item.path))),
      );
    }

    if (!forceSidebarSelectionVisible) {
      return [];
    }

    // Keep the active review target visible in the stable sidebar even when a
    // parent folder was previously collapsed.
    return getAncestorFolderPaths(selectedFile);
  }, [comparedTreeData, effectiveSidebarMode, forceSidebarSelectionVisible, selectedFile]);

  const emptyRepository = visibleTreeData.length === 0;
  const didResolveStagedFiles = stagedFiles !== undefined;

  // Check if there are any changes to commit
  const hasChangesToCommit = hasStagedChangesToCommit;
  const canCreateDraftPullRequest = isDefaultBranch
    ? hasChangesToCommit === true
    : !hasCurrentBranchPullRequest &&
      didResolveBranchPullRequest &&
      (hasChangesToCommit === true || (branchPullRequest?.aheadBy ?? 0) > 0);
  const draftButtonLabel = isDefaultBranch ? "draft" : "create draft";
  const isCreatingDraftPullRequest =
    draftPullRequestStatus === "loading" || defaultBranchDraftPullRequestStatus === "loading";
  const isResettingToGitHub = clearingStagingStatus === "loading";
  const resetToGitHubDisabled =
    isResettingToGitHub ||
    manualComittingStatus === "loading" ||
    isCreatingDraftPullRequest ||
    !hasChangesToCommit;
  const branchCompareLoadingStopwatchLabel = useMemo(
    () => formatStopwatchDuration(branchCompareLoadingElapsedMs),
    [branchCompareLoadingElapsedMs],
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
    const truncationSummary = branchComparePreview.safety.includesTruncatedPatches
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

  /** Update the "compare has been loading for X ms" counter while compare data is loading. */
  useEffect(() => {
    if (branchCompareLoadingStartedAt === null) {
      setBranchCompareLoadingElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setBranchCompareLoadingElapsedMs(Date.now() - branchCompareLoadingStartedAt);
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [branchCompareLoadingStartedAt]);

  /**
   * Detect when the user navigates to a different `branch + selectedFile` route
   * and reset the auto-exit-review guard for that new route.
   */
  useEffect(() => {
    const nextRouteKey = `${branch}:${selectedFile}`;
    if (reviewRouteKeyRef.current === nextRouteKey) {
      return;
    }
    reviewRouteKeyRef.current = nextRouteKey;
    setAllowAutoExitReview((current) => (commitReviewMode === "review" ? current : true));
  }, [branch, selectedFile, commitReviewMode]);

  /** If review mode is open and there are no staged changes left, switch the URL back to editor mode. */
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

  /**
   * If the currently selected file is not present in the compare result, move
   * the user to the first compared file so compare mode always shows real data.
   */
  useEffect(() => {
    if (!isCompareRequested || !branchComparePreview || restoringDeletedFilePath !== null) {
      return;
    }

    if (branchComparePreview.files.some((file) => file.path === selectedFile)) {
      return;
    }

    const firstComparedFile = branchComparePreview.files.at(0);
    if (!firstComparedFile) {
      return;
    }

    navigateByHref(
      buildRepositoryFileUrl(firstComparedFile.path, {
        reviewMode: firstComparedFile.status === "deleted" ? "review" : undefined,
      }),
      {
        replace: true,
      },
    );
  }, [
    branchComparePreview,
    buildRepositoryFileUrl,
    isCompareRequested,
    navigateByHref,
    restoringDeletedFilePath,
    selectedFile,
  ]);

  // MARK: Return

  const handleSidebarModeChange = useCallback(
    (value: string) => {
      if (value === "simple" || value === "all") {
        setSidebarMode(value);
        if (isCompareRequested) {
          setCompareModeInQuery(false);
        }
      }
      if (value === "compare") {
        setCompareModeInQuery(true);
      }
    },
    [isCompareRequested, setCompareModeInQuery],
  );
  const handleOpenRootFileCreation = useCallback(() => openFileCreation(""), [openFileCreation]);
  const handleOpenRootFolderCreation = useCallback(
    () => openFolderCreation(""),
    [openFolderCreation],
  );

  const sidebarContent = useMemo(
    () => (
      <FileViewSidebarContent
        owner={owner}
        repoName={repoName}
        effectiveSidebarMode={effectiveSidebarMode}
        isCompareRequested={isCompareRequested}
        compareModeSummary={compareModeSummary}
        emptyRepository={emptyRepository}
        items={visibleTreeData}
        onFileSelect={handleFileSelect}
        onFileRename={(originalPath, newPath) => void handleFileRename(originalPath, newPath)}
        onFileCreate={handleCreateFileInFolder}
        onMediaUploadRequest={handleRequestMediaUpload}
        onFileDelete={(filePath, originalPath) => void handleFileDelete(filePath, originalPath)}
        onFileRestore={(filePath, originalPath) =>
          void handleRestoreDeletedFile(filePath, originalPath)
        }
        restoringFilePath={restoringDeletedFilePath}
        selectedFile={sidebarSelectedFile}
        folderExpansionStates={folderExpansionStates ?? []}
        onFolderToggle={handleFolderToggle}
        autoExpandedPaths={autoExpandedSidebarPaths}
        forceAutoExpandedPaths={forceSidebarSelectionVisible || effectiveSidebarMode === "compare"}
        onOpenFileCreation={handleOpenRootFileCreation}
        onOpenFolderCreation={handleOpenRootFolderCreation}
        onSidebarModeChange={handleSidebarModeChange}
      />
    ),
    [
      autoExpandedSidebarPaths,
      compareModeSummary,
      effectiveSidebarMode,
      emptyRepository,
      folderExpansionStates,
      forceSidebarSelectionVisible,
      handleCreateFileInFolder,
      handleFileDelete,
      handleFileRename,
      handleFileSelect,
      handleFolderToggle,
      handleOpenRootFileCreation,
      handleOpenRootFolderCreation,
      handleRequestMediaUpload,
      handleRestoreDeletedFile,
      handleSidebarModeChange,
      isCompareRequested,
      owner,
      repoName,
      restoringDeletedFilePath,
      sidebarSelectedFile,
      visibleTreeData,
    ],
  );
  const sidebarFooter = useMemo(
    () => (
      <FileViewSidebarFooter
        mediaUploadError={mediaUploadError}
        isMediaUploadDragOver={isMediaUploadDragOver}
        isUploadingMedia={isUploadingMedia}
        onRequestMediaUpload={handleRequestMediaUpload}
        onMediaUploadDragOverChange={setIsMediaUploadDragOver}
        onMediaUploadDrop={handleMediaUploadDrop}
      />
    ),
    [
      handleMediaUploadDrop,
      handleRequestMediaUpload,
      isMediaUploadDragOver,
      isUploadingMedia,
      mediaUploadError,
      setIsMediaUploadDragOver,
    ],
  );

  const headerTitle = selectedFile
    ? selectedFile.split("/").slice(0, -1).join("/") || "/"
    : undefined;
  const showEditorOverrideControl =
    commitReviewMode === "editor" && !selectedFileIsRenderableMedia && Boolean(stagedFile);
  const showCompareBackToEditor = shouldShowCompareBackToEditor({
    commitReviewMode,
    isCompareRequested,
    hasComparedEditorTarget: Boolean(
      selectedComparedFile && selectedComparedFile.status !== "deleted",
    ),
    hasStagedSelection: Boolean(stagedFile),
  });
  const branchCompareLoadingState = isBranchCompareLoading ? (
    <ChangedFilesLoadingState
      elapsedLabel={branchCompareLoadingStopwatchLabel}
      className="flex-1 min-h-0"
    />
  ) : null;
  const fileViewMainHeader = useMemo(
    () => (
      <FileViewMainHeader
        headerTitle={headerTitle}
        onQuickOpen={() => setIsCommandPaletteOpen(true)}
      />
    ),
    [headerTitle],
  );

  const fileViewMainContent = (
    <div className="max-w-none flex min-h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="min-w-0">
            <div className="mb-0.5 font-mono text-[11px] text-muted-foreground">{branch}</div>
            {selectedFile ? (
              <h2 className="text-base font-medium pointer-fine:text-sm">
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
          <div className="flex flex-wrap items-center gap-2">
            <RepositorySyncStatus
              repositoryId={repository.repositoryId}
              githubRepositoryFullName={githubRepositoryFullName}
              branch={branch}
              owner={owner}
              repoName={repoName}
              commitSha={commitSha}
              treeRefreshStartedAt={repository.treeRefreshStartedAt}
              lastTreeRefreshAt={repository.lastTreeRefreshAt}
              lastTreeRefreshFailedAt={repository.lastTreeRefreshFailedAt}
              treeRefreshFailureKind={repository.treeRefreshFailureKind}
              treeRefreshFailureMessage={repository.treeRefreshFailureMessage}
              treeRefreshCooldownUntil={repository.treeRefreshCooldownUntil}
              stagedFiles={stagedFiles}
              disableStagedFilesQuery
            />

            {branchHydrationState?.kind === "not_found" ? (
              <span className="text-xs text-muted-foreground">
                Branch no longer exists on GitHub. Showing the cached tree.
              </span>
            ) : branchHydrationState?.kind === "unavailable" ? (
              <span className="text-xs text-muted-foreground">
                GitHub access is unavailable. Showing the cached tree.
              </span>
            ) : null}

            <Button
              size="sm"
              variant={
                commitReviewMode === "review" || showCompareBackToEditor ? "secondary" : "outline"
              }
              onClick={handleToggleReviewMode}
              disabled={
                !showCompareBackToEditor &&
                commitReviewMode === "editor" &&
                (!hasChangesToCommit || isCommitPreviewFetching)
              }
              className="h-6 px-2 text-xs"
            >
              {commitReviewMode === "review" || showCompareBackToEditor
                ? "Back to Editor"
                : isCommitPreviewFetching
                  ? "Loading..."
                  : "Review Changes"}
            </Button>

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
          {showEditorOverrideControl ? (
            <FileViewDeveloperTools
              open={developerToolsOpen}
              onOpenChange={setDeveloperToolsOpen}
              editorOverride={editorOverride}
              onEditorOverrideChange={setEditorOverride}
            />
          ) : null}
        </div>
      </div>
      {commitError ? (
        <div className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          Commit failed: {commitError}
        </div>
      ) : null}
      <DraftPullRequestFeedbackBanner
        message={draftPullRequestError}
        branchPullRequestLookupFailed={!isDefaultBranch && branchPullRequestQuery.isError}
      />
      {branchComparePreviewError ? (
        <div className="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {branchComparePreviewError}
        </div>
      ) : null}

      <div className="relative flex flex-1 min-h-0">
        {commitReviewMode === "review" ? (
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

            {branchCompareLoadingState ? (
              branchCompareLoadingState
            ) : commitPreview || rebaseConflictPreview || branchComparePreview ? (
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
                                {rebaseConflictPreview && rebaseConflictPreview.files.length > 1
                                  ? `${rebaseConflictPreview.files.length} files need review. Rebase staging onto the latest GitHub state to materialize conflict markers or auto-merge clean files.`
                                  : "Review the conflict patches below, then rebase staging onto the latest GitHub state before editing a manual resolution."}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleRebaseOntoLatestGitHub}
                                  disabled={pullFromGitHubStatus === "loading"}
                                  className="h-7 px-2 text-xs"
                                >
                                  {pullFromGitHubStatus === "loading"
                                    ? "Rebasing..."
                                    : "Rebase onto latest GitHub"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCopyRebaseConflictBundle}
                                  disabled={
                                    rebaseConflictPreviewStatus === "loading" ||
                                    rebaseConflictBundleStatus === "loading" ||
                                    !rebaseConflictPreview ||
                                    rebaseConflictPreview.files.length === 0
                                  }
                                  className="h-7 px-2 text-xs"
                                >
                                  {rebaseConflictBundleStatus === "loading"
                                    ? "Copying..."
                                    : "Copy conflict bundle"}
                                </Button>
                              </div>
                              <div className="mt-2 text-[11px] text-amber-950/70">
                                {selectedRebaseConflictFile.baseBlobSha ? (
                                  <>
                                    Base blob: {selectedRebaseConflictFile.baseBlobSha}
                                    {"  "}
                                  </>
                                ) : null}
                                Upstream blob: {selectedRebaseConflictFile.upstreamBlobSha}
                              </div>
                              {rebaseConflictBundleFeedback ? (
                                <div className="mt-2 text-xs text-amber-950">
                                  {rebaseConflictBundleFeedback}
                                </div>
                              ) : null}
                            </div>
                            {selectedRebaseConflictFile.isBinary ? (
                              <div className="min-h-0">
                                <div className="border-b px-3 py-3 text-sm text-amber-950">
                                  Binary image conflicts cannot be merged inline. Rebase first, then
                                  upload again if you still want to replace the upstream file.
                                </div>
                                <RepositoryMediaViewer
                                  githubRepositoryFullName={githubRepositoryFullName}
                                  filePath={
                                    selectedRebaseConflictFile.upstreamPath ??
                                    selectedRebaseConflictFile.path
                                  }
                                  branch={branch}
                                  contentKey={selectedRebaseConflictFile.upstreamBlobSha}
                                  skipStaging={true}
                                />
                              </div>
                            ) : (
                              <div className="grid min-h-0 @3xl:grid-cols-2 @3xl:divide-x">
                                <div className="min-h-0">
                                  <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                                    Base -&gt; Yours
                                  </div>
                                  {selectedRebaseConflictFile.baseToStagedPatchTruncated ? (
                                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                      Patch output is truncated for this file.
                                    </div>
                                  ) : null}
                                  {selectedRebaseConflictFile.baseToStagedPatch ? (
                                    <FileViewPatchText
                                      patch={selectedRebaseConflictFile.baseToStagedPatch}
                                    />
                                  ) : null}
                                </div>
                                <div className="min-h-0 border-t @3xl:border-t-0">
                                  <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                                    Base -&gt; Upstream
                                  </div>
                                  {selectedRebaseConflictFile.baseToUpstreamPatchTruncated ? (
                                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                      Patch output is truncated for this file.
                                    </div>
                                  ) : null}
                                  {selectedRebaseConflictFile.baseToUpstreamPatch ? (
                                    <FileViewPatchText
                                      patch={selectedRebaseConflictFile.baseToUpstreamPatch}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : rebaseConflictPreview ? (
                          <div className="p-3 text-sm text-muted-foreground">
                            Loading conflicting file...
                          </div>
                        ) : selectedPreviewCanRenderInline ? (
                          <div className="min-h-full">
                            <div className="border-b px-3 py-2">
                              <FileViewInlinePreviewControls
                                controlsIdPrefix="inline-option"
                                patchAvailable={Boolean(selectedPreviewFile?.patch)}
                                showPatch={showInlinePreviewPatch}
                                allowInlineDiffs={inlinePreviewOptions.allowInlineDiffs}
                                showSideBySide={showInlinePreviewSideBySide}
                                syntaxHighlightDeletions={
                                  inlinePreviewOptions.syntaxHighlightDeletions
                                }
                                onShowPatchChange={(nextValue) => {
                                  setShowInlinePreviewPatch(nextValue);
                                  if (nextValue) {
                                    setShowInlinePreviewSideBySide(false);
                                  }
                                }}
                                onAllowInlineDiffsChange={(nextValue) => {
                                  setInlinePreviewOptions((current) => ({
                                    ...current,
                                    allowInlineDiffs: nextValue,
                                  }));
                                }}
                                onSideBySideChange={(nextValue) => {
                                  setShowInlinePreviewSideBySide(nextValue);
                                  if (nextValue) {
                                    setShowInlinePreviewPatch(false);
                                  }
                                }}
                                onSyntaxHighlightDeletionsChange={(nextValue) => {
                                  setInlinePreviewOptions((current) => ({
                                    ...current,
                                    syntaxHighlightDeletions: nextValue,
                                  }));
                                }}
                              />
                            </div>
                            {inlinePreviewSaveError ? (
                              <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                {inlinePreviewSaveError}
                              </div>
                            ) : null}
                            {showInlinePreviewPatch && selectedPreviewFile?.patch ? (
                              <FileViewPatchPreview file={selectedPreviewFile} />
                            ) : showInlinePreviewSideBySide ? (
                              <FileViewSplitPreview
                                beforeValue={selectedPreviewBaseContent}
                                afterValue={inlinePreviewEditorContent}
                                beforeFilePath={selectedPreviewBaseFilePath}
                                afterFilePath={selectedFile}
                                oldHighlightedLineNumbers={
                                  inlinePreviewSplitDiffHighlights.oldLines
                                }
                                newHighlightedLineNumbers={
                                  inlinePreviewSplitDiffHighlights.newLines
                                }
                              />
                            ) : (
                              <ProsemarkMergeEditor
                                key={`${selectedFile}:${activePreviewStagingId ?? "inline"}`}
                                value={inlinePreviewEditorContent}
                                baseValue={selectedPreviewBaseContent}
                                filePath={selectedFile}
                                options={inlinePreviewOptions}
                                editable={inlinePreviewEditable}
                                onChange={handleInlinePreviewChange}
                                className="text-sm leading-6"
                              />
                            )}
                          </div>
                        ) : selectedPreviewFile?.patch ? (
                          <FileViewPatchPreview file={selectedPreviewFile} />
                        ) : selectedFileIsRenderableMedia ? (
                          <RepositoryMediaViewer
                            githubRepositoryFullName={githubRepositoryFullName}
                            filePath={selectedFile}
                            branch={branch}
                            contentKey={selectedMediaContentKey}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : branchCompareLoadingState ? (
          branchCompareLoadingState
        ) : selectedFileIsRenderableMedia ? (
          <RepositoryMediaViewer
            githubRepositoryFullName={githubRepositoryFullName}
            filePath={selectedFile}
            branch={branch}
            contentKey={selectedMediaContentKey}
          />
        ) : stagedFile && !stagedFile.fileDeleted ? (
          <CodeEditorWrapper
            key={`${branch}/${selectedFile}-${stagedFile.parentCommitSha ?? "new"}`}
            githubRepositoryFullName={githubRepositoryFullName}
            branch={branch}
            filePath={selectedFile}
            repositoryId={repository.repositoryId}
            stagedFile={stagedFile}
            tree={repository.treeData.tree}
            treeSHA={repository.treeSHA}
            showMobileLineNumbers={showMobileEditorLineNumbers}
            editorOverride={editorOverride}
          />
        ) : isCompareRequested && selectedComparedFileCanRenderInline ? (
          <div className="min-h-full">
            <div className="border-b px-3 py-2">
              <FileViewInlinePreviewControls
                controlsIdPrefix="compare-inline-option"
                patchAvailable={Boolean(selectedComparedFile?.patch)}
                showPatch={showInlinePreviewPatch}
                allowInlineDiffs={inlinePreviewOptions.allowInlineDiffs}
                showSideBySide={showInlinePreviewSideBySide}
                syntaxHighlightDeletions={inlinePreviewOptions.syntaxHighlightDeletions}
                onShowPatchChange={(nextValue) => {
                  setShowInlinePreviewPatch(nextValue);
                  if (nextValue) {
                    setShowInlinePreviewSideBySide(false);
                  }
                }}
                onAllowInlineDiffsChange={(nextValue) => {
                  setInlinePreviewOptions((current) => ({
                    ...current,
                    allowInlineDiffs: nextValue,
                  }));
                }}
                onSideBySideChange={(nextValue) => {
                  setShowInlinePreviewSideBySide(nextValue);
                  if (nextValue) {
                    setShowInlinePreviewPatch(false);
                  }
                }}
                onSyntaxHighlightDeletionsChange={(nextValue) => {
                  setInlinePreviewOptions((current) => ({
                    ...current,
                    syntaxHighlightDeletions: nextValue,
                  }));
                }}
              />
            </div>
            {showInlinePreviewPatch && selectedComparedFile?.patch ? (
              <FileViewPatchPreview file={selectedComparedFile} />
            ) : showInlinePreviewSideBySide ? (
              <FileViewSplitPreview
                beforeValue={selectedPreviewBaseContent}
                afterValue={inlinePreviewEditorContent}
                beforeFilePath={selectedPreviewBaseFilePath}
                afterFilePath={selectedFile}
                oldHighlightedLineNumbers={inlinePreviewSplitDiffHighlights.oldLines}
                newHighlightedLineNumbers={inlinePreviewSplitDiffHighlights.newLines}
              />
            ) : (
              <ProsemarkMergeEditor
                key={`${selectedFile}:compare`}
                value={selectedComparedFile?.richNewContent ?? ""}
                baseValue={selectedComparedFile?.richOldContent ?? ""}
                filePath={selectedFile}
                options={inlinePreviewOptions}
                editable={false}
                className="text-sm leading-6"
              />
            )}
          </div>
        ) : isCompareRequested && selectedComparedFile?.patch ? (
          <FileViewPatchPreview file={selectedComparedFile} />
        ) : null}
      </div>
    </div>
  );
  const fileViewLeftPane = useMemo(
    () => ({
      header: null,
      content: sidebarContent,
      footer: sidebarFooter,
    }),
    [sidebarContent, sidebarFooter],
  );
  return (
    <AppWorkspaceRouteChrome
      headerAccessory={fileViewMainHeader}
      left={fileViewLeftPane}
      shortcutPaneSide="left"
    >
      {fileViewMainContent}

      {/* File Creation Dialog */}
      {fileCreationDialog.isOpen && (
        <FileCreationDialog
          isOpen={true}
          onClose={closeFileCreation}
          initialFolderPath={fileCreationDialog.folderPath || ""}
          onFileCreate={handleCreateFileInFolder}
          folders={repository.treeData.tree
            .map((item: GitHubTree) => {
              if (!isFileTreeNodeType(item.type)) {
                return null;
              }

              return {
                path: item.path,
                type: item.type,
                size: item.size,
              };
            })
            .filter(notEmpty)}
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

      <input
        ref={mediaUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleMediaUploadInputChange}
      />

      {pendingMediaUpload ? (
        <MediaUploadDialog
          isOpen={true}
          onClose={handleCloseMediaUploadDialog}
          fileName={pendingMediaUpload.file.name}
          initialFolderPath={pendingMediaUpload.preferredFolderPath}
          folders={finalTreeData}
          existingFilePaths={existingUploadTargetPaths}
          isSubmitting={isUploadingMedia}
          submitError={mediaUploadError}
          onSubmit={({ replaceExisting, targetPath }) =>
            handleMediaUploadSubmit({
              replaceExisting,
              targetPath,
            })
          }
        />
      ) : null}

      {/* Command Palette */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        files={visibleTreeData}
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
      />
    </AppWorkspaceRouteChrome>
  );
}

export function FileView() {
  return (
    <DialogProvider>
      <FileViewWrapper />
    </DialogProvider>
  );
}
