import { useParams, Link } from "react-router-dom";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitHubLogoIcon, ArrowLeftIcon } from "@radix-ui/react-icons";

export function RepositoryReadme() {
  const { owner, repoName } = useParams<{
    owner: string;
    repoName: string;
  }>();

  const getReadme = useAction(api.github.getReadme);

  const {
    data: readmeData,
    isLoading,
    error,
  } = useReactQuery({
    queryKey: ["github-readme", owner, repoName],
    queryFn: async () => {
      if (!owner || !repoName) {
        throw new Error("Owner and repository name are required");
      }
      return await getReadme({ owner, repo: repoName });
    },
    enabled: !!(owner && repoName),
  });

  // Decode the README content from base64
  const readmeContent = readmeData?.content
    ? readmeData.encoding === "base64"
      ? atob(readmeData.content)
      : readmeData.content
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

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/" className="flex items-center gap-2">
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">
              {owner}/{repoName}
            </h1>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            README{readmeData?.name ? ` (${readmeData.name})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading README...</div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
              Failed to load README:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </div>
          )}

          {!isLoading && !error && (
            <Textarea
              value={readmeContent}
              readOnly
              className="min-h-[500px] font-mono text-sm"
              placeholder={
                readmeContent === ""
                  ? "No README found for this repository"
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
