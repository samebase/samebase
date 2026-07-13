import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { buildAccountDeletionConfirmationPhrase } from "../../shared/accountDeletionPhrase";
import { type AccountPresentation } from "../../shared/accountPresentation";
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
import { useRouter } from "@tanstack/react-router";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import {
  createAccountDeletionCompletionCapability,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";

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
  const deletionStakes = useQuery(
    api.accountDeletion.index.stakes,
    isDeleteDialogOpen ? {} : "skip",
  );
  const expectedConfirmationPhrase =
    deletionStakes === undefined ? null : buildAccountDeletionConfirmationPhrase(deletionStakes);

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
    if (isRequestingDeletion) {
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
      });
      if (result.state === "stakes_changed") {
        // The displayed phrase self-updates through the stakes subscription;
        // the stale input stops matching, so the confirm button re-disables.
        setDeletionError("The numbers changed. Review and confirm again.");
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
            setIsDeleteDialogOpen(open);
          }
        }}
      >
        <AppDialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your Samebase account and data. Nothing outside Samebase is
              deleted: your apps, GitHub repositories, Convex projects, and Cloudflare Workers keep
              running.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Any uncommitted file changes in Samebase will be permanently deleted. They will not be
              pushed to GitHub.
            </p>
            {settings.hasActiveSubscription ? (
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
                <p className="font-medium select-all">{expectedConfirmationPhrase}</p>
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
