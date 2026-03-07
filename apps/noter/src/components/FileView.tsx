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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { GitHubLogoIcon, PlusIcon, FilePlusIcon } from "@radix-ui/react-icons";
import { SidebarProvider } from "@/components/ui/sidebar";
import { FileTree } from "./FileTree";
import { CommandPalette } from "./CommandPalette";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import { linkStyle } from "./styles";
import { useConvexAction, useConvexMutation } from "@/lib/convexUtils";
import { DialogProvider } from "@/contexts/DialogContext";
import { useDialog } from "@/hooks/useDialog";
import { FileCreationDialog } from "@/components/FileCreationDialog";
import { FolderCreationDialog } from "@/components/FolderCreationDialog";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { nonNullable } from "@/lib/utils";
import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  parseSimpleViewConfig,
  SIMPLE_VIEW_CONFIG_PATH,
} from "@/lib/simpleView";
import {
  getCommitStatusBadgeClassName,
  getCommitStatusLabel,
  getCommitStatusToken,
  type CommitReviewFileStatus as CommitPreviewFileStatus,
} from "@/lib/commitReviewStatus";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/treeRefreshDebounce";
import { type GithubTreeType } from "convex/schema";
import { DaytonaPreviewPanel } from "./DaytonaPreviewPanel";
import { DaytonaWorkspaceButton } from "./DaytonaWorkspaceButton";
import { DaytonaSnapshotBanner } from "./DaytonaSnapshotBanner";
import { CommitReviewStatusChips } from "./CommitReviewStatusChips";
import { VaultSyncStatus } from "./VaultSyncStatus";
import { RepositoryMediaViewer } from "./RepositoryMediaViewer";
import { RepositoryWorkspaceFrame } from "./RepositoryWorkspaceFrame";
import { diffLines } from "diff";
import { isRenderableRepositoryMediaPath } from "../../shared/repositoryMedia";

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

type CommitPreviewDisplayMode = "rich" | "patch";
type CommitReviewMode = "editor" | "review";

type RefreshTrigger = "focus" | "page_load";

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

function getLineCountFromDiffPart(
  value: string | undefined,
  count: number | undefined,
): number {
  if (typeof count === "number") {
    return count;
  }
  if (!value || value.length === 0) {
    return 0;
  }
  return value.split("\n").length;
}

function getRichDiffLineHighlights(
  oldContent: string,
  newContent: string,
): {
  oldLines: number[];
  newLines: number[];
} {
  const oldLines = new Set<number>();
  const newLines = new Set<number>();
  let oldLinePointer = 1;
  let newLinePointer = 1;

  for (const part of diffLines(oldContent, newContent)) {
    const lineCount = getLineCountFromDiffPart(part.value, part.count);
    if (lineCount === 0) continue;

    if (part.removed) {
      for (let index = 0; index < lineCount; index += 1) {
        oldLines.add(oldLinePointer + index);
      }
      oldLinePointer += lineCount;
      continue;
    }

    if (part.added) {
      for (let index = 0; index < lineCount; index += 1) {
        newLines.add(newLinePointer + index);
      }
      newLinePointer += lineCount;
      continue;
    }

    oldLinePointer += lineCount;
    newLinePointer += lineCount;
  }

  return {
    oldLines: [...oldLines].sort((left, right) => left - right),
    newLines: [...newLines].sort((left, right) => left - right),
  };
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

function encodeGitHubPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function FileViewWrapper() {
  const navigate = useNavigate();

  const {
    owner,
    repoName,
    "*": branchAndFilePath,
  } = useParams<{
    owner: string;
    repoName: string;
    "*": string;
  }>();

  const firstDocAction = useAction(api.fileStagingActions.getFileForEditing);
  const refreshTree = useAction(api.github.refreshRepositoryTree);
  // Parse branch and file path from the wildcard parameter
  const parsedPath = branchAndFilePath ? branchAndFilePath.split("/") : [];
  const branch = parsedPath[0] || "main";
  const selectedFile = parsedPath.slice(1).join("/");
  const repositoryFullName = owner && repoName ? `${owner}/${repoName}` : null;

  // Get vault for this repository
  // TODO: Keep vault existence checks on live query until useCacheQuery exposes
  // freshness metadata (cached null can trigger a false redirect to dashboard).
  const vault = useLiveQuery(api.vault.getVaultByRepository, {
    repositoryFullName: repositoryFullName ?? "skip",
  });
  const selectedTreeEntry = useMemo(
    () =>
      vault?.treeData.tree.find(
        (item: { path: string }) => item.path === selectedFile,
      ) ?? null,
    [vault, selectedFile],
  );
  const selectedFileExistsInTree = selectedTreeEntry?.type === "blob";
  const selectedFileIsRenderableMedia =
    isRenderableRepositoryMediaPath(selectedFile);
  const [storageBackedSelection, setStorageBackedSelection] = useState<
    Record<string, true>
  >({});

  useEffect(() => {
    if (vault?._id) {
      setStorageBackedSelection({});
    }
  }, [vault?._id]);

  useEffect(() => {
    if (vault === null) {
      void navigate("/", { replace: true });
    }
  }, [vault, navigate]);

  const refreshTreeIfNeeded = useCallback(
    (trigger: RefreshTrigger = "focus") => {
      if (!vault || !owner || !repoName) return;
      const key = `${owner}/${repoName}`;
      if (!claimRefreshDebounce("file_view", key)) return;
      void refreshTree({ owner, repo: repoName, trigger }).catch(
        (error: unknown) => {
          console.error("Failed to refresh repository tree:", error);
          releaseRefreshDebounce("file_view", key);
        },
      );
    },
    [vault?._id, owner, repoName, refreshTree],
  );

  // Refresh tree from GitHub when the page regains focus (debounced to 2 min).
  // Initial page-load refreshes use a shorter server-side debounce window.
  useEffect(() => {
    if (!vault || !owner || !repoName) return;

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
  }, [vault?._id, owner, repoName, refreshTreeIfNeeded]);

  // Auto-redirect to best file when no file is selected
  useEffect(() => {
    if (
      !selectedFile &&
      (vault?.treeData.tree ?? []).length > 0 &&
      owner &&
      repoName
    ) {
      const bestFile = findBestInitialFile(vault?.treeData.tree ?? []);
      if (bestFile) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${bestFile}`, {
          replace: true,
        });
      }
    }
  }, [selectedFile, vault, owner, repoName, branch, navigate, firstDocAction]);

  const stagedFile = useQuery(
    api.fileStaging.getByNewPath,
    vault
      ? {
          branch,
          newPath: selectedFile,
          vaultId: vault._id,
        }
      : "skip",
  );

  // If a selected file path does not exist in this vault, redirect to the best initial file.
  useEffect(() => {
    if (!selectedFile || !vault || !owner || !repoName) return;
    // Wait until staging query resolves before deciding that the file is missing.
    if (stagedFile === undefined) return;
    if (stagedFile || selectedFileExistsInTree) return;

    const bestFile = findBestInitialFile(vault.treeData.tree ?? []);
    if (bestFile) {
      void navigate(`/vault/${owner}/${repoName}/${branch}/${bestFile}`, {
        replace: true,
      });
      return;
    }

    void navigate(`/vault/${owner}/${repoName}/${branch}`, {
      replace: true,
    });
  }, [
    selectedFile,
    vault,
    owner,
    repoName,
    stagedFile,
    selectedFileExistsInTree,
    branch,
    navigate,
  ]);

  // If file not staged,
  useEffect(() => {
    if (
      selectedFile &&
      vault &&
      stagedFile === null &&
      selectedFileExistsInTree &&
      !selectedFileIsRenderableMedia &&
      storageBackedSelection[selectedFile] !== true
    ) {
      void firstDocAction({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: selectedFile,
        branch,
      }).catch((error: unknown) => {
        if (isStorageBackedFileError(error)) {
          setStorageBackedSelection((previous) => ({
            ...previous,
            [selectedFile]: true,
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
    storageBackedSelection,
    firstDocAction,
    owner,
    repoName,
  ]);

  if (!vault || !selectedFile || !owner || !repoName) {
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
  const { search } = useLocation();

  // Get current user for sidebar
  const user = useQuery(api.users.viewer);

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
  const selectedFileIsRenderableMedia =
    isRenderableRepositoryMediaPath(selectedFile);
  const commitSha = vault.commitSHA;
  const selectedFileGitHubUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/blob/${encodeGitHubPath(branch)}/${encodeGitHubPath(selectedFile)}`;

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
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(
    null,
  );
  const [commitPreviewDisplayPreference, setCommitPreviewDisplayPreference] =
    useState<CommitPreviewDisplayMode>("rich");
  const [commitPreviewDisplayMode, setCommitPreviewDisplayMode] =
    useState<CommitPreviewDisplayMode>("patch");
  const [commitPreviewError, setCommitPreviewError] = useState<string | null>(
    null,
  );

  // Convex hooks for staging
  const [commitStaging, manualComittingStatus] = useConvexAction(
    api.fileStagingActions.commitStaging,
  );
  const [getCommitPreview, commitPreviewStatus] = useConvexAction(
    api.fileStagingActions.getCommitPreview,
  );
  const [clearAllStaging, clearingStagingStatus] = useConvexMutation(
    api.fileStaging.clearAllStaging,
  );

  const [markFileForDeletion] = useConvexMutation(
    api.fileStaging.markFileForDeletion,
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

  // Get count of staged files for this vault
  const stagedFiles = useQuery(api.fileStaging.listStagedFiles, {
    vaultId: vault._id,
    branch,
  });
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
  const [simpleViewMode, setSimpleViewMode] = useState<"simple" | "all">("all");

  const createFileInStaging = useMutation(api.fileStaging.createFileInStaging);
  const showMobileEditorLineNumbers = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("mobileLineNumbers") === "1";
  }, [search]);
  const commitReviewMode = useMemo<CommitReviewMode>(() => {
    const params = new URLSearchParams(search);
    return params.has("diff") ? "review" : "editor";
  }, [search]);

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

  const hasRepositoryNoterFile = useMemo(
    () =>
      vault.treeData.tree.some(
        (item: GithubTreeType) =>
          item.type === "blob" && item.path === SIMPLE_VIEW_CONFIG_PATH,
      ),
    [vault.treeData.tree],
  );

  const hasNoterConfigFile =
    hasRepositoryNoterFile ||
    (stagedNoterFile !== undefined &&
      stagedNoterFile !== null &&
      !stagedNoterFile.fileDeleted);

  const simpleViewStorageKey = useMemo(
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
  }, [vault._id]);

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
    if (stagedNoterFile === undefined) {
      return;
    }
    if (!hasRepositoryNoterFile) {
      return;
    }
    if (stagedNoterFile && !stagedNoterFile.fileDeleted) {
      return;
    }
    if (didAttemptRepositoryNoterLoad) {
      return;
    }

    let cancelled = false;
    setDidAttemptRepositoryNoterLoad(true);

    void loadRepositoryFileContent({
      repositoryFullName,
      filePath: SIMPLE_VIEW_CONFIG_PATH,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRepositoryNoterContent(result.exists ? result.content : null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRepositoryNoterContent(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    didAttemptRepositoryNoterLoad,
    hasRepositoryNoterFile,
    loadRepositoryFileContent,
    repositoryFullName,
    stagedNoterFile,
  ]);

  useEffect(() => {
    const defaultMode = hasNoterConfigFile ? "simple" : "all";

    try {
      const storedMode = localStorage.getItem(simpleViewStorageKey);
      if (storedMode === "simple" || storedMode === "all") {
        setSimpleViewMode(storedMode);
        return;
      }
    } catch (error) {
      console.warn("Failed to read simple view preference", error);
    }

    setSimpleViewMode(defaultMode);
  }, [hasNoterConfigFile, simpleViewStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(simpleViewStorageKey, simpleViewMode);
    } catch (error) {
      console.warn("Failed to persist simple view preference", error);
    }
  }, [simpleViewMode, simpleViewStorageKey]);

  const stagedNoterContent =
    stagedNoterFile !== undefined &&
    stagedNoterFile !== null &&
    !stagedNoterFile.fileDeleted
      ? stagedNoterFile.content
      : null;
  const noterConfigContent = stagedNoterContent ?? repositoryNoterContent;

  const simpleViewConfig = useMemo(
    () => parseSimpleViewConfig(noterConfigContent),
    [noterConfigContent],
  );
  const buildVaultFileUrl = useCallback(
    (
      path: string,
      options?: {
        reviewMode?: CommitReviewMode;
      },
    ) => {
      const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const searchParams = new URLSearchParams(search);
      const preserveCurrentReviewMode = options?.reviewMode === undefined;
      const includeDiff =
        options?.reviewMode === "review" ||
        (preserveCurrentReviewMode && searchParams.has("diff"));
      searchParams.delete("diff");
      const baseQuery = searchParams.toString();
      const queryString = includeDiff
        ? baseQuery.length > 0
          ? `${baseQuery}&diff`
          : "diff"
        : baseQuery;
      return `/vault/${owner}/${repoName}/${branch}/${encodedPath}${queryString.length > 0 ? `?${queryString}` : ""}`;
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
      });
    },
    [buildVaultFileUrl, navigate, selectedFile],
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      if (owner && repoName) {
        void navigate(buildVaultFileUrl(path));

        // close the sidebar
        setOpenMobile(false);
      }
    },
    [buildVaultFileUrl, navigate, owner, repoName, setOpenMobile],
  );

  const handleOpenFileFromGraph = useCallback(
    (path: string) => {
      setViewMode("editor");
      handleFileSelect(path);
    },
    [handleFileSelect],
  );

  const handleFileRename = async (originalPath: string, newPath: string) => {
    if (!owner || !repoName || !stagedFile) return;

    try {
      // Rename the file in staging instead of committing immediately
      await renameFileInStaging({
        vaultId: vault._id,
        originalPath,
        newPath,
        branch,
      });

      // If we're currently viewing the renamed file, navigate to the new path
      if (stagedFile.initialFilePath === originalPath) {
        void navigate(buildVaultFileUrl(newPath));
      }

      console.log(`File ${originalPath} renamed to ${newPath} in staging`);
    } catch (error) {
      console.error("Failed to rename file:", error);
    }
  };

  // Handler for deleting files from the file tree
  const handleFileDelete = async (filePath: string) => {
    if (!owner || !repoName) return;

    try {
      // Get the file's SHA from the tree (null for new files)
      const fileSha =
        vault.treeData.tree.find((t: GithubTreeType) => t.path === filePath)
          ?.sha ?? null;

      // Ensure we retain original file content in staging for review mode.
      if (fileSha) {
        try {
          await stageFileForEditing({
            repositoryFullName: `${owner}/${repoName}`,
            originalFilePath: filePath,
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
        void navigate(`/vault/${owner}/${repoName}/${branch}`);
      }

      console.log(`File ${filePath} marked for deletion`);
    } catch (error) {
      console.error("Failed to delete file:", error);
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
        void navigate(`/vault/${owner}/${repoName}/${branch}/${filePath}`);
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
    if (!selectedFile) return;
    setCommitError(null);

    void commitStaging({
      repositoryFullName: repositoryFullName,
      branch,
    }).catch((error) => {
      console.error("Failed to commit changes:", error);
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Commit failed";
      setCommitError(message);
    });
  }, [branch, commitStaging, repositoryFullName, selectedFile]);

  const handleResetToGitHub = useCallback(() => {
    setCommitError(null);
    void clearAllStaging({
      vaultId: vault._id,
      branch,
    }).catch((error) => {
      console.error("Failed to reset staged files:", error);
    });
  }, [branch, clearAllStaging, vault._id]);

  const loadCommitPreview = useCallback(() => {
    setCommitPreviewError(null);
    return getCommitPreview({
      repositoryFullName,
      branch,
      includePatch: true,
    })
      .then((preview) => {
        setCommitPreview(preview);
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : "Failed to load commit preview";
        setCommitPreviewError(message);
      });
  }, [branch, getCommitPreview, repositoryFullName]);

  const handleToggleReviewMode = useCallback(() => {
    if (commitReviewMode === "review") {
      setReviewModeInQuery("editor");
      return;
    }

    setCommitPreview(null);
    setCommitPreviewDisplayPreference("rich");
    setCommitPreviewDisplayMode("patch");
    setReviewModeInQuery("review");
  }, [commitReviewMode, setReviewModeInQuery]);

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

  const selectedPreviewFile =
    commitPreview?.files.find((file) => file.path === selectedFile) ?? null;
  const fallbackPreviewFile = commitPreview?.files[0] ?? null;
  const activePreviewFile = selectedPreviewFile ?? fallbackPreviewFile;
  const selectedPreviewCanRenderRichMarkdown = Boolean(
    activePreviewFile?.isMarkdown &&
      typeof activePreviewFile.richOldContent === "string" &&
      typeof activePreviewFile.richNewContent === "string",
  );
  const selectedPreviewRichDiffLines = useMemo(
    () =>
      selectedPreviewCanRenderRichMarkdown && activePreviewFile
        ? getRichDiffLineHighlights(
            activePreviewFile.richOldContent ?? "",
            activePreviewFile.richNewContent ?? "",
          )
        : null,
    [selectedPreviewCanRenderRichMarkdown, activePreviewFile],
  );

  useEffect(() => {
    if (selectedPreviewCanRenderRichMarkdown) {
      setCommitPreviewDisplayMode(commitPreviewDisplayPreference);
      return;
    }
    setCommitPreviewDisplayMode("patch");
  }, [
    commitPreviewDisplayPreference,
    selectedPreviewCanRenderRichMarkdown,
    activePreviewFile?.path,
  ]);

  const finalTreeData = useMemo(() => {
    const treeItems = vault.treeData.tree
      .map((item: GithubTreeType) => {
        const stagedFile = stagedFiles?.find(
          (staged: NonNullable<typeof stagedFiles>[number]) =>
            staged.initialFilePath === item.path,
        );

        const path = stagedFile ? stagedFile.filePath : item.path;
        const deleted = stagedFile ? stagedFile.fileDeleted : false;

        if (deleted && commitReviewMode !== "review") return null;

        return {
          deleted,
          path,
          originalPath: item.path,
          type: item.type as "tree" | "blob",
          size: item.size,
        };
      })
      .filter(nonNullable);

    // Add new files from staging (parentCommitSha is null)
    const newFiles = (stagedFiles || [])
      .filter(
        (staged: NonNullable<typeof stagedFiles>[number]) =>
          staged.parentCommitSha === null && !staged.fileDeleted,
      )
      .map((staged: NonNullable<typeof stagedFiles>[number]) => ({
        deleted: false,
        path: staged.filePath,
        originalPath: staged.initialFilePath,
        type: "blob" as const,
        size: undefined,
      }));
    const existingPaths = new Set(
      [...treeItems, ...newFiles].map((item) => item.path),
    );
    const deletedFiles =
      commitReviewMode === "review"
        ? (stagedFiles || [])
            .filter(
              (staged: NonNullable<typeof stagedFiles>[number]) =>
                staged.fileDeleted && !existingPaths.has(staged.filePath),
            )
            .map((staged: NonNullable<typeof stagedFiles>[number]) => ({
              deleted: true,
              path: staged.filePath,
              originalPath: staged.initialFilePath,
              type: "blob" as const,
              size: undefined,
            }))
        : [];

    return [...treeItems, ...newFiles, ...deletedFiles];
  }, [vault.treeData.tree, stagedFiles, commitReviewMode]);

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

  const visibleTreeData = useMemo(() => {
    if (simpleViewMode !== "simple") {
      return finalTreeData;
    }

    if (
      !simpleViewConfig.hasValidConfig ||
      simpleViewConfig.excludePatterns.length === 0
    ) {
      return finalTreeData;
    }

    return filterSimpleViewTreeItems(
      finalTreeData,
      simpleViewConfig.excludePatterns,
    );
  }, [finalTreeData, simpleViewConfig, simpleViewMode]);

  const emptyRepository = visibleTreeData.length === 0;

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
  const commitPreviewRefreshKey = useMemo(
    () =>
      (stagedFiles ?? [])
        .map(
          (file: NonNullable<typeof stagedFiles>[number]) =>
            `${file._id}:${file.version}:${file.filePath}:${file.initialFilePath}:${file.fileDeleted}:${file.parentCommitSha ?? "new"}`,
        )
        .sort()
        .join("|"),
    [stagedFiles],
  );

  useEffect(() => {
    if (hasChangesToCommit || commitReviewMode !== "review") return;
    setReviewModeInQuery("editor", { replace: true });
  }, [hasChangesToCommit, commitReviewMode, setReviewModeInQuery]);

  useEffect(() => {
    if (commitReviewMode !== "review" || !hasChangesToCommit) return;
    void loadCommitPreview();
  }, [
    commitReviewMode,
    hasChangesToCommit,
    commitPreviewRefreshKey,
    loadCommitPreview,
  ]);

  // MARK: Return

  const sidebarContent = (
    <>
      <div className="border-b border-border/50 p-3">
        <Link
          to="/"
          className={`flex items-center justify-between ${linkStyle}`}
        >
          <UserMenu>{user?.name ?? user?.email ?? "..."}</UserMenu>
        </Link>
      </div>
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
        <div className="mt-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={simpleViewMode}
            className="justify-start"
            onValueChange={(value) => {
              if (value === "simple" || value === "all") {
                setSimpleViewMode(value);
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
          </ToggleGroup>
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
            onFileDelete={(filePath) => void handleFileDelete(filePath)}
            selectedFile={selectedFile}
            folderExpansionStates={folderExpansionStates ?? []}
            onFolderToggle={handleFolderToggle}
          />
        </div>
      )}
    </>
  );

  const headerTitle = selectedFile
    ? selectedFile.split("/").slice(0, -1).join("/") || "/"
    : undefined;

  return (
    <>
      <RepositoryWorkspaceFrame
        sidebarContent={sidebarContent}
        headerTitle={headerTitle}
        onQuickOpen={() => setIsCommandPaletteOpen(true)}
      >
        <div className="max-w-none h-full flex flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
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
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DaytonaSnapshotBanner
                branch={branch}
                commitSha={vault.commitSHA}
                snapshotName={vault.daytonaCurrentSnapshotName}
                snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                lastError={vault.daytonaCurrentSnapshotLastError}
                className="w-full"
              />
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
              <DaytonaWorkspaceButton
                vaultId={vault._id}
                branch={branch}
                commitSha={vault.commitSHA}
                snapshotStatus={vault.daytonaCurrentSnapshotStatus}
                snapshotName={vault.daytonaCurrentSnapshotName}
                snapshotError={vault.daytonaCurrentSnapshotLastError}
                mode="launch"
                className="text-xs"
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
                    (!hasChangesToCommit || commitPreviewStatus === "loading")
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

              <Button
                size="sm"
                variant={hasChangesToCommit ? "default" : "outline"}
                onClick={handleManualCommit}
                disabled={
                  manualComittingStatus === "loading" || !hasChangesToCommit
                }
                className={
                  hasChangesToCommit
                    ? "h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                    : "h-6 px-2 text-xs border-green-500 text-green-600 hover:bg-green-50"
                }
              >
                {manualComittingStatus === "loading"
                  ? "Committing..."
                  : hasChangesToCommit
                    ? "Commit Now"
                    : "All Synced"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResetToGitHub}
                disabled={
                  clearingStagingStatus === "loading" ||
                  manualComittingStatus === "loading" ||
                  !hasChangesToCommit
                }
                className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
              >
                {clearingStagingStatus === "loading"
                  ? "Resetting..."
                  : "Reset to GitHub"}
              </Button>
            </div>
          </div>
          {commitError ? (
            <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              Commit failed: {commitError}
            </div>
          ) : null}

          {viewMode === "editor" && isPreviewOpen && (
            <DaytonaPreviewPanel vaultId={vault._id} className="mb-4" />
          )}

          <div className="flex-1 min-h-0">
            {viewMode === "editor" ? (
              commitReviewMode === "review" ? (
                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded border bg-muted/20">
                  {commitPreviewStatus === "loading" &&
                  commitPreview === null ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      Loading commit preview...
                    </div>
                  ) : null}

                  {commitPreviewError ? (
                    <div className="mx-3 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {commitPreviewError}
                    </div>
                  ) : null}

                  {commitPreview ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                        Branch:{" "}
                        <span className="font-mono text-foreground">
                          {commitPreview.branch}
                        </span>
                        {" · "}
                        {commitPreview.totals.files} files
                        {" · "}
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{commitPreview.totals.additions}
                        </span>
                        {" / "}
                        <span className="text-rose-600 dark:text-rose-400">
                          -{commitPreview.totals.deletions}
                        </span>
                        {commitPreview.hasDestructiveChanges
                          ? " · includes deletions"
                          : ""}
                        {commitPreview.safety.includesTruncatedPatches
                          ? ` · ${commitPreview.safety.truncatedPatchFileCount} patch${commitPreview.safety.truncatedPatchFileCount === 1 ? "" : "es"} truncated`
                          : ""}
                      </div>

                      <div className="border-b px-3 py-2">
                        <CommitReviewStatusChips
                          totals={commitPreview.totals}
                        />
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                        <aside className="shrink-0 border-b md:h-full md:w-80 md:border-b-0 md:border-r">
                          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Staged Files
                          </div>
                          <div className="max-h-52 overflow-auto md:h-full md:max-h-none">
                            {commitPreview.files.length === 0
                              ? null
                              : commitPreview.files.map((file) => {
                                  const isActive =
                                    activePreviewFile?.path === file.path;
                                  return (
                                    <button
                                      key={file.path}
                                      className={`w-full border-t px-3 py-2 text-left transition-colors ${isActive ? "bg-muted/60" : "hover:bg-muted/40"}`}
                                      onClick={() =>
                                        handleFileSelect(file.path)
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-[10px] ${getCommitStatusBadgeClassName(file.status)}`}
                                        >
                                          {getCommitStatusToken(file.status)}
                                        </span>
                                        <span className="truncate font-mono text-xs text-foreground">
                                          {file.path}
                                        </span>
                                      </div>
                                      <div className="mt-1 pl-7 text-[11px] text-muted-foreground">
                                        {getCommitStatusLabel(file.status)}
                                        {file.previousPath ? (
                                          <>
                                            {" · "}from{" "}
                                            <span className="font-mono">
                                              {file.previousPath}
                                            </span>
                                          </>
                                        ) : null}
                                        {" · "}
                                        <span className="text-emerald-600 dark:text-emerald-400">
                                          +{file.additions}
                                        </span>
                                        {" / "}
                                        <span className="text-rose-600 dark:text-rose-400">
                                          -{file.deletions}
                                        </span>
                                      </div>
                                    </button>
                                  );
                                })}
                          </div>
                        </aside>

                        {activePreviewFile ? (
                          <div className="flex min-h-0 flex-1 flex-col">
                            {selectedPreviewFile === null ? (
                              <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Current file has no staged diff. Showing{" "}
                                <span className="font-mono text-amber-950">
                                  {activePreviewFile.path}
                                </span>{" "}
                                instead.
                              </div>
                            ) : null}

                            <div className="border-b px-3 py-2">
                              <div className="mb-2 text-xs text-muted-foreground">
                                <span className="font-mono text-foreground">
                                  {getCommitStatusToken(
                                    activePreviewFile.status,
                                  )}{" "}
                                  {activePreviewFile.path}
                                </span>
                                {activePreviewFile.previousPath ? (
                                  <span>
                                    {" · "}from{" "}
                                    <span className="font-mono">
                                      {activePreviewFile.previousPath}
                                    </span>
                                  </span>
                                ) : null}
                                {" · "}
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  +{activePreviewFile.additions}
                                </span>
                                {" / "}
                                <span className="text-rose-600 dark:text-rose-400">
                                  -{activePreviewFile.deletions}
                                </span>
                              </div>
                              {selectedPreviewCanRenderRichMarkdown ? (
                                <ToggleGroup
                                  type="single"
                                  size="sm"
                                  value={commitPreviewDisplayMode}
                                  className="justify-start"
                                  onValueChange={(value) => {
                                    if (value === "rich" || value === "patch") {
                                      setCommitPreviewDisplayMode(value);
                                      setCommitPreviewDisplayPreference(value);
                                    }
                                  }}
                                >
                                  <ToggleGroupItem
                                    value="rich"
                                    aria-label="Rich markdown preview"
                                    className="h-7 px-2 text-xs"
                                  >
                                    Rich
                                  </ToggleGroupItem>
                                  <ToggleGroupItem
                                    value="patch"
                                    aria-label="Source patch preview"
                                    className="h-7 px-2 text-xs"
                                  >
                                    Patch
                                  </ToggleGroupItem>
                                </ToggleGroup>
                              ) : null}
                            </div>

                            <div className="flex-1 overflow-auto">
                              {commitPreviewDisplayMode === "rich" &&
                              selectedPreviewCanRenderRichMarkdown ? (
                                <div>
                                  {activePreviewFile.richContentTruncated ? (
                                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                      Rich markdown preview is truncated for
                                      this file.
                                    </div>
                                  ) : null}

                                  <div className="grid gap-3 p-3 md:grid-cols-2">
                                    <div className="min-w-0 rounded border bg-background p-3">
                                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
                                        Before
                                      </div>
                                      <ProsemarkReadOnly
                                        value={
                                          activePreviewFile.richOldContent ?? ""
                                        }
                                        highlightedLineNumbers={
                                          selectedPreviewRichDiffLines?.oldLines ??
                                          []
                                        }
                                        lineHighlightTone="remove"
                                        className="text-sm leading-6"
                                      />
                                    </div>
                                    <div className="min-w-0 rounded border bg-background p-3">
                                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                        After
                                      </div>
                                      <ProsemarkReadOnly
                                        value={
                                          activePreviewFile.richNewContent ?? ""
                                        }
                                        highlightedLineNumbers={
                                          selectedPreviewRichDiffLines?.newLines ??
                                          []
                                        }
                                        lineHighlightTone="add"
                                        className="text-sm leading-6"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : activePreviewFile.patch ? (
                                <div>
                                  {activePreviewFile.patchTruncated ? (
                                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                      Patch output is truncated for this file.
                                    </div>
                                  ) : null}
                                  <div className="p-3 font-mono text-xs leading-5">
                                    {activePreviewFile.patch
                                      .split("\n")
                                      .map((line, index) => (
                                        <div
                                          key={`${index}:${line}`}
                                          className={`whitespace-pre-wrap rounded-sm px-1 ${getPatchLineClassName(line)}`}
                                        >
                                          {line.length > 0 ? line : " "}
                                        </div>
                                      ))}
                                  </div>
                                </div>
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
              ) : (
                stagedFile && (
                  <CodeEditorWrapper
                    key={`${branch}/${selectedFile}-${stagedFile.parentCommitSha ?? "new"}`}
                    repositoryFullName={repositoryFullName}
                    branch={branch}
                    filePath={selectedFile}
                    vaultId={vault._id}
                    initialFilePath={stagedFile.initialFilePath}
                    stagedFile={stagedFile}
                    tree={vault.treeData.tree}
                    treeSHA={vault.treeSHA}
                    showMobileLineNumbers={showMobileEditorLineNumbers}
                  />
                )
              )
            ) : (
              <AgentGraphView
                nodes={agentGraphNodes}
                edges={agentGraphEdges}
                onOpenFile={handleOpenFileFromGraph}
                vaultId={vault._id}
                repositoryFullName={repositoryFullName}
                branch={branch}
                filePath={selectedFile}
              />
            )}
          </div>
        </div>
      </RepositoryWorkspaceFrame>

      {/* File Creation Dialog */}
      {fileCreationDialog.isOpen && (
        <FileCreationDialog
          isOpen={true}
          onClose={closeFileCreation}
          initialFolderPath={fileCreationDialog.folderPath || ""}
          onFileCreate={handleCreateFileInFolder}
          folders={vault.treeData.tree.map((item: GithubTreeType) => ({
            path: item.path,
            type: item.type as "tree" | "blob",
            size: item.size,
          }))}
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
