import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saveFailed"; message: string };

type SessionRefreshState =
  | { kind: "current" }
  | { kind: "refreshing" }
  | { kind: "stale"; message: string };

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function UserSettingsPage() {
  const settings = useQuery(api.users.getUserSettings);
  const setDisplayName = useMutation(api.users.setDisplayName);
  const { fetchAccessToken } = useConvexAuth();
  const [saveState, setSaveState] = useState<ProfileSaveState>({ kind: "idle" });
  const [sessionRefreshState, setSessionRefreshState] = useState<SessionRefreshState>({
    kind: "current",
  });

  if (settings === undefined) {
    return null;
  }

  const refreshSession = async () => {
    const token = await fetchAccessToken({ forceRefreshToken: true });
    if (token === null) {
      throw new Error("The session refresh did not return a token.");
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
    try {
      await setDisplayName({
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
      await refreshSession();
      setSessionRefreshState({ kind: "current" });
      setSaveState({ kind: "saved" });
    } catch (error) {
      setSaveState({ kind: "saved" });
      setSessionRefreshState({
        kind: "stale",
        message: readErrorMessage(
          error,
          "The display name was saved, but the session refresh failed.",
        ),
      });
    }
  };

  const handleRetryRefresh = async () => {
    if (sessionRefreshState.kind !== "stale") {
      return;
    }
    setSessionRefreshState({ kind: "refreshing" });
    try {
      await refreshSession();
      setSessionRefreshState({ kind: "current" });
    } catch (error) {
      setSessionRefreshState({
        kind: "stale",
        message: readErrorMessage(error, "The session refresh failed."),
      });
    }
  };

  const pending = saveState.kind === "saving" || sessionRefreshState.kind === "refreshing";

  return (
    <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
      <h1 className="text-xl font-semibold sm:text-2xl">Settings</h1>

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
                disabled={sessionRefreshState.kind === "refreshing"}
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
      </section>
    </main>
  );
}
