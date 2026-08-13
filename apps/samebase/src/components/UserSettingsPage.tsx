import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { useAppAuthActions, useAppSignInActions } from "@/authClient";
import { AccountDeletionDialog } from "@/components/AccountDeletionDialog";
import {
  BETA_ACCESS_PENDING_HEADING,
  BetaAccessPendingDescription,
} from "@/components/BetaAccessPendingDescription";
import { McpClientsSettingsSection } from "@/components/McpClientsSettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { readCurrentAuthTokenProfileClaims } from "@/lib/authTokenProfileJwt";
import { getRouteApi, useLocation, useRouter } from "@tanstack/react-router";
import { DELETE_ACCOUNT_QUERY_PARAM } from "@/routeSearch/settings";
import { applySearchPatch } from "@/routing/searchFlags";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { GOOGLE_AUTH_UI_ENABLED } from "@/lib/authMethodAvailability";

const settingsRouteApi = getRouteApi("/settings");

type ProfileSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saveFailed"; message: string };

type SessionRefreshState =
  | { kind: "current" }
  | { kind: "refreshing" }
  | { kind: "stale"; expectedPresentation: AccountPresentation; message: string };

type AuthAccountLinkRequestState = "idle" | "google" | "github";

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function UserSettingsPage({ authorizationNotice }: { authorizationNotice: ReactNode }) {
  const router = useRouter();
  const navigate = settingsRouteApi.useNavigate();
  const search = settingsRouteApi.useSearch();
  const deleteDialogHistoryEntry = useLocation({
    select: (location) => location.state.settingsDeleteAccountDialog,
  });
  const settings = useQuery(api.users.getUserSettings);
  const viewerAccess = useQuery(api.users.currentViewerAccess);
  const setDisplayName = useMutation(api.users.setDisplayName);
  const beginAuthAccountLink = useMutation(api.users.beginAuthAccountLink);
  const { signOut } = useAppAuthActions();
  const { signInWithOAuth } = useAppSignInActions();
  const { fetchAccessToken } = useConvexAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<ProfileSaveState>({ kind: "idle" });
  const [sessionRefreshState, setSessionRefreshState] = useState<SessionRefreshState>({
    kind: "current",
  });
  const [authAccountLinkRequestState, setAuthAccountLinkRequestState] =
    useState<AuthAccountLinkRequestState>("idle");
  const isDeleteDialogOpen = search[DELETE_ACCOUNT_QUERY_PARAM];

  useEffect(() => {
    const resetRestoredAccountLinkRequest = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setAuthAccountLinkRequestState("idle");
      }
    };

    window.addEventListener("pageshow", resetRestoredAccountLinkRequest);
    return () => {
      window.removeEventListener("pageshow", resetRestoredAccountLinkRequest);
    };
  }, []);

  if (settings === undefined || viewerAccess === undefined) {
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

  const connectAuthAccount = async (provider: "google" | "github") => {
    if (authAccountLinkRequestState !== "idle") {
      return;
    }
    const returnToPath = getCurrentRootRelativeUrl();
    setAuthAccountLinkRequestState(provider);
    try {
      await beginAuthAccountLink({ provider });
      await signInWithOAuth(provider, returnToPath);
    } catch (error) {
      toast({
        description: readErrorMessage(error, `Could not connect ${provider}.`),
        title: `Could not connect ${provider === "github" ? "GitHub" : "Google"}`,
        variant: "destructive",
      });
      setAuthAccountLinkRequestState("idle");
    }
  };

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

  const openDeleteDialog = () => {
    void navigate({
      resetScroll: false,
      search: (currentSearch) =>
        applySearchPatch(currentSearch, { [DELETE_ACCOUNT_QUERY_PARAM]: true }),
      state: (currentState) => ({
        ...currentState,
        settingsDeleteAccountDialog: true,
      }),
      to: ".",
    });
  };

  const closeDeleteDialog = () => {
    if (deleteDialogHistoryEntry && router.history.canGoBack()) {
      router.history.back();
      return;
    }

    void navigate({
      replace: true,
      resetScroll: false,
      search: (currentSearch) =>
        applySearchPatch(currentSearch, { [DELETE_ACCOUNT_QUERY_PARAM]: null }),
      state: (currentState) => ({
        ...currentState,
        settingsDeleteAccountDialog: undefined,
      }),
      to: ".",
    });
  };

  const pending = saveState.kind === "saving" || sessionRefreshState.kind === "refreshing";

  return (
    <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Account settings</h1>
        <Button type="button" variant="outline" disabled={isSigningOut} onClick={handleSignOut}>
          {isSigningOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {isSigningOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
      {authorizationNotice ? <div className="mt-4">{authorizationNotice}</div> : null}
      {viewerAccess.role === "role_pending_access" ? (
        <section className="mt-6 max-w-lg" aria-labelledby="settings-beta-access-heading">
          <h2 id="settings-beta-access-heading" className="text-base font-semibold">
            {BETA_ACCESS_PENDING_HEADING}
          </h2>
          <div className="mt-2">
            <BetaAccessPendingDescription
              accountIdentity={settings.displayName ?? settings.accountEmail}
            />
          </div>
        </section>
      ) : null}

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

      <section
        id="sign-in-methods"
        className="mt-8 border-t pt-6"
        aria-labelledby="settings-sign-in-methods-heading"
      >
        <h2 id="settings-sign-in-methods-heading" className="text-base font-semibold">
          Sign-in methods
        </h2>
        <dl className="mt-4 space-y-4">
          {GOOGLE_AUTH_UI_ENABLED ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <dt className="text-sm font-medium">Google</dt>
                <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {settings.signInMethods.google?.email ?? "Not connected"}
                </dd>
              </div>
              {settings.signInMethods.google === null ? (
                <Button
                  disabled={authAccountLinkRequestState !== "idle"}
                  onClick={() => void connectAuthAccount("google")}
                  type="button"
                  variant="outline"
                >
                  {authAccountLinkRequestState === "google" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {authAccountLinkRequestState === "google" ? "Connecting..." : "Connect Google"}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <dt className="text-sm font-medium">GitHub</dt>
              <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {settings.signInMethods.github
                  ? `@${settings.signInMethods.github.login}`
                  : "Not connected"}
              </dd>
            </div>
            {settings.signInMethods.github === null ? (
              <Button
                disabled={authAccountLinkRequestState !== "idle"}
                onClick={() => void connectAuthAccount("github")}
                type="button"
                variant="outline"
              >
                {authAccountLinkRequestState === "github" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {authAccountLinkRequestState === "github" ? "Connecting..." : "Connect GitHub"}
              </Button>
            ) : null}
          </div>
          {settings.signInMethods.password ? (
            <div>
              <dt className="text-sm font-medium">Password</dt>
              <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {settings.signInMethods.password.email}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <McpClientsSettingsSection />

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="text-base font-semibold">
          Account
        </h2>
        <dl className="mt-4 space-y-1">
          <dt className="text-sm font-medium">Account email</dt>
          <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {settings.accountEmail}
          </dd>
        </dl>
        <div className="mt-6">
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleteDialogOpen}
            onClick={openDeleteDialog}
          >
            Delete account
          </Button>
        </div>
      </section>

      {isDeleteDialogOpen ? <AccountDeletionDialog onClose={closeDeleteDialog} /> : null}
    </main>
  );
}
