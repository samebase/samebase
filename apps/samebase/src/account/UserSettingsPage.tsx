import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useAppAuthActions } from "@/authClient";
import { AccountDeletionDialog } from "@/account/AccountDeletionDialog";
import { McpClientsSettingsSection } from "@/account/McpClientsSettingsSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { getRouteApi, Link, useLocation, useRouter } from "@tanstack/react-router";
import { DELETE_ACCOUNT_QUERY_PARAM } from "@/routeSearch/settings";
import { applySearchPatch } from "@/routing/searchFlags";
import { GOOGLE_AUTH_UI_ENABLED } from "@/lib/authMethodAvailability";

const settingsRouteApi = getRouteApi("/settings");

type ProfileSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saveFailed"; message: string };

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

export function UserSettingsPage() {
  const viewerAccess = useQuery(api.users.currentViewerAccess, {});
  const exitActionsOnly =
    viewerAccess?.role === "role_pending_access" || viewerAccess?.role === "role_terms_pending";
  const router = useRouter();
  const navigate = settingsRouteApi.useNavigate();
  const search = settingsRouteApi.useSearch();
  const deleteDialogHistoryEntry = useLocation({
    select: (location) => location.state.settingsDeleteAccountDialog,
  });
  const settings = useQuery(
    api.users.getUserSettings,
    viewerAccess === undefined || exitActionsOnly ? "skip" : {},
  );
  const sessionRecordingConsent = useQuery(
    api.users.getSessionRecordingConsent,
    viewerAccess === undefined || exitActionsOnly ? "skip" : {},
  );
  const productUpdateEmailConsent = useQuery(
    api.users.getProductUpdateEmailConsent,
    viewerAccess === undefined || exitActionsOnly ? "skip" : {},
  );
  const setDisplayName = useMutation(api.users.setDisplayName);
  const setProductUpdateEmailConsent = useMutation(api.users.setProductUpdateEmailConsent);
  const setSessionRecordingConsent = useMutation(api.users.setSessionRecordingConsent);
  const { signOut } = useAppAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<ProfileSaveState>({ kind: "idle" });
  const [isSavingSessionRecordingConsent, setIsSavingSessionRecordingConsent] = useState(false);
  const [sessionRecordingConsentError, setSessionRecordingConsentError] = useState<string | null>(
    null,
  );
  const [isSavingProductUpdateEmailConsent, setIsSavingProductUpdateEmailConsent] = useState(false);
  const [productUpdateEmailConsentError, setProductUpdateEmailConsentError] = useState<
    string | null
  >(null);
  const isDeleteDialogOpen = search[DELETE_ACCOUNT_QUERY_PARAM];

  if (viewerAccess === undefined) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saveState.kind === "saving") {
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
      setSaveState({ kind: "saved" });
    } catch (error) {
      setSaveState({
        kind: "saveFailed",
        message: readErrorMessage(error, "Could not save the display name."),
      });
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

  const saveSessionRecordingConsent = async (decision: "granted" | "denied") => {
    if (isSavingSessionRecordingConsent) {
      return;
    }

    setIsSavingSessionRecordingConsent(true);
    setSessionRecordingConsentError(null);
    try {
      await setSessionRecordingConsent({ decision });
    } catch {
      setSessionRecordingConsentError("Could not save this choice.");
    } finally {
      setIsSavingSessionRecordingConsent(false);
    }
  };

  const saveProductUpdateEmailConsent = async (decision: "granted" | "denied") => {
    if (isSavingProductUpdateEmailConsent) {
      return;
    }

    setIsSavingProductUpdateEmailConsent(true);
    setProductUpdateEmailConsentError(null);
    try {
      await setProductUpdateEmailConsent({ decision, source: "account_settings" });
    } catch {
      setProductUpdateEmailConsentError("Could not save this email choice.");
    } finally {
      setIsSavingProductUpdateEmailConsent(false);
    }
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

  const accountSettingsHeader = (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold @2xl:text-2xl">Account settings</h1>
      <Button type="button" variant="outline" disabled={isSigningOut} onClick={handleSignOut}>
        {isSigningOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {isSigningOut ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
  const deleteAccountButton = (
    <Button
      type="button"
      variant="destructive"
      disabled={isDeleteDialogOpen}
      onClick={openDeleteDialog}
    >
      Delete account
    </Button>
  );

  if (exitActionsOnly) {
    return (
      <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
        {accountSettingsHeader}
        <div className="mt-8 border-t pt-6">{deleteAccountButton}</div>
        {isDeleteDialogOpen ? <AccountDeletionDialog onClose={closeDeleteDialog} /> : null}
      </main>
    );
  }

  if (settings === undefined) {
    return null;
  }

  const pending = saveState.kind === "saving";

  return (
    <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
      {accountSettingsHeader}

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
            {saveState.kind === "saved" ? (
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
            <div>
              <dt className="text-sm font-medium">Google</dt>
              <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {settings.signInMethods.google?.email ?? "Not connected"}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm font-medium">GitHub</dt>
            <dd className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {settings.signInMethods.github
                ? `@${settings.signInMethods.github.login}`
                : "Not connected"}
            </dd>
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

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-privacy-heading">
        <h2 id="settings-privacy-heading" className="text-base font-semibold">
          Privacy
        </h2>
        <div className="mt-4 flex max-w-lg items-start gap-3">
          <Checkbox
            aria-describedby="settings-session-recording-description"
            checked={sessionRecordingConsent?.state === "granted"}
            disabled={sessionRecordingConsent === undefined || isSavingSessionRecordingConsent}
            id="settings-session-recording"
            onCheckedChange={(checked) =>
              void saveSessionRecordingConsent(checked === true ? "granted" : "denied")
            }
          />
          <div>
            <Label htmlFor="settings-session-recording">Help improve Samebase</Label>
            <p
              className="mt-1 text-sm leading-6 text-muted-foreground"
              id="settings-session-recording-description"
            >
              Share recordings of how you use Samebase. Inputs and code stay hidden.
            </p>
            <Link className="mt-2 inline-block text-sm underline" to="/privacy">
              What gets recorded
            </Link>
          </div>
        </div>
        {sessionRecordingConsentError === null ? null : (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {sessionRecordingConsentError}
          </p>
        )}
      </section>

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-email-heading">
        <h2 id="settings-email-heading" className="text-base font-semibold">
          Email
        </h2>
        <div className="mt-4 flex max-w-lg items-start gap-3">
          <Checkbox
            checked={productUpdateEmailConsent?.state === "granted"}
            disabled={productUpdateEmailConsent === undefined || isSavingProductUpdateEmailConsent}
            id="settings-product-update-emails"
            onCheckedChange={(checked) =>
              void saveProductUpdateEmailConsent(checked === true ? "granted" : "denied")
            }
          />
          <Label htmlFor="settings-product-update-emails">Product updates</Label>
        </div>
        {productUpdateEmailConsentError === null ? null : (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {productUpdateEmailConsentError}
          </p>
        )}
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
        <div className="mt-6">{deleteAccountButton}</div>
      </section>

      {isDeleteDialogOpen ? <AccountDeletionDialog onClose={closeDeleteDialog} /> : null}
    </main>
  );
}
