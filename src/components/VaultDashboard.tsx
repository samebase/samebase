import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  GitHubLogoIcon,
  PlusIcon,
  FileTextIcon,
  ClockIcon,
} from "@radix-ui/react-icons";
import { GitHubRepositories } from "./GitHubRepositories";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";

export function VaultDashboard() {
  const [showRepositorySelector, setShowRepositorySelector] = useState(false);
  const vaults = useQuery(api.vault.getUserVaults);

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  if (showRepositorySelector) {
    return (
      <div className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-6 w-6" />
            <h1 className="text-2xl font-semibold">Connect a Repository</h1>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowRepositorySelector(false)}
          >
            Back to Vaults
          </Button>
        </div>
        <GitHubRepositories
          onRepositoryConnected={() => {
            setShowRepositorySelector(false);
          }}
          showHeader={false}
          compact={true}
          connectedVaults={vaults || []}
        />
      </div>
    );
  }

  if (!vaults) {
    return (
      <div className="container py-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading your vaults...</div>
        </div>
      </div>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center space-y-6">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Welcome to Your Vault</h1>
            <p className="text-lg text-muted-foreground">
              Get started by connecting your first GitHub repository
            </p>
            <p className="text-sm text-muted-foreground">
              Once connected, you'll be able to edit files directly in your
              browser and collaborate with others in real-time.
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => setShowRepositorySelector(true)}
            className="px-8 py-6 text-lg"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Connect Your First Repository
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Your Vaults</h1>
        </div>
        <Button onClick={() => setShowRepositorySelector(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Connect Repository
        </Button>
      </div>

      <div className="space-y-2">
        {vaults.map((vault) => (
          <div
            key={vault._id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">
                    <Link
                      to={`/vault/${vault.repositoryFullName}`}
                      className={`flex items-center gap-1 ${linkStyle}`}
                    >
                      {vault.ghRepoName}
                    </Link>
                  </h3>
                  <a
                    href={`https://github.com/${vault.repositoryFullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm text-muted-foreground ${linkStyle}`}
                  >
                    {vault.repositoryFullName}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <FileTextIcon className="h-3 w-3" />
                  <span>
                    {vault.fileCount} edited file
                    {vault.fileCount !== 1 ? "s" : ""}
                  </span>
                </div>
                {vault.lastEditTime && (
                  <div className="flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    <span>{formatTimeAgo(vault.lastEditTime)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
