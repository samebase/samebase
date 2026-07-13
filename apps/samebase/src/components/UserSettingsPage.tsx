import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import {
  ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
  buildAccountDeletionConfirmationPhrase,
  serializeAccountDeletionConfirmationStakes,
} from "../../shared/accountDeletionPhrase";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { tryParseRepositoryFullName } from "../../shared/repoName";
import { useAppAuthActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { readCurrentAuthTokenProfileClaims } from "@/lib/authTokenProfileJwt";
import { AppDialogContent } from "@/components/AppDialogContent";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useRouter } from "@tanstack/react-router";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import {
  createAccountDeletionCompletionCapability,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";
import { buildVaultFileRoute } from "@/lib/vaultRoutes";
import { buildFileViewRouteSearch, buildFileViewSearchHref } from "@/routeSearch/fileView";

type AccountDeletionStakes = (typeof api.accountDeletion.index.stakes)["_returnType"];

type ProfileSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saveFailed"; message: string };

type SessionRefreshState =
  | { kind: "current" }
  | { kind: "refreshing" }
  | { kind: "stale"; expectedPresentation: AccountPresentation; message: string };

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildAccountDeletionReviewHref(repositoryFullName: string, branch: string) {
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
    search: {},
    fileViewSearch: buildFileViewRouteSearch({ diff: true, compare: true }),
  });
}

export function UserSettingsPage() {
  const router = useRouter();
  const settings = useQuery(api.users.getUserSettings);
  const setDisplayName = useMutation(api.users.setDisplayName);
  const requestAccountDeletion = useMutation(api.accountDeletion.index.request);
  const router = useRouter();
  const { signOut } = useAppAuthActions();
  const { fetchAccessToken } = useConvexAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<ProfileSaveState>({ kind: "idle" });
  const [sessionRefreshState, setSessionRefreshState] = useState<SessionRefreshState>({
    kind: "current",
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [requestStakesOverride, setRequestStakesOverride] = useState<{
    previousStakes: string;
    stakes: AccountDeletionStakes;
  } | null>(null);
  const subscribedDeletionStakes = useQuery(
    api.accountDeletion.index.stakes,
    isDeleteDialogOpen ? {} : "skip",
  );
  const subscribedStakes =
    subscribedDeletionStakes === undefined
      ? null
      : serializeAccountDeletionConfirmationStakes(subscribedDeletionStakes);
  const deletionStakes =
    requestStakesOverride !== null &&
    (subscribedStakes === null || subscribedStakes === requestStakesOverride.previousStakes)
      ? requestStakesOverride.stakes
      : subscribedDeletionStakes;
  const expectedConfirmationPhrase =
    deletionStakes === undefined ? null : buildAccountDeletionConfirmationPhrase(deletionStakes);
  const confirmationStakesSnapshot =
    deletionStakes === undefined
      ? null
      : serializeAccountDeletionConfirmationStakes(deletionStakes);

  useEffect(() => {
    // A mutation can return newer stakes before the live query subscription updates.
    // Keep that response visible until the subscription moves past the rejected snapshot.
    if (
      requestStakesOverride !== null &&
      subscribedStakes !== null &&
      subscribedStakes !== requestStakesOverride.previousStakes
    ) {
      setRequestStakesOverride(null);
    }
  }, [requestStakesOverride, subscribedStakes]);

  if (settings === undefined) {
    return null;
  }

  const refreshSession = async (expectedPresentation: AccountPresentation) => {
    const token = await fetchAccessToken({ forceRefreshToken: true });

    if (token === null) {
      throw new Error("The session refresh did not return a token.");
    }

    const profile = readCurrentAuthTokenProfileClaims(token);

    if (
      profile === null ||
      profile.accountPresentation.kind !== expectedPresentation.kind ||
      profile.accountPresentation.label !== expectedPresentation.label
    ) {
      throw new Error("The refreshed session does not include the saved account label.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saveState.kind === "saving" || sessionRefreshState.kind === "refreshing") {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const displayNameEntry = formData.get("displayName");

    if (typeof displayNameEntry !== "string") {
      setSaveState({ kind: "saveFailed", message: "Display name is missing." });
      return;
    }

    setSaveState({ kind: "saving" });
    let committedPresentation: AccountPresentation;
    try {
      committedPresentation = await setDisplayName({
        displayName: displayNameEntry.trim() ? displayNameEntry : null,
      });
    } catch (error) {
      setSaveState({
        kind: "saveFailed",
        message: readErrorMessage(error, "Could not save the display name."),
      });
      return;
    }

    try {
      setSessionRefreshState({ kind: "refreshing" });
      await refreshSession(committedPresentation);
      setSessionRefreshState({ kind: "current" });
      setSaveState({ kind: "saved" });
    } catch (error) {
      setSaveState({ kind: "saved" });
      setSessionRefreshState({
        kind: "stale",
        expectedPresentation: committedPresentation,
        message: readErrorMessage(
          error,
          "The display name was saved, but the session refresh failed.",
        ),
      });
    }
  };

  const handleRetryRefresh = async () => {
    if (saveState.kind === "saving" || sessionRefreshState.kind !== "stale") {
      return;
    }
    const expectedPresentation = sessionRefreshState.expectedPresentation;
    setSessionRefreshState({ kind: "refreshing" });
    try {
      await refreshSession(expectedPresentation);
      setSessionRefreshState({ kind: "current" });
    } catch (error) {
      setSessionRefreshState({
        kind: "stale",
        expectedPresentation,
        message: readErrorMessage(error, "The session refresh failed."),
      });
    }
  };

  const pending = saveState.kind === "saving" || sessionRefreshState.kind === "refreshing";

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    void signOut()
      .then(() => {
        void router.navigate({ href: "/", replace: true, state: true });
      })
      .catch((error: unknown) => {
        toast({
          description: readErrorMessage(error, "Please try again."),
          title: "Could not sign out",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsSigningOut(false);
      });
  };

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
        setRequestStakesOverride({
          previousStakes: confirmationStakesSnapshot,
          stakes: result,
        });
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
    <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>
        <Button type="button" variant="outline" disabled={isSigningOut} onClick={handleSignOut}>
          {isSigningOut ? (
            <>
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              Signing out...
            </>
          ) : (
            "Sign out"
          )}
        </Button>
      </div>

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-profile-heading">
        <h2 id="settings-profile-heading" className="text-base font-semibold">
          Profile
        </h2>
        <form className="mt-4 max-w-lg space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="settings-display-name">Display name</Label>
            <Input
              id="settings-display-name"
              name="displayName"
              defaultValue={settings.displayName ?? ""}
              disabled={pending}
              autoComplete="nickname"
              onChange={() => {
                if (!pending) {
                  setSaveState({ kind: "idle" });
                }
              }}
            />
            <p className="text-sm text-muted-foreground">
              Shown in Samebase instead of your email.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {saveState.kind === "saving" ? "Saving..." : "Save"}
            </Button>
            {saveState.kind === "saved" && sessionRefreshState.kind === "current" ? (
              <p className="text-sm text-muted-foreground" role="status">
                Saved
              </p>
            ) : null}
          </div>
          {saveState.kind === "saveFailed" ? (
            <p className="text-sm text-destructive" role="alert">
              {saveState.message}
            </p>
          ) : null}
          {sessionRefreshState.kind === "stale" || sessionRefreshState.kind === "refreshing" ? (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm text-destructive">
                {sessionRefreshState.kind === "stale"
                  ? sessionRefreshState.message
                  : "Refreshing this session..."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void handleRetryRefresh()}
              >
                {sessionRefreshState.kind === "refreshing" ? "Refreshing..." : "Retry"}
              </Button>
            </div>
          ) : null}
        </form>
      </section>

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="text-base font-semibold">
          Account
        </h2>
        <dl className="mt-4 space-y-1">
          <dt className="text-sm font-medium">Sign-in email</dt>
          <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {settings.signInEmail}
          </dd>
        </dl>
        <div className="mt-6">
          <Button
            type="button"
            variant="destructive"
            disabled={isRequestingDeletion}
            onClick={() => {
              setDeletionError(null);
              setConfirmationInput("");
              setRequestStakesOverride(null);
              setIsDeleteDialogOpen(true);
            }}
          >
            {isRequestingDeletion ? "Deleting..." : "Delete account"}
          </Button>
        </div>
      </section>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isRequestingDeletion) {
            if (!open) {
              setRequestStakesOverride(null);
            }
            setIsDeleteDialogOpen(open);
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
                Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex
                projects, and Cloudflare Workers keep running.
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
                  {deletionStakes.uncommittedFileChangeCount === 1 ? "It" : "They"} will not be
                  pushed to GitHub.
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
                                  <Link
                                    to={reviewHref}
                                    aria-label={`Review changes in ${vault.repositoryFullName} on ${branch.branch}`}
                                    className="shrink-0 underline underline-offset-4 hover:text-blue-600"
                                  >
                                    Review changes
                                  </Link>
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
              <Label htmlFor="settings-delete-account-confirmation">
                Type the phrase to confirm
              </Label>
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
            <Button
              type="button"
              variant="outline"
              disabled={isRequestingDeletion}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
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
    </main>
  );
}
