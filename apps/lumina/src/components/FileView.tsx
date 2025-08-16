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
  Pencil1Icon,
  TrashIcon,
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
import { useState, useEffect, useMemo } from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { linkStyle } from "./styles";
import {
  GetFunctionReferenceReturnType,
  useConvexAction,
  useConvexMutation,
} from "@/lib/convexUtils";
import { DialogProvider } from "@/contexts/DialogContext";
import { useDialog } from "@/hooks/useDialog";
import { FileCreationDialog } from "@/components/FileCreationDialog";
import { FolderCreationDialog } from "@/components/FolderCreationDialog";
import { nonNullable } from "@/lib/utils";
import { type GithubTreeType } from "convex/schema";

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

// Helper function to categorize staged files by change type
function categorizeStagedFiles(stagedFiles: any[]) {
  const categories = {
    deleted: [] as any[],
    renamed: [] as any[],
    renamedAndModified: [] as any[],
    modified: [] as any[],
    new: [] as any[],
  };

  stagedFiles.forEach((file) => {
    if (file.fileDeleted) {
      categories.deleted.push(file);
    } else if (file.filePath !== file.initialFilePath) {
      // It's a rename
      if (file.content !== file.initialContent) {
        // Renamed AND modified
        categories.renamedAndModified.push(file);
      } else {
        // Just renamed
        categories.renamed.push(file);
      }
    } else if (file.content !== file.initialContent) {
      // Just modified
      categories.modified.push(file);
    } else {
      // This shouldn't normally happen, but just in case
      categories.new.push(file);
    }
  });

  return categories;
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
  // Parse branch and file path from the wildcard parameter
  const parsedPath = branchAndFilePath ? branchAndFilePath.split("/") : [];
  const branch = parsedPath[0] || "main";
  const selectedFile = parsedPath.slice(1).join("/");
  const repositoryFullName = owner && repoName ? `${owner}/${repoName}` : null;

  // Get vault for this repository
  const vault = useQuery(api.vault.getVaultByRepository, {
    repositoryFullName: repositoryFullName ?? "skip",
  });

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

  // If file not staged,
  useEffect(() => {
    if (selectedFile && !stagedFile) {
      void firstDocAction({
        repositoryFullName: `${owner}/${repoName}`,
        originalFilePath: selectedFile,
      });
    }
  }, [selectedFile, stagedFile, firstDocAction, owner, repoName]);

  if (!vault || !selectedFile || !owner || !repoName || !stagedFile) {
    return null;
  }

  return (
    <FileViewInner
      vault={vault}
      selectedFile={selectedFile}
      branch={branch}
      owner={owner}
      repoName={repoName}
      stagedFile={stagedFile}
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
  vault: NonNullable<
    GetFunctionReferenceReturnType<typeof api.vault.getVaultByRepository>
  >;
  branch: string;
  selectedFile: string;
  owner: string;
  repoName: string;
  stagedFile: NonNullable<
    GetFunctionReferenceReturnType<typeof api.fileStaging.getByNewPath>
  >;
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

  // Folder expansion state
  const folderExpansionStates = useQuery(
    api.folderExpansion.getFolderExpansionStates,
    vault ? { vaultId: vault._id } : "skip",
  );
  const setFolderExpansionState = useMutation(
    api.folderExpansion.setFolderExpansionState,
  );

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

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

  // Get count of staged files for this vault
  const stagedFiles = useQuery(
    api.fileStaging.listStagedFiles,
    vault ? { vaultId: vault._id } : "skip",
  );

  const createFile = useAction(api.github.createFile);

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
    if (!owner || !repoName || !vault) return;

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
    if (!owner || !repoName || !vault) return;

    try {
      // Mark the file for deletion in staging
      await markFileForDeletion({
        vaultId: vault._id,
        filePath,
        parentCommitSha: "main", // TODO: Get actual commit SHA
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

    createFile({
      owner,
      repo: repoName,
      path: filePath,
      content: "",
      message: `Create ${filePath}`,
      branch,
    })
      .then(() => {
        // Refresh the tree
        // void tree.refetch();
        // TODO: Update

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
    createFile({
      owner,
      repo: repoName,
      path: readmeFilePath,
      content: `# ${folderName}\n\nThis folder was created automatically.`,
      message: `Create folder ${newFolderPath}`,
      branch,
    }).catch((error) => {
      console.error("Failed to create folder:", error);
    });
  };

  const handleManualCommit = async () => {
    if (!selectedFile || !vault) return;

    try {
      await commitStaging({
        repositoryFullName: repositoryFullName,
        currentFilePath: selectedFile,
      });
    } catch (error) {
      console.error("Failed to commit changes:", error);
    }
  };

  const handleResetToGitHub = async () => {
    if (!vault) return;

    await clearAllStaging({
      vaultId: vault._id,
    });
  };

  const handleFolderToggle = async (
    folderPath: string,
    isExpanded: boolean,
  ) => {
    if (vault) {
      await setFolderExpansionState({
        vaultId: vault._id,
        folderPath,
        isExpanded,
      });
    }
  };

  const emptyRepository = vault.treeData.tree.length === 0;

  if (!owner || !repoName) {
    void navigate("/");
  }

  const finalTreeData = useMemo(() => {
    if (!stagedFiles) return [];

    return vault.treeData.tree
      .map((item) => {
        const stagedFile = stagedFiles.find(
          (staged) => staged.initialFilePath === item.path,
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
  }, [vault.treeData.tree, stagedFiles]);

  // Assume this means it's loading
  if (vault === undefined) {
    return null;
  }

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
              {stagedFiles && (
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
                  onFolderToggle={(folderPath, isExpanded) =>
                    void handleFolderToggle(folderPath, isExpanded)
                  }
                />
              )}
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className={`text-xs text-muted-foreground ${linkStyle} flex items-center gap-2`}
                        >
                          <div className="flex items-center gap-1">
                            {(() => {
                              const categories =
                                categorizeStagedFiles(stagedFiles);
                              const indicators = [];

                              if (categories.modified.length > 0) {
                                indicators.push(
                                  <span
                                    key="modified"
                                    className="inline-flex items-center gap-1 text-blue-600"
                                  >
                                    <Pencil1Icon className="w-3 h-3" />
                                    <span>{categories.modified.length}</span>
                                  </span>,
                                );
                              }

                              if (categories.renamed.length > 0) {
                                indicators.push(
                                  <span
                                    key="renamed"
                                    className="inline-flex items-center gap-1 text-purple-600"
                                  >
                                    <UpdateIcon className="w-3 h-3" />
                                    <span>{categories.renamed.length}</span>
                                  </span>,
                                );
                              }

                              if (categories.renamedAndModified.length > 0) {
                                indicators.push(
                                  <span
                                    key="renamedAndModified"
                                    className="inline-flex items-center gap-1 text-orange-600"
                                  >
                                    <UpdateIcon className="w-3 h-3" />
                                    <Pencil1Icon className="w-2.5 h-2.5" />
                                    <span>
                                      {categories.renamedAndModified.length}
                                    </span>
                                  </span>,
                                );
                              }

                              if (categories.deleted.length > 0) {
                                indicators.push(
                                  <span
                                    key="deleted"
                                    className="inline-flex items-center gap-1 text-red-600"
                                  >
                                    <TrashIcon className="w-3 h-3" />
                                    <span>{categories.deleted.length}</span>
                                  </span>,
                                );
                              }

                              if (categories.new.length > 0) {
                                indicators.push(
                                  <span
                                    key="new"
                                    className="inline-flex items-center gap-1 text-green-600"
                                  >
                                    <PlusIcon className="w-3 h-3" />
                                    <span>{categories.new.length}</span>
                                  </span>,
                                );
                              }

                              return indicators.length > 0 ? (
                                indicators
                              ) : (
                                <span>
                                  {stagedFiles.length} file
                                  {stagedFiles.length !== 1 ? "s" : ""} changed
                                </span>
                              );
                            })()}
                          </div>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="end"
                        className="w-80 p-3"
                      >
                        <div className="space-y-3">
                          <div className="text-sm font-medium">
                            Staged Changes
                          </div>
                          <div className="space-y-3 max-h-64 overflow-y-auto">
                            {(() => {
                              const categories =
                                categorizeStagedFiles(stagedFiles);
                              const sections = [];

                              if (categories.modified.length > 0) {
                                sections.push(
                                  <div key="modified" className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-medium text-blue-600">
                                      <Pencil1Icon className="w-3 h-3" />
                                      Modified ({categories.modified.length})
                                    </div>
                                    <div className="space-y-1 pl-5">
                                      {categories.modified.map((file) => (
                                        <button
                                          key={file.filePath}
                                          onClick={() => {
                                            void navigate(
                                              `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                                            );
                                          }}
                                          className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
                                        >
                                          {file.filePath}
                                        </button>
                                      ))}
                                    </div>
                                  </div>,
                                );
                              }

                              if (categories.renamed.length > 0) {
                                sections.push(
                                  <div key="renamed" className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-medium text-purple-600">
                                      <UpdateIcon className="w-3 h-3" />
                                      Renamed ({categories.renamed.length})
                                    </div>
                                    <div className="space-y-1 pl-5">
                                      {categories.renamed.map((file) => (
                                        <button
                                          key={file.filePath}
                                          onClick={() => {
                                            void navigate(
                                              `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                                            );
                                          }}
                                          className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
                                        >
                                          <div className="text-muted-foreground">
                                            {file.initialFilePath} →
                                          </div>
                                          <div className="font-medium">
                                            {file.filePath}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>,
                                );
                              }

                              if (categories.renamedAndModified.length > 0) {
                                sections.push(
                                  <div
                                    key="renamedAndModified"
                                    className="space-y-1"
                                  >
                                    <div className="flex items-center gap-2 text-xs font-medium text-orange-600">
                                      <UpdateIcon className="w-3 h-3" />
                                      <Pencil1Icon className="w-2.5 h-2.5" />
                                      Renamed & Modified (
                                      {categories.renamedAndModified.length})
                                    </div>
                                    <div className="space-y-1 pl-5">
                                      {categories.renamedAndModified.map(
                                        (file) => (
                                          <button
                                            key={file.filePath}
                                            onClick={() => {
                                              void navigate(
                                                `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                                              );
                                            }}
                                            className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
                                          >
                                            <div className="text-muted-foreground">
                                              {file.initialFilePath} →
                                            </div>
                                            <div className="font-medium">
                                              {file.filePath}
                                            </div>
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  </div>,
                                );
                              }

                              if (categories.deleted.length > 0) {
                                sections.push(
                                  <div key="deleted" className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-medium text-red-600">
                                      <TrashIcon className="w-3 h-3" />
                                      Deleted ({categories.deleted.length})
                                    </div>
                                    <div className="space-y-1 pl-5">
                                      {categories.deleted.map((file) => (
                                        <div
                                          key={file.filePath}
                                          className="block text-xs text-left p-1 rounded truncate w-full text-muted-foreground line-through"
                                        >
                                          {file.filePath}
                                        </div>
                                      ))}
                                    </div>
                                  </div>,
                                );
                              }

                              if (categories.new.length > 0) {
                                sections.push(
                                  <div key="new" className="space-y-1">
                                    <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                                      <PlusIcon className="w-3 h-3" />
                                      New ({categories.new.length})
                                    </div>
                                    <div className="space-y-1 pl-5">
                                      {categories.new.map((file) => (
                                        <button
                                          key={file.filePath}
                                          onClick={() => {
                                            void navigate(
                                              `/vault/${repositoryFullName}/${branch}/${file.filePath}`,
                                            );
                                          }}
                                          className={`block text-xs text-left hover:bg-muted/50 transition-colors p-1 rounded truncate w-full ${linkStyle}`}
                                        >
                                          {file.filePath}
                                        </button>
                                      ))}
                                    </div>
                                  </div>,
                                );
                              }

                              return sections;
                            })()}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleManualCommit()}
                    disabled={
                      manualComittingStatus === "loading" ||
                      clearingStagingStatus === "loading"
                    }
                    className="h-6 px-2 text-xs"
                  >
                    {manualComittingStatus === "loading"
                      ? "Committing..."
                      : "Commit Now"}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleResetToGitHub()}
                    disabled={
                      clearingStagingStatus === "loading" ||
                      manualComittingStatus === "loading"
                    }
                    className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                  >
                    {clearingStagingStatus === "loading"
                      ? "Resetting..."
                      : "Reset all to GitHub (Discard Changes)"}
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <CodeEditorWrapper
                  key={`${branch}/${selectedFile}-${stagedFile?.parentCommitSha}`}
                  repositoryFullName={repositoryFullName}
                  filePath={selectedFile}
                  initialFilePath={stagedFile.initialFilePath}
                  stagedFile={stagedFile}
                />
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
          folders={vault.treeData.tree.map((item) => ({
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
