import { useParams, Link, useNavigate } from "react-router-dom";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { CodeEditorWrapper } from "@/components/CodeEditor";
import { Button } from "@/components/ui/button";

import {
  GitHubLogoIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  FilePlusIcon,
  UpdateIcon,
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
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { linkStyle } from "./styles";
import { useConvexAction, useConvexMutation } from "@/lib/convexUtils";
import { DialogProvider } from "@/contexts/DialogContext";
import { useDialog } from "@/hooks/useDialog";
import { FileCreationDialog } from "@/components/FileCreationDialog";
import { FolderCreationDialog } from "@/components/FolderCreationDialog";
import { nonNullable } from "@/lib/utils";
import { type GithubTreeType } from "convex/schema";
import {
  categorizeStagedFiles,
  EditedFilesCategories,
  EditedFilesCategoriesPopover,
  EditedFilesCategoriesPopoverTrigger,
} from "./EditedFilesCategories";
import { CommitStatus } from "./CommitStatus";

function formatSecondsAgo(now: number, timestamp: number): string {
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Returns a `now` timestamp that updates every second. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return now;
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

// In-memory map tracking last refresh time per vault key
const lastRefreshMap = new Map<string, number>();
const REFRESH_DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

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
  const vault = useQuery(api.vault.getVaultByRepository, {
    repositoryFullName: repositoryFullName ?? "skip",
  });
  const selectedTreeEntry = useMemo(
    () => vault?.treeData.tree.find((item) => item.path === selectedFile) ?? null,
    [vault, selectedFile],
  );
  const selectedFileExistsInTree = selectedTreeEntry?.type === "blob";

  useEffect(() => {
    if (vault === null) {
      void navigate("/", { replace: true });
    }
  }, [vault, navigate]);

  const refreshTreeIfNeeded = useCallback(() => {
    if (!vault || !owner || !repoName) return;
    const key = `${owner}/${repoName}`;
    const lastRefresh = lastRefreshMap.get(key) ?? 0;
    if (Date.now() - lastRefresh < REFRESH_DEBOUNCE_MS) return;
    lastRefreshMap.set(key, Date.now());
    void refreshTree({ owner, repo: repoName });
  }, [vault?._id, owner, repoName, refreshTree]);

  // Refresh tree from GitHub when the page regains focus (debounced to 2 min)
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
      refreshTreeIfNeeded();
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
    if (selectedFile && vault && stagedFile === null && selectedFileExistsInTree) {
      void firstDocAction({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: selectedFile,
      });
    }
  }, [
    selectedFile,
    vault,
    stagedFile,
    selectedFileExistsInTree,
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
  const now = useNow();

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
  const commitUrl = commitSha
    ? `https://github.com/${owner}/${repoName}/commit/${commitSha}`
    : null;

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

  // Convex hooks for staging
  const [commitStaging, manualComittingStatus] = useConvexAction(
    api.fileStagingActions.commitStaging,
  );

  const [markFileForDeletion] = useConvexMutation(
    api.fileStaging.markFileForDeletion,
  );
  const [renameFileInStaging] = useConvexAction(
    api.fileStagingActions.renameFileInStaging,
  );

  // Get count of staged files for this vault
  const stagedFiles = useQuery(api.fileStaging.listStagedFiles, {
    vaultId: vault._id,
  });

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

  const handleFileSelect = (path: string) => {
    if (owner && repoName) {
      void navigate(`/vault/${owner}/${repoName}/${branch}/${path}`);

      // close the sidebar
      setOpenMobile(false);
    }
  };

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
        vault.treeData.tree.find((t: GithubTreeType) => t.path === filePath)?.sha ?? null;

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

  const emptyRepository = vault.treeData.tree.length === 0;

  if (!owner || !repoName) {
    void navigate("/");
  }

  const finalTreeData = useMemo(() => {
    const treeItems = vault.treeData.tree
      .map((item: GithubTreeType) => {
        const stagedFile = stagedFiles?.find(
          (staged: NonNullable<typeof stagedFiles>[number]) => staged.initialFilePath === item.path,
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
        (staged: NonNullable<typeof stagedFiles>[number]) => staged.parentCommitSha === null && !staged.fileDeleted,
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

  // Check if there are any changes to commit
  const hasChangesToCommit = stagedFiles && stagedFiles.length > 0 && stagedFiles.some(file => 
    file.content !== file.initialContent || 
    file.filePath !== file.initialFilePath || 
    file.fileDeleted ||
    file.parentCommitSha === null
  );

  // MARK: Return

  return (
    <div className="flex h-screen w-full">
      <Sidebar variant="sidebar" className="border-r border-border/50">
        <SidebarContent className="p-0">
          {/* User part */}
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
          </div>
          {emptyRepository ? (
            <div className="p-3 text-xs text-muted-foreground">
              No files found
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <FileTree
                items={finalTreeData}
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
                <h2 className="text-base md:text-sm font-medium mb-2">
                  {selectedFile}
                </h2>

                <div className="flex items-center gap-2">
                  {stagedFiles && stagedFiles.length > 0 && (
                    <EditedFilesCategoriesPopover
                      repositoryFullName={repositoryFullName}
                      branch={branch}
                      stagedFiles={stagedFiles}
                    />
                  )}

                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {vault.treeRefreshStartedAt &&
                    now - vault.treeRefreshStartedAt < 60_000 ? (
                      <>
                        <UpdateIcon className="animate-spin" />
                        Syncing…
                      </>
                    ) : (
                      <>
                        <CommitStatus
                          owner={owner}
                          repo={repoName}
                          commitSha={commitSha}
                          className="mr-1"
                        />
                        {commitSha && commitUrl ? (
                          <a
                            className={`font-mono ${linkStyle}`}
                            href={commitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View commit on GitHub"
                          >
                            {commitSha.slice(0, 7)}
                          </a>
                        ) : (
                          <span
                            className="font-mono text-red-600"
                            title="Missing commit SHA. Refresh repository tree to backfill."
                          >
                            missing commit SHA
                          </span>
                        )}
                        {vault.lastTreeRefreshAt && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              {formatSecondsAgo(now, vault.lastTreeRefreshAt)}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </span>

                  <Button
                    size="sm"
                    variant={hasChangesToCommit ? "default" : "outline"}
                    onClick={handleManualCommit}
                    disabled={manualComittingStatus === "loading" || !hasChangesToCommit}
                    className={hasChangesToCommit 
                      ? "h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" 
                      : "h-6 px-2 text-xs border-green-600 text-green-600 hover:bg-green-50"
                    }
                  >
                    {manualComittingStatus === "loading"
                      ? "Committing..."
                      : hasChangesToCommit 
                        ? "Commit Now"
                        : "All Synced"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {stagedFile && (
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
        files={finalTreeData}
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