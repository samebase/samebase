import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import {
  ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
  buildAccountDeletionConfirmationPhrase,
  serializeAccountDeletionConfirmationStakes,
} from "../../shared/accountDeletionPhrase";
import { tryParseRepositoryFullName } from "../../shared/repoName";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import {
  createAccountDeletionCompletionCapability,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";
import { buildVaultFileRoute } from "@/lib/vaultRoutes";
import { buildFileViewRouteSearch, buildFileViewSearchHref } from "@/routeSearch/fileView";
import { DELETE_ACCOUNT_QUERY_PARAM } from "@/routeSearch/settings";
import { applySearchPatch } from "@/routing/searchFlags";

const settingsRouteApi = getRouteApi("/settings");

function buildAccountDeletionReviewHref(
  repositoryFullName: string,
  branch: string,
  search: Record<string, unknown>,
) {
  const repository = tryParseRepositoryFullName(repositoryFullName);
  if (repository === null) {
    return null;
  }

  return buildFileViewSearchHref({
    pathname: buildVaultFileRoute({
      owner: repository.owner,
      repoName: repository.name,
      branch,
    }),
    search: applySearchPatch(search, { [DELETE_ACCOUNT_QUERY_PARAM]: null }),
    fileViewSearch: buildFileViewRouteSearch({ diff: true, compare: true }),
  });
}

export function AccountDeletionDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const search = settingsRouteApi.useSearch();
  const requestAccountDeletion = useMutation(api.accountDeletion.index.request);
  const deletionStakes = useQuery(api.accountDeletion.index.stakes, {});
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const expectedConfirmationPhrase =
    deletionStakes === undefined ? null : buildAccountDeletionConfirmationPhrase(deletionStakes);
  const confirmationStakesSnapshot =
    deletionStakes === undefined
      ? null
      : serializeAccountDeletionConfirmationStakes(deletionStakes);

  const handleDeleteAccount = async () => {
    if (isRequestingDeletion || confirmationStakesSnapshot === null) {
      return;
    }

    setIsRequestingDeletion(true);
    setDeletionError(null);

    const completionCapability =
      readAccountDeletionBrowserMarker()?.completionCapability ??
      createAccountDeletionCompletionCapability();

    if (completionCapability === null || !writeAccountDeletionBrowserMarker(completionCapability)) {
      setDeletionError("Could not start account deletion. Please try again.");
      setIsRequestingDeletion(false);
      return;
    }

    try {
      const result = await requestAccountDeletion({
        completionCapability,
        confirmationPhrase: confirmationInput,
        confirmationStakesSnapshot,
      });

      if (result.state === "stakes_changed") {
        setConfirmationInput("");
        setDeletionError("The account data changed. Review and confirm again.");
        setIsRequestingDeletion(false);
        return;
      }

      writeAccountDeletionBrowserMarker(result.status.completionCapability);
      void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
    } catch {
      // A transport failure cannot prove the atomic request did not commit.
      // Keep the prewritten capability so the browser can still find that run.
      setDeletionError("Could not start account deletion. Please try again.");
      setIsRequestingDeletion(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isRequestingDeletion) {
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription className="space-y-2 text-foreground">
            <span className="block font-medium">
              This permanently deletes your Samebase account and data.
            </span>
            <span className="block text-muted-foreground">
              Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex projects,
              and Cloudflare Workers keep running.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {deletionStakes === undefined ||
          deletionStakes.uncommittedFileChangeCount === 0 ? null : (
            <div className="space-y-3">
              <p>
                <strong>
                  {deletionStakes.uncommittedFileChangeCount === "more_than_cap"
                    ? `More than ${ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP} uncommitted file changes`
                    : `${deletionStakes.uncommittedFileChangeCount} uncommitted file ${deletionStakes.uncommittedFileChangeCount === 1 ? "change" : "changes"}`}
                </strong>{" "}
                will be permanently deleted.{" "}
                {deletionStakes.uncommittedFileChangeCount === 1 ? "It" : "They"} will not be pushed
                to GitHub.
              </p>
              {deletionStakes.affectedVaults.state === "complete" &&
              deletionStakes.affectedVaults.vaults.length > 0 ? (
                <div className="max-h-40 space-y-3 overflow-y-auto pr-1">
                  {deletionStakes.affectedVaults.vaults.map((vault) => (
                    <div key={vault.vaultId}>
                      <p className="font-medium [overflow-wrap:anywhere]">
                        {vault.repositoryFullName}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {vault.branches.map((branch) => {
                          const reviewHref = buildAccountDeletionReviewHref(
                            vault.repositoryFullName,
                            branch.branch,
                            search,
                          );

                          return (
                            <li
                              key={branch.branch}
                              className="flex items-baseline justify-between gap-3"
                            >
                              <span className="min-w-0 break-words text-muted-foreground">
                                {branch.branch} · {branch.uncommittedFileChangeCount}{" "}
                                {branch.uncommittedFileChangeCount === 1 ? "file" : "files"}
                              </span>
                              {reviewHref === null ? null : (
                                <a
                                  href={reviewHref}
                                  onClick={(event) => {
                                    if (
                                      event.button !== 0 ||
                                      event.metaKey ||
                                      event.ctrlKey ||
                                      event.shiftKey ||
                                      event.altKey
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();
                                    void router.navigate({ href: reviewHref });
                                  }}
                                  aria-label={`Review changes in ${vault.repositoryFullName} on ${branch.branch}`}
                                  className="shrink-0 underline underline-offset-4 hover:text-blue-600"
                                >
                                  Review changes
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <Link to="/vault" className="underline underline-offset-4 hover:text-blue-600">
                  Review changes
                </Link>
              )}
            </div>
          )}
          {deletionStakes?.hasActiveSubscription ? (
            <p>
              Your Samebase subscription will be canceled immediately. Unused time is not
              automatically refunded.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="settings-delete-account-confirmation">Type the phrase to confirm</Label>
            {expectedConfirmationPhrase === null ? null : (
              <code className="block cursor-text select-all bg-muted px-3 py-2 font-mono text-sm leading-6 [overflow-wrap:anywhere]">
                {expectedConfirmationPhrase}
              </code>
            )}
            <Input
              id="settings-delete-account-confirmation"
              value={confirmationInput}
              autoComplete="off"
              disabled={isRequestingDeletion}
              onChange={(event) => setConfirmationInput(event.target.value)}
            />
          </div>
          {deletionError === null ? null : (
            <p className="text-destructive" role="alert">
              {deletionError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isRequestingDeletion} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              isRequestingDeletion ||
              expectedConfirmationPhrase === null ||
              confirmationInput !== expectedConfirmationPhrase
            }
            onClick={() => void handleDeleteAccount()}
          >
            {isRequestingDeletion ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete account"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
