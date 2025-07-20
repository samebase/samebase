import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { GitHubLogoIcon, ArrowLeftIcon, PlusIcon } from "@radix-ui/react-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { FileTree } from "./FileTree";
import { useState, useEffect, useCallback, useRef } from "react";

const COMMIT_COUNTDOWN = 20;
const SAVE_DEBOUNCE_MS = 300; // Debounce saves to avoid too many mutations

export function RepositoryReadme() {
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

  // Parse branch and file path from the wildcard parameter
  const parsedPath = filePath ? filePath.split("/") : [];
  const branch = parsedPath[0] || "main";
  const actualFilePath = parsedPath.slice(1).join("/");
  const selectedFile = actualFilePath || undefined;
  const repositoryId = `${owner}/${repoName}`;

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

  // Convex hooks for staging
  const saveToStaging = useMutation(api.fileStagingMutations.saveToStaging);
  const commitStaging = useMutation(api.fileStagingMutations.commitStaging);
  const stagedFile = useQuery(
    api.fileStagingMutations.getStagedFile,
    selectedFile && owner && repoName
      ? { repositoryId, filePath: selectedFile }
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
    enabled: !!(owner && repoName && selectedFile && !stagedFile),
  });

  // Determine current file content and metadata
  const currentFileData = stagedFile || githubFileData;
  const isFromStaging = !!stagedFile;

  const remoteContent = currentFileData?.content
    ? currentFileData.encoding === "base64"
      ? atob(currentFileData.content)
      : currentFileData.content
    : "";

  const currentSha = isFromStaging
    ? stagedFile.parentCommitSha
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
          ? atob(fileToRename.content)
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

  const handleCreateFile = async () => {
    if (!newFileName.trim() || !owner || !repoName) return;

    setIsCreatingFile(true);
    try {
      await createFile({
        owner,
        repo: repoName,
        path: newFileName.trim(),
        content: "",
        message: `Create ${newFileName.trim()}`,
        branch,
      });

      // Refresh the tree
      void refetchTree();

      // Navigate to the new file
      void navigate(
        `/vault/${owner}/${repoName}/${branch}/${newFileName.trim()}`,
      );

      // Reset dialog state
      setNewFileName("");
      setIsNewFileDialogOpen(false);
    } catch (error) {
      console.error("Failed to create file:", error);
    } finally {
      setIsCreatingFile(false);
    }
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
        repositoryId,
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
        await saveToStaging({
          repositoryId,
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
      repositoryId,
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
      <SidebarProvider>
        <div className="flex h-screen w-full">
          <Sidebar variant="sidebar" className="border-r border-border/50">
            <SidebarContent className="p-0">
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
      </SidebarProvider>
    );
  }

  // Show no files message if repository is empty
  if (!isLoadingTree && treeData.length === 0) {
    return (
      <SidebarProvider>
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
      </SidebarProvider>
    );
  }

  const error = fileError || treeError;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar variant="sidebar" className="border-r border-border/50">
          <SidebarContent className="p-0">
            <div className="p-3 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
                <div className="text-xs font-medium truncate text-muted-foreground">
                  {owner}/{repoName}
                  {isFromStaging && (
                    <span className="ml-1 text-blue-600">•</span>
                  )}
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
                selectedFile={selectedFile}
              />
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
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-medium">
                  {owner}/{repoName}
                </h1>
                {selectedFile && (
                  <>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedFile}
                    </span>
                    {isFromStaging && (
                      <span className="text-xs text-blue-600">(live)</span>
                    )}
                  </>
                )}
              </div>

              {/* Auto-commit status */}
              <div className="ml-auto flex items-center gap-2">
                {countdown > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground bg-muted/50 hover:bg-muted/70"
                    onClick={() => void handleManualCommit()}
                    disabled={isManualCommitting}
                  >
                    {isManualCommitting
                      ? "Committing..."
                      : `Auto-commit in ${countdown}s (click to commit now)`}
                  </Button>
                )}
                {isManualCommitting && (
                  <div className="text-xs text-muted-foreground bg-blue-50 px-2 py-1 rounded">
                    Committing...
                  </div>
                )}
                {localContent !== remoteContent &&
                  countdown === 0 &&
                  !isManualCommitting && (
                    <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      Changes saved
                    </div>
                  )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {error && (
                <div className="mb-4 p-3 text-xs text-red-600 bg-red-50 rounded border border-red-200">
                  Failed to load data:{" "}
                  {error instanceof Error ? error.message : "Unknown error"}
                </div>
              )}

              <div className="max-w-none">
                <div className="mb-4">
                  <h2 className="text-sm font-medium mb-2">
                    {currentFileData?.name || selectedFile}
                  </h2>
                </div>

                {isLoadingFile && !stagedFile && localContent === "" && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-xs text-muted-foreground">
                      Loading file...
                    </div>
                  </div>
                )}

                {(localContent !== "" || selectedFile) && (
                  <Textarea
                    value={localContent}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="min-h-[600px] font-mono text-xs border border-border/50 shadow-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background"
                    placeholder={
                      localContent === "" ? "No file content found" : undefined
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
