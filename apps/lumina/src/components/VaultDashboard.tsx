import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  GitHubLogoIcon,
  PlusIcon,
  FileTextIcon,
  ClockIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { useMutation } from "convex/react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function VaultDashboard() {
  const vaults = useQuery(api.vault.getUserVaults);
  const removeVault = useMutation(api.vault.removeVault);
  const [vaultToDelete, setVaultToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleRemoveVault = async () => {
    if (!vaultToDelete) return;

    try {
      await removeVault({ vaultId: vaultToDelete.id as any });
      setVaultToDelete(null);
    } catch (error) {
      console.error("Failed to remove vault:", error);
    }
  };

  if (!vaults) {
    return null;
  }

  if (vaults.length === 0) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center space-y-6">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">
              Connect your first GitHub repository
            </h1>
            <p className="text-lg text-muted-foreground">
              Once connected, you'll be able to edit files directly in your
              browser and collaborate with others in real-time.
            </p>
          </div>

          <Button size="lg" className="px-8 py-6 text-lg" asChild>
            <Link to="/add">
              <PlusIcon className="h-5 w-5 mr-2" />
              Connect Your First Repository
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-semibold">Your Vaults</h1>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/add">
            <PlusIcon className="h-4 w-4 mr-2" />
            <span className="sm:inline">Connect Repository</span>
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {vaults.map((vault) => (
          <div
            key={vault._id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Link
              to={`/vault/${vault.repositoryFullName}`}
              className={"flex items-center gap-4 flex-1 min-w-0"}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-col items-start ">
                  <span
                    className={`text-sm text-muted-foreground ${linkStyle}`}
                  >
                    {vault.ghRepoOwner}/
                  </span>

                  <h3 className="font-semibold truncate">
                    <span className={`flex items-center gap-1 ${linkStyle}`}>
                      {vault.ghRepoName}
                    </span>
                  </h3>
                </div>
              </div>

              <div className="flex flex-col items-end text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <FileTextIcon className="h-3 w-3" />
                  <span>
                    {vault.fileCount} edited file
                    {vault.fileCount !== 1 ? "s" : ""}
                  </span>
                </div>

                <div
                  className={clsx("flex items-center gap-1", {
                    invisible: !vault.lastEditTime,
                  })}
                >
                  <ClockIcon className="h-3 w-3" />
                  <span>
                    {vault.lastEditTime
                      ? formatTimeAgo(vault.lastEditTime)
                      : "0m ago"}
                  </span>
                </div>
              </div>
            </Link>

            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setVaultToDelete({
                  id: vault._id,
                  name: vault.repositoryFullName,
                });
              }}
              className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!vaultToDelete}
        onOpenChange={() => setVaultToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Vault</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the vault for{" "}
              <strong>{vaultToDelete?.name}</strong>? This action cannot be
              undone and will permanently delete all staged files and edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVaultToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleRemoveVault().catch(console.error);
              }}
            >
              Remove Vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
