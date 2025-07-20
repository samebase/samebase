import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { GitHubLogoIcon, ArrowLeftIcon } from "@radix-ui/react-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { FileTree } from "./FileTree";

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

  const getReadme = useAction(api.github.getReadme);
  const getFileContent = useAction(api.github.getFileContent);
  const getRepositoryTree = useAction(api.github.getRepositoryTree);

  // Fetch README (default view)
  const {
    data: readmeData,
    isLoading: isLoadingReadme,
    error: readmeError,
  } = useReactQuery({
    queryKey: ["github-readme", owner, repoName],
    queryFn: async () => {
      if (!owner || !repoName) {
        throw new Error("Owner and repository name are required");
      }
      return await getReadme({ owner, repo: repoName });
    },
    enabled: !!(owner && repoName && !selectedFile),
  });

  // Fetch selected file content
  const {
    data: fileData,
    isLoading: isLoadingFile,
    error: fileError,
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
    enabled: !!(owner && repoName && selectedFile),
  });

  // Fetch repository tree
  const {
    data: treeData = [],
    isLoading: isLoadingTree,
    error: treeError,
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

  const handleFileSelect = (path: string) => {
    if (owner && repoName) {
      void navigate(`/vault/${owner}/${repoName}/${branch}/${path}`);
    }
  };

  const handleShowReadme = () => {
    if (owner && repoName) {
      void navigate(`/vault/${owner}/${repoName}`);
    }
  };

  // Determine what content to show and decode it
  const isShowingFile = !!selectedFile;
  const currentData = isShowingFile ? fileData : readmeData;
  const isLoading = isShowingFile ? isLoadingFile : isLoadingReadme;
  const contentError = isShowingFile ? fileError : readmeError;

  const decodedContent = currentData?.content
    ? currentData.encoding === "base64"
      ? atob(currentData.content)
      : currentData.content
    : "";

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

  const error = contentError || treeError;

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

            <div className="flex-1 overflow-auto">
              {isLoadingTree ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Loading...
                </div>
              ) : (
                <FileTree
                  items={treeData.map((item) => ({
                    path: item.path,
                    type: item.type as "tree" | "blob",
                    size: item.size,
                  }))}
                  onFileSelect={handleFileSelect}
                  selectedFile={selectedFile}
                />
              )}
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
                  </>
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
                    {isShowingFile
                      ? `${currentData?.name || selectedFile}`
                      : `README${readmeData?.name ? ` (${readmeData.name})` : ""}`}
                  </h2>
                  {!isShowingFile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={handleShowReadme}
                    >
                      Show README
                    </Button>
                  )}
                </div>

                {isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-xs text-muted-foreground">
                      Loading {isShowingFile ? "file" : "README"}...
                    </div>
                  </div>
                )}

                {!isLoading && !contentError && (
                  <Textarea
                    value={decodedContent}
                    readOnly
                    className="min-h-[600px] font-mono text-xs border border-border/50 shadow-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-background"
                    placeholder={
                      decodedContent === ""
                        ? `No ${isShowingFile ? "file" : "README"} content found`
                        : undefined
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
