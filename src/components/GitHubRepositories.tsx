import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import {
  GitHubLogoIcon,
  ExternalLinkIcon,
  StarIcon,
} from "@radix-ui/react-icons";

type Repository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description?: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  language?: string;
  stargazers_count: number;
  forks_count: number;
};

export function GitHubRepositories() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRepositories = useAction(api.github.listRepositories);

  const fetchRepositories = async () => {
    setLoading(true);
    setError(null);
    try {
      const repos = await listRepositories({});
      setRepositories(repos);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch repositories",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Your GitHub Repositories</h1>
        </div>
        <Button onClick={fetchRepositories} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {loading && repositories.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading repositories...</div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {repositories.map((repo) => (
            <Card key={repo.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold truncate">
                      {repo.name}
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      {repo.full_name}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
                    {repo.private && (
                      <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs">
                        Private
                      </span>
                    )}
                    {repo.fork && (
                      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
                        Fork
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {repo.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {repo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {repo.language && (
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span>{repo.language}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <StarIcon className="h-3 w-3" />
                      <span>{repo.stargazers_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{repo.forks_count}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Updated {formatDate(repo.updated_at)}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                      >
                        <ExternalLinkIcon className="h-3 w-3" />
                        View
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {repositories.length === 0 && !loading && !error && (
        <div className="text-center py-8">
          <div className="text-muted-foreground">No repositories found</div>
        </div>
      )}
    </div>
  );
}
