import { useParams, Link, useNavigate } from "react-router-dom";
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

import {
  GitHubLogoIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  FilePlusIcon,
} from "@radix-ui/react-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
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
import { nonNullable } from "@/lib/utils";
import {
  filterSimpleViewTreeItems,
  getSimpleViewPreferenceStorageKey,
  parseSimpleViewConfig,
  SIMPLE_VIEW_CONFIG_PATH,
} from "@/lib/simpleView";
import {
  claimRefreshDebounce,
  releaseRefreshDebounce,
} from "@/lib/treeRefreshDebounce";
import { type GithubTreeType } from "convex/schema";
import { DaytonaPreviewPanel } from "./DaytonaPreviewPanel";
import { VaultSyncStatus } from "./VaultSyncStatus";

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
      storageBackedSelection[selectedFile] !== true
    ) {
      void firstDocAction({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: selectedFile,
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
    vault,
    stagedFile,
    selectedFileExistsInTree,
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
  const commitSha = vault.commitSHA;

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

  // Convex hooks for staging
  const [commitStaging, manualComittingStatus] = useConvexAction(
    api.fileStagingActions.commitStaging,
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

  // Get count of staged files for this vault
  const stagedFiles = useQuery(api.fileStaging.listStagedFiles, {
    vaultId: vault._id,
  });
  const stagedNoterFile = useQuery(
    api.fileStaging.getByNewPath,
    {
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

  const handleFileSelect = useCallback(
    (path: string) => {
      if (owner && repoName) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${path}`);

        // close the sidebar
        setOpenMobile(false);
      }
    },
    [branch, navigate, owner, repoName, setOpenMobile],
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
      });

      // If we're currently viewing the renamed file, navigate to the new path
      if (stagedFile.initialFilePath === originalPath) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${newPath}`);
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

      // Mark the file for deletion in staging
      await markFileForDeletion({
        vaultId: vault._id,
        filePath,
        parentCommitSha: fileSha,
        branch,
      });

      // If the deleted file is currently selected, navigate away
      if (selectedFile === filePath) {
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

    void commitStaging({
      repositoryFullName: repositoryFullName,
    }).catch((error) => {
      console.error("Failed to commit changes:", error);
    });
  }, [commitStaging, repositoryFullName]);

  const handleResetToGitHub = useCallback(() => {
    void clearAllStaging({
      vaultId: vault._id,
    }).catch((error) => {
      console.error("Failed to reset staged files:", error);
    });
  }, [clearAllStaging, vault._id]);

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

  const finalTreeData = useMemo(() => {
    const treeItems = vault.treeData.tree
      .map((item: GithubTreeType) => {
        const stagedFile = stagedFiles?.find(
          (staged: NonNullable<typeof stagedFiles>[number]) =>
            staged.initialFilePath === item.path,
        );

        const path = stagedFile ? stagedFile.filePath : item.path;
        const deleted = stagedFile ? stagedFile.fileDeleted : false;

        if (deleted) return null;

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

    return [...treeItems, ...newFiles];
  }, [vault.treeData.tree, stagedFiles]);

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

  // MARK: Return

  return (
    <div className="flex h-screen w-full">
      <Sidebar variant="sidebar" className="border-r border-border/50">
        <SidebarContent className="p-0">
          <div className="p-3 border-b border-border/50">
            <Link
              to="/"
              className={`flex items-center justify-between ${linkStyle}`}
            >
              <UserMenu>{user?.name ?? user?.email ?? "..."}</UserMenu>
            </Link>
          </div>
          {/* Repo part */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
              <a
                className={`text-xs font-medium truncate text-muted-foreground ${linkStyle}`}
                href={`https://github.com/${owner}/${repoName}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {owner}/{repoName}
              </a>

              {/* element that takes as much space as possible to push the button to the right */}
              <div className="flex-1" />

              {/* icon button to add new file (+)*/}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 md:h-6 md:w-6 p-0"
                onClick={() => openFileCreation("")}
                title="Create new file"
              >
                <PlusIcon className="h-4 w-4 md:h-3 md:w-3" />
              </Button>

              {/* icon button to add new folder */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 md:h-6 md:w-6 p-0"
                onClick={() => openFolderCreation("")}
                title="Create new folder"
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
            <div className="p-3 text-xs text-muted-foreground">
              No files found
            </div>
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
          )}{" "}
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="flex-1">
        <div className="flex h-full flex-col">
          {/* Minimal editor header */}
          <div className="flex items-center justify-between p-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 md:h-6 md:w-6" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 md:h-6 md:w-6 p-0"
                onClick={() => setIsCommandPaletteOpen(true)}
                title="Quick Open (Cmd+P)"
              >
                <MagnifyingGlassIcon className="h-4 w-4 md:h-3 md:w-3" />
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2">
                  <span className="text-base md:text-sm font-medium truncate">
                    {selectedFile.split("/").slice(0, -1).join("/") || "/"}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-none h-full flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base md:text-sm font-medium">
                    {selectedFile}
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

                <div className="flex items-center gap-2">
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

              {viewMode === "editor" && vault && isPreviewOpen && (
                <DaytonaPreviewPanel vaultId={vault._id} className="mb-4" />
              )}

              <div className="flex-1 min-h-0">
                {viewMode === "editor" ? (
                  stagedFile && (
                    <CodeEditorWrapper
                      key={`${branch}/${selectedFile}-${stagedFile.parentCommitSha ?? "new"}`}
                      repositoryFullName={repositoryFullName}
                      filePath={selectedFile}
                      initialFilePath={stagedFile.initialFilePath}
                      stagedFile={stagedFile}
                      vaultId={vault._id}
                      tree={vault.treeData.tree}
                      treeSHA={vault.treeSHA}
                    />
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
          </div>
        </div>
      </SidebarInset>

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
    </div>
  );
}

// Main export with sidebar provider wrapper
export function FileView() {
  return (
    <DialogProvider>
      <SidebarProvider>
        <FileViewWithSwipe />
      </SidebarProvider>
    </DialogProvider>
  );
}

// Component with sidebar context and swipe gesture
function FileViewWithSwipe() {
  // Setup sidebar context and mobile swipe gesture
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  // Enable swipe-to-open sidebar on mobile
  useSwipeToOpenSidebar(() => {
    if (isMobile && !openMobile) {
      setOpenMobile(true);
    }
  });

  return <FileViewWrapper />;
}
