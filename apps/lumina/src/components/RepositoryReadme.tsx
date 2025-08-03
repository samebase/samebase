import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Button } from "@/components/ui/button";

import {
  GitHubLogoIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
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
import { useState, useEffect, useCallback } from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import { base64ToUtf8 } from "@/lib/base64";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { linkStyle } from "./styles";
import { GetFunctionReferenceReturnType } from "@/lib/convexTypeUtils";

type RepositoryTree = GetFunctionReferenceReturnType<
  typeof api.github.getRepositoryTree
>;
// Function to find the best file to display
function findBestInitialFile(files: RepositoryTree) {
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

function RepositoryReadmeInner() {
  const {
    owner,
    repoName,
    "*": filePath,
  } = useParams<{
    owner: string;
    repoName: string;
    "*": string;
  }>();
  const navigate = useNavigate();

  // Get current user for sidebar
  const user = useQuery(api.users.viewer);

  // Parse branch and file path from the wildcard parameter
  const parsedPath = filePath ? filePath.split("/") : [];
  const branch = parsedPath[0] || "main";
  const actualFilePath = parsedPath.slice(1).join("/");
  const selectedFile = actualFilePath || undefined;
  const repositoryFullName = `${owner}/${repoName}`;

  // Get vault for this repository
  const vault = useQuery(
    api.vault.getVaultByRepository,
    owner && repoName ? { repositoryFullName } : "skip",
  );

  // Folder expansion state
  const folderExpansionStates = useQuery(
    api.folderExpansion.getFolderExpansionStates,
    vault ? { vaultId: vault._id } : "skip",
  );
  const setFolderExpansionState = useMutation(
    api.folderExpansion.setFolderExpansionState,
  );

  // Local state for immediate UI updates
  const [localContent, setLocalContent] = useState<string>("");
  const [lastLocalEditTime, setLastLocalEditTime] = useState<number>(0);

  const [isManualCommitting, setIsManualCommitting] = useState(false);
  const [isResettingToGitHub, setIsResettingToGitHub] = useState(false);

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Convex hooks for staging
  const saveToStaging = useMutation(api.fileStagingMutations.saveToStaging);
  const commitStaging = useMutation(api.fileStagingMutations.commitStaging);
  const resetStaging = useMutation(api.fileStagingMutations.resetStaging);
  const fileStatus = useQuery(
    api.fileStagingMutations.getFileStatus,
    selectedFile && vault
      ? { vaultId: vault._id, filePath: selectedFile }
      : "skip",
  );

  // Get count of staged files for this vault
  const stagedFiles = useQuery(
    api.fileStagingMutations.listStagedFiles,
    vault ? { vaultId: vault._id } : "skip",
  );

  const getFileContent = useAction(api.github.getFileContent);
  const createFile = useAction(api.github.createFile);
  const deleteFile = useAction(api.github.deleteFile);
  const getRepositoryTree = useAction(api.github.getRepositoryTree);

  // extract return type of api.github.getRepositoryTree
  // Fetch repository tree
  const tree = useReactQuery({
    queryKey: ["github-tree", owner, repoName],
    queryFn: async () => {
      if (!owner || !repoName) {
        throw new Error("Owner and repository name are required");
      }
      return await getRepositoryTree({ owner, repo: repoName });
    },
    enabled: !!(owner && repoName),
  });

  // Auto-redirect to best file when no file is selected
  useEffect(() => {
    if (
      !selectedFile &&
      (tree.data ?? []).length > 0 &&
      !tree.isLoading &&
      owner &&
      repoName
    ) {
      const bestFile = findBestInitialFile(tree.data ?? []);
      if (bestFile) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${bestFile}`, {
          replace: true,
        });
      }
    }
  }, [
    selectedFile,
    tree.data,
    tree.isLoading,
    owner,
    repoName,
    branch,
    navigate,
  ]);

  const ghFile = useReactQuery({
    queryKey: ["github-file", owner, repoName, selectedFile, branch],
    queryFn: async () => {
      if (!owner || !repoName || !selectedFile) {
        throw new Error("Owner, repository name, and file path are required");
      }
      return await getFileContent({
        owner,
        repo: repoName,
        path: selectedFile,
        ref: branch,
      });
    },
    enabled: !!(
      owner &&
      repoName &&
      selectedFile &&
      fileStatus?.hasStaging === false
    ),
  });

  // Determine current file content and metadata based on staging status
  const isFromStaging = fileStatus?.hasStaging === true;
  const remoteContent = fileStatus?.content || "";

  const currentSha = isFromStaging
    ? fileStatus.parentCommitSha
    : ghFile.data?.sha || "";

  // Debounced save to Convex staging
  const debouncedSaveToStaging = useCallback(
    async (content: string) => {
      if (!selectedFile || !vault) {
        return;
      }

      try {
        await saveToStaging({
          vaultId: vault._id,
          filePath: selectedFile,
          content,
          parentCommitSha: currentSha,
          branch,
        });
      } catch (error) {
        console.error("Failed to save to staging:", error);
      }
    },
    [saveToStaging, vault, selectedFile, currentSha, branch],
  );

  // load github file into staging, if there's no staging yet
  useEffect(() => {
    if (ghFile.data?.content && !fileStatus?.hasStaging) {
      const utf8 = base64ToUtf8(ghFile.data.content);
      void debouncedSaveToStaging(utf8);
    }
  }, [
    selectedFile,
    owner,
    repoName,
    ghFile.data?.content,
    fileStatus?.hasStaging,
    debouncedSaveToStaging,
  ]);

  // Initialize local content when file loads or changes
  useEffect(() => {
    if (remoteContent !== undefined) {
      // Only update local content if user hasn't been editing recently (1 second grace period)
      const timeSinceLastEdit = Date.now() - lastLocalEditTime;
      const hasRecentLocalEdits = timeSinceLastEdit < 1000;

      if (!hasRecentLocalEdits || localContent === "") {
        setLocalContent(remoteContent);
      }
    }
  }, [remoteContent, lastLocalEditTime, localContent]);

  // Reset local state when switching files
  useEffect(() => {
    setLocalContent("");
    setLastLocalEditTime(0);
  }, [selectedFile]);

  // Auto-save to Convex when content changes (debounced)
  useEffect(() => {
    if (!localContent || !selectedFile || !vault) return;

    // Only save if there have been recent edits (not just initial load)
    const timeSinceLastEdit = Date.now() - lastLocalEditTime;
    if (timeSinceLastEdit > 5000) return; // Don't save if last edit was more than 5 seconds ago

    const timeoutId = setTimeout(() => {
      void debouncedSaveToStaging(localContent);
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [
    localContent,
    selectedFile,
    vault,
    lastLocalEditTime,
    debouncedSaveToStaging,
  ]);

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
    }
  };

  const handleFileRename = async (oldPath: string, newPath: string) => {
    if (!owner || !repoName) return;

    try {
      // Get the file data for the file being renamed (from GitHub)
      const fileToRename = await getFileContent({
        owner,
        repo: repoName,
        path: oldPath,
        ref: branch,
      });

      if (!fileToRename) {
        console.error("File to rename not found");
        return;
      }

      const content =
        fileToRename.encoding === "base64"
          ? base64ToUtf8(fileToRename.content)
          : fileToRename.content;

      // Create new file with the same content
      await createFile({
        owner,
        repo: repoName,
        path: newPath,
        content,
        message: `Rename ${oldPath} to ${newPath}`,
        branch,
      });

      // Delete the old file
      await deleteFile({
        owner,
        repo: repoName,
        path: oldPath,
        message: `Rename ${oldPath} to ${newPath}`,
        sha: fileToRename.sha,
        branch,
      });

      // Refresh the tree
      void tree.refetch();

      // If we're currently viewing the renamed file, navigate to the new path
      if (selectedFile === oldPath) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${newPath}`);
      }
    } catch (error) {
      console.error("Failed to rename file:", error);
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
        void tree.refetch();
        // Navigate to the new file
        void navigate(`/vault/${owner}/${repoName}/${branch}/${filePath}`);
      })
      .catch((error) => {
        console.error("Failed to create file:", error);
      });
  };

  const handleManualCommit = async () => {
    if (!selectedFile || !vault) return;

    setIsManualCommitting(true);

    try {
      await commitStaging({
        vaultId: vault._id,
        filePath: selectedFile,
      });

      // Refetch the file to get updated data after commit
      void ghFile.refetch();
    } catch (error) {
      console.error("Failed to commit changes:", error);
    } finally {
      setIsManualCommitting(false);
    }
  };

  const handleResetToGitHub = async () => {
    if (!selectedFile || !vault || !owner || !repoName) return;

    setIsResettingToGitHub(true);

    try {
      // Clear staging first
      await resetStaging({
        vaultId: vault._id,
        filePath: selectedFile,
      });

      // Fetch latest content from GitHub
      const latestContent = await getFileContent({
        owner,
        repo: repoName,
        path: selectedFile,
        ref: branch,
      });

      if (latestContent?.content) {
        // Update local content to match GitHub
        const decodedContent = base64ToUtf8(latestContent.content);
        setLocalContent(decodedContent);
        setLastLocalEditTime(0); // Reset edit time
      }

      // Refetch queries to update UI state
      void ghFile.refetch();
    } catch (error) {
      console.error("Failed to reset to GitHub version:", error);
    } finally {
      setIsResettingToGitHub(false);
    }
  };

  const handleContentChange = (value: string) => {
    // Update local state immediately for responsive UI
    setLocalContent(value);
    setLastLocalEditTime(Date.now());
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

  // MARK: First returns

  if (!owner || !repoName) {
    void navigate("/");
  }

  // Assume this means it's loading
  if (vault === undefined) {
    return null;
  }

  const userPart = (
    <div className="p-3 border-b border-border/50">
      <Link to="/" className={`flex items-center justify-between ${linkStyle}`}>
        <UserMenu>{user?.name ?? user?.email ?? "..."}</UserMenu>
      </Link>
    </div>
  );

  const repoPart = (
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
      </div>
    </div>
  );

  // Show loading state while tree loads
  if (tree.isLoading) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="p-0">
            {userPart}
            {repoPart}

            <div className="p-3 text-xs text-muted-foreground">
              Loading repository...
            </div>
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="flex-1">
          <div className="flex h-full items-center justify-center">
            <div className="text-xs text-muted-foreground">
              Loading repository...
            </div>
          </div>
        </SidebarInset>
      </div>
    );
  }

  // Show no files message if repository is empty
  if (!tree.isLoading && (tree.data ?? []).length === 0) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="p-0">
            {userPart}
            {repoPart}
            <div className="p-3 text-xs text-muted-foreground">
              No files found
            </div>
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="flex-1">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 p-3 border-b border-border/50">
              <SidebarTrigger className="h-6 w-6" />
              <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                <Link to="/" className="flex items-center gap-2">
                  <ArrowLeftIcon className="h-3 w-3" />
                  <span className="text-xs">Back</span>
                </Link>
              </Button>
              <a className="text-sm font-medium">
                {owner}/{repoName}
              </a>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-sm font-medium mb-2">No files found</h2>
                <p className="text-xs text-muted-foreground">
                  This repository appears to be empty.
                </p>
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    );
  }

  const error = ghFile.error || tree.error;

  // MARK: Return

  return (
    <div className="flex h-screen w-full">
      <Sidebar variant="sidebar" className="border-r border-border/50">
        <SidebarContent className="p-0">
          {userPart}
          {repoPart}

          <div className="flex-1 overflow-auto">
            <FileTree
              items={(tree.data ?? []).map((item) => ({
                path: item.path,
                type: item.type as "tree" | "blob",
                size: item.size,
              }))}
              onFileSelect={handleFileSelect}
              onFileRename={(oldPath, newPath) =>
                void handleFileRename(oldPath, newPath)
              }
              onFileCreate={handleCreateFileInFolder}
              selectedFile={selectedFile}
              folderExpansionStates={folderExpansionStates ?? []}
              onFolderToggle={(folderPath, isExpanded) =>
                void handleFolderToggle(folderPath, isExpanded)
              }
            />
          </div>
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

          <div className="flex-1 overflow-auto p-0 md:p-4">
            {error && (
              <div className="mb-4 p-3 text-sm md:text-xs text-red-600 bg-red-50 rounded border border-red-200">
                Failed to load data:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </div>
            )}

            <div className="max-w-none h-full flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base md:text-sm font-medium mb-2">
                  {ghFile.data?.name || selectedFile}
                </h2>

                <div className="flex items-center gap-2">
                  {stagedFiles && stagedFiles.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className={`text-xs text-muted-foreground ${linkStyle}`}
                        >
                          {stagedFiles.length} file
                          {stagedFiles.length !== 1 ? "s" : ""} staged
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="end"
                        className="w-64 p-3"
                      >
                        <div className="space-y-2">
                          <div className="text-sm font-medium">
                            Staged files:
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {stagedFiles.map((file) => (
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
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleManualCommit()}
                    disabled={isManualCommitting || isResettingToGitHub}
                    className="h-6 px-2 text-xs"
                  >
                    {isManualCommitting ? "Committing..." : "Commit Now"}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleResetToGitHub()}
                    disabled={isResettingToGitHub || isManualCommitting}
                    className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                  >
                    {isResettingToGitHub ? "Resetting..." : "Reset to GitHub"}
                  </Button>
                </div>
              </div>

              {(localContent !== "" || selectedFile) && (
                <div className="flex-1 min-h-0">
                  <CodeEditor
                    value={localContent}
                    onChange={handleContentChange}
                    fileName={selectedFile}
                    className="h-full border border-border/50 rounded-md overflow-hidden"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Command Palette */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
        files={(tree.data ?? []).map((item) => ({
          path: item.path,
          type: item.type as "tree" | "blob",
          size: item.size,
        }))}
        onFileSelect={handleFileSelect}
        selectedFile={selectedFile}
      />
    </div>
  );
}

// Main export with sidebar provider wrapper
export function RepositoryReadme() {
  return (
    <SidebarProvider>
      <RepositoryReadmeWithSwipe />
    </SidebarProvider>
  );
}

// Component with sidebar context and swipe gesture
function RepositoryReadmeWithSwipe() {
  // Setup sidebar context and mobile swipe gesture
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  // Enable swipe-to-open sidebar on mobile
  useSwipeToOpenSidebar(() => {
    if (isMobile && !openMobile) {
      setOpenMobile(true);
    }
  });

  return <RepositoryReadmeInner />;
}
