import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CodeEditor } from "@/components/CodeEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  GitHubLogoIcon,
  ArrowLeftIcon,
  PlusIcon,
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
import { useState, useEffect, useCallback, useRef } from "react";
import { useSwipeToOpenSidebar } from "@/hooks/use-touch-gestures";
import { useSidebar } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import { base64ToUtf8 } from "@/lib/base64";

const COMMIT_COUNTDOWN = 20;
const SAVE_DEBOUNCE_MS = 300; // Debounce saves to avoid too many mutations

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

  // Folder expansion state
  const folderExpansionStates = useQuery(
    api.folderExpansion.getFolderExpansionStates,
    owner && repoName ? { repositoryFullName } : "skip",
  );
  const setFolderExpansionState = useMutation(
    api.folderExpansion.setFolderExpansionState,
  );

  // Local state for immediate UI updates
  const [localContent, setLocalContent] = useState<string>("");
  const [lastLocalEditTime, setLastLocalEditTime] = useState<number>(0);

  // Visual countdown state (for UX, actual commit happens on server)
  const [countdown, setCountdown] = useState<number>(0);
  const [isManualCommitting, setIsManualCommitting] = useState(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // New file dialog state
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Convex hooks for staging
  const saveToStaging = useMutation(api.fileStagingMutations.saveToStaging);
  const commitStaging = useMutation(api.fileStagingMutations.commitStaging);
  const fileStatus = useQuery(
    api.fileStagingMutations.getFileStatus,
    selectedFile && owner && repoName
      ? { repositoryFullName, filePath: selectedFile }
      : "skip",
  );

  const getFileContent = useAction(api.github.getFileContent);
  const createFile = useAction(api.github.createFile);
  const deleteFile = useAction(api.github.deleteFile);
  const getRepositoryTree = useAction(api.github.getRepositoryTree);

  // Fetch repository tree
  const {
    data: treeData = [],
    isLoading: isLoadingTree,
    error: treeError,
    refetch: refetchTree,
  } = useReactQuery({
    queryKey: ["github-tree", owner, repoName],
    queryFn: async () => {
      if (!owner || !repoName) {
        throw new Error("Owner and repository name are required");
      }
      return await getRepositoryTree({ owner, repo: repoName });
    },
    enabled: !!(owner && repoName),
  });

  // Function to find the best file to display
  const findBestFile = useCallback((files: typeof treeData) => {
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
  }, []);

  // Auto-redirect to best file when no file is selected
  useEffect(() => {
    if (
      !selectedFile &&
      treeData.length > 0 &&
      !isLoadingTree &&
      owner &&
      repoName
    ) {
      const bestFile = findBestFile(treeData);
      if (bestFile) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${bestFile}`, {
          replace: true,
        });
      }
    }
  }, [
    selectedFile,
    treeData,
    isLoadingTree,
    owner,
    repoName,
    branch,
    findBestFile,
    navigate,
  ]);

  // Fetch file from GitHub if not in staging
  const {
    data: githubFileData,
    isLoading: isLoadingFile,
    error: fileError,
    refetch: refetchFile,
  } = useReactQuery({
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

  // load github file into staging
  useEffect(() => {
    if (githubFileData?.content && !fileStatus?.hasStaging) {
      void debouncedSaveToStaging(githubFileData.content);
    }
  }, [selectedFile, owner, repoName]);

  // Determine current file content and metadata based on staging status
  const isFromStaging = fileStatus?.hasStaging === true;
  const remoteContent = fileStatus?.content || "";
  // const remoteContent = isFromStaging
  //   ? fileStatus.content
  //   : githubFileData?.content
  //     ? githubFileData.encoding === "base64"
  //       ? base64ToUtf8(githubFileData.content)
  //       : githubFileData.content
  //     : "";

  const currentSha = isFromStaging
    ? fileStatus.parentCommitSha
    : githubFileData?.sha || "";

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
    setCountdown(0);

    // Clear all timers
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, [selectedFile]);

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
      void refetchTree();

      // If we're currently viewing the renamed file, navigate to the new path
      if (selectedFile === oldPath) {
        void navigate(`/vault/${owner}/${repoName}/${branch}/${newPath}`);
      }
    } catch (error) {
      console.error("Failed to rename file:", error);
    }
  };

  const handleCreateFile = async (folderPath?: string) => {
    const fileName = folderPath ? newFileName.trim() : newFileName.trim();
    const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;

    if (!fileName || !owner || !repoName) return;

    setIsCreatingFile(true);
    try {
      await createFile({
        owner,
        repo: repoName,
        path: filePath,
        content: "",
        message: `Create ${filePath}`,
        branch,
      });

      // Refresh the tree
      void refetchTree();

      // Navigate to the new file
      void navigate(`/vault/${owner}/${repoName}/${branch}/${filePath}`);

      // Reset dialog state
      setNewFileName("");
      setIsNewFileDialogOpen(false);
    } catch (error) {
      console.error("Failed to create file:", error);
    } finally {
      setIsCreatingFile(false);
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
        void refetchTree();
        // Navigate to the new file
        void navigate(`/vault/${owner}/${repoName}/${branch}/${filePath}`);
      })
      .catch((error) => {
        console.error("Failed to create file:", error);
      });
  };

  const handleCreateFileKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleCreateFile();
    }
  };

  // Visual countdown for UX (actual commit happens on server)
  const startVisualCountdown = useCallback(() => {
    // Clear existing timer
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Start countdown from COMMIT_COUNTDOWN seconds
    setCountdown(COMMIT_COUNTDOWN);

    // Update countdown every second
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Clear interval when countdown reaches 0
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleManualSave = async () => {
    console.log("Manual save triggered");
    if (selectedFile && localContent !== remoteContent && owner && repoName) {
      await saveToStaging({
        repositoryFullName,
        filePath: selectedFile,
        content: localContent,
        parentCommitSha: currentSha,
        branch: "main",
      });
    }
  };

  const handleManualCommit = async () => {
    if (!selectedFile || !owner || !repoName) return;

    setIsManualCommitting(true);
    setCountdown(0); // Stop countdown

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    try {
      await commitStaging({
        repositoryFullName,
        filePath: selectedFile,
      });

      // Refetch the file to get updated data after commit
      void refetchFile();
    } catch (error) {
      console.error("Failed to commit changes:", error);
    } finally {
      setIsManualCommitting(false);
    }
  };

  // Debounced save to Convex staging
  const debouncedSaveToStaging = useCallback(
    async (content: string) => {
      if (!selectedFile || !owner || !repoName) {
        return;
      }

      try {
        console.log("debouncedSaveToStaging", { content });
        await saveToStaging({
          repositoryFullName,
          filePath: selectedFile,
          content,
          parentCommitSha: currentSha,
          branch,
        });

        // Start visual countdown after successful save
        startVisualCountdown();
      } catch (error) {
        console.error("Failed to save to staging:", error);
      }
    },
    [
      saveToStaging,
      repositoryFullName,
      selectedFile,
      currentSha,
      branch,
      owner,
      repoName,
      startVisualCountdown,
    ],
  );

  const handleContentChange = (value: string) => {
    // Update local state immediately for responsive UI
    setLocalContent(value);
    setLastLocalEditTime(Date.now());

    // Clear existing save timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save to Convex
    saveTimeoutRef.current = setTimeout(() => {
      void debouncedSaveToStaging(value);
    }, SAVE_DEBOUNCE_MS);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleFolderToggle = async (
    folderPath: string,
    isExpanded: boolean,
  ) => {
    if (owner && repoName) {
      await setFolderExpansionState({
        repositoryFullName,
        folderPath,
        isExpanded,
      });
    }
  };

  if (!owner || !repoName) {
    return (
      <div className="container py-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Repository Not Found</h1>
          <p className="text-muted-foreground">
            Invalid repository parameters. Please check the URL.
          </p>
          <Button asChild className="mt-4">
            <Link to="/">Go Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state while tree loads
  if (isLoadingTree) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="p-0">
            {/* User profile section */}
            <div className="p-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                {user ? (
                  <UserMenu>{user?.name ?? user?.email}</UserMenu>
                ) : (
                  <div className="h-8" />
                )}
              </div>
            </div>

            <div className="p-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
                <div className="text-xs font-medium truncate text-muted-foreground">
                  {owner}/{repoName}
                </div>
              </div>
            </div>
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
  if (!isLoadingTree && treeData.length === 0) {
    return (
      <div className="flex h-screen w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="p-0">
            <div className="p-3 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
                <div className="text-xs font-medium truncate text-muted-foreground">
                  {owner}/{repoName}
                </div>
              </div>
              <Dialog
                open={isNewFileDialogOpen}
                onOpenChange={setIsNewFileDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <PlusIcon className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New File</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="filename.md"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={handleCreateFileKeyDown}
                      className="text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsNewFileDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleCreateFile()}
                        disabled={!newFileName.trim() || isCreatingFile}
                      >
                        {isCreatingFile ? "Creating..." : "Create"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
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
              <h1 className="text-sm font-medium">
                {owner}/{repoName}
              </h1>
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

  const error = fileError || treeError;

  return (
    <div className="flex h-screen w-full">
      <Sidebar variant="sidebar" className="border-r border-border/50">
        <SidebarContent className="p-0">
          {/* User profile section */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              {user ? (
                <UserMenu>{user?.name ?? user?.email}</UserMenu>
              ) : (
                <div className="h-8" />
              )}
            </div>
          </div>

          {/* Repository header */}
          <div className="p-3 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
              <div className="text-xs font-medium truncate text-muted-foreground">
                {owner}/{repoName}
                {isFromStaging && <span className="ml-1 text-blue-600">•</span>}
              </div>
            </div>
            <Dialog
              open={isNewFileDialogOpen}
              onOpenChange={setIsNewFileDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <PlusIcon className="h-3 w-3" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New File</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="filename.md"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={handleCreateFileKeyDown}
                    className="text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsNewFileDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void handleCreateFile()}
                      disabled={!newFileName.trim() || isCreatingFile}
                    >
                      {isCreatingFile ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex-1 overflow-auto">
            <FileTree
              items={treeData.map((item) => ({
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
              repositoryFullName={repositoryFullName}
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
                  {isFromStaging && (
                    <span className="text-sm md:text-xs text-blue-600">
                      (live)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Auto-commit status and actions */}
            {false && (
              <div className="flex items-center gap-2">
                {/* Auto-commit status */}
                {isFromStaging && localContent !== remoteContent && (
                  <div className="flex items-center gap-2 text-sm md:text-xs">
                    {countdown > 0 && (
                      <span className="text-muted-foreground">
                        Auto-commit in {countdown}s
                      </span>
                    )}
                    {countdown === 0 && !isManualCommitting && (
                      <span className="text-blue-600">Committing...</span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleManualSave()}
                    disabled={localContent === remoteContent || !selectedFile}
                    className="h-8 md:h-7"
                  >
                    Save
                  </Button>
                )}

                {false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleManualCommit()}
                    disabled={!isFromStaging || isManualCommitting}
                    className="h-8 md:h-7"
                  >
                    {isManualCommitting ? "Committing..." : "Commit Now"}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-0 md:p-4">
            {error && (
              <div className="mb-4 p-3 text-sm md:text-xs text-red-600 bg-red-50 rounded border border-red-200">
                Failed to load data:{" "}
                {error instanceof Error ? error.message : "Unknown error"}
              </div>
            )}

            <div className="max-w-none h-full flex flex-col">
              <div className="mb-4">
                <h2 className="text-base md:text-sm font-medium mb-2">
                  {githubFileData?.name || selectedFile}
                </h2>
              </div>

              {isLoadingFile && !isFromStaging && localContent === "" && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-sm md:text-xs text-muted-foreground">
                    Loading file...
                  </div>
                </div>
              )}

              {isFromStaging &&
                localContent !== remoteContent &&
                countdown === 0 &&
                !isManualCommitting && (
                  <div className="mb-4 p-3 text-sm md:text-xs text-blue-600 bg-blue-50 rounded border border-blue-200">
                    Auto-committing changes...
                  </div>
                )}

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
        files={treeData.map((item) => ({
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
