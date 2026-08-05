import { useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { BillingResourceUsage } from "../../convex/billingResourceQuotas";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { useAppAuthActions } from "@/authClient";
import { AccountDeletionDialog } from "@/components/AccountDeletionDialog";
import { GitHubOwnerSelect } from "@/components/GitHubOwnerSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { readCurrentAuthTokenProfileClaims } from "@/lib/authTokenProfileJwt";
import { getCurrentRootRelativeUrl, openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { getRouteApi, useLocation, useRouter } from "@tanstack/react-router";
import {
  CHECKOUT_QUERY_PARAM,
  DELETE_ACCOUNT_QUERY_PARAM,
  POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM,
} from "@/routeSearch/settings";
import { readBrowserRouteEnvironment } from "@/routing/availability";
import { applySearchPatch } from "@/routing/searchFlags";

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

type BillingRequestState = "idle" | "checkout" | "portal";

const billingDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatBillingResourceUsage(usage: BillingResourceUsage["cloudflareWorkers"]) {
  const used = usage.used.state === "at_least" ? `${usage.used.count}+` : usage.used.count;
  return `${used} of ${usage.limit}`;
}

export function UserSettingsPage() {
  const router = useRouter();
  const navigate = settingsRouteApi.useNavigate();
  const search = settingsRouteApi.useSearch();
  const deleteDialogHistoryEntry = useLocation({
    select: (location) => location.state.settingsDeleteAccountDialog,
  });
  const settings = useQuery(api.users.getUserSettings);
  const githubOwners = useQuery(api.organizations.listForViewer);
  const [requestedOrganizationId, setSelectedOrganizationId] = useState<Id<"organizations"> | null>(
    null,
  );
  const selectedOwner =
    githubOwners?.length === 1
      ? githubOwners[0]
      : (githubOwners?.find((owner) => owner.organizationId === requestedOrganizationId) ?? null);
  const selectedOrganizationId = selectedOwner?.organizationId ?? null;
  const billingStatus = useQuery(
    api.billing.getViewerBillingStatus,
    selectedOrganizationId ? { organizationId: selectedOrganizationId } : "skip",
  );
  const billingUsage = useQuery(
    api.billingResourceQuotas.getViewerBillingResourceUsage,
    selectedOrganizationId ? { organizationId: selectedOrganizationId } : "skip",
  );
  const setDisplayName = useMutation(api.users.setDisplayName);
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const createCheckoutSession = useAction(api.billing.createPolarCheckoutSession);
  const createCustomerPortalSession = useAction(api.billing.createPolarCustomerPortalSession);
  const reconcileBilling = useAction(api.billing.reconcileViewerBillingFromPolar);
  const { signOut } = useAppAuthActions();
  const { fetchAccessToken } = useConvexAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<ProfileSaveState>({ kind: "idle" });
  const [sessionRefreshState, setSessionRefreshState] = useState<SessionRefreshState>({
    kind: "current",
  });
  const [billingRequestState, setBillingRequestState] = useState<BillingRequestState>("idle");
  const [billingReconciliationDelayed, setBillingReconciliationDelayed] = useState(false);
  const [githubAppSetupError, setGitHubAppSetupError] = useState<string | null>(null);
  const [isStartingGitHubAppSetup, setIsStartingGitHubAppSetup] = useState(false);
  const isDeleteDialogOpen = search[DELETE_ACCOUNT_QUERY_PARAM];
  const checkoutReturnState = search[CHECKOUT_QUERY_PARAM];
  const canManageBilling = selectedOwner?.role === "owner";
  const billingActionsAvailable = canManageBilling && readBrowserRouteEnvironment() !== "preview";
  const hasTrustedProBilling = billingStatus?.plan === "pro";

  // A successful return starts trusted provider reconciliation. The URL alone never grants Pro.
  useEffect(() => {
    if (
      checkoutReturnState !== "success" ||
      !billingActionsAvailable ||
      selectedOrganizationId === null
    ) {
      setBillingReconciliationDelayed(false);
      return;
    }

    setBillingReconciliationDelayed(false);

    const clearCheckoutReturn = () => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch) =>
          applySearchPatch(currentSearch, {
            [CHECKOUT_QUERY_PARAM]: null,
            [POLAR_CUSTOMER_SESSION_TOKEN_QUERY_PARAM]: null,
          }),
        to: ".",
      });
    };

    if (hasTrustedProBilling) {
      clearCheckoutReturn();
      return;
    }

    let active = true;
    const reconcileCheckoutReturn = async () => {
      try {
        const reconciled = await reconcileBilling({ organizationId: selectedOrganizationId });
        if (!active) {
          return;
        }
        if (reconciled.state === "observed" && reconciled.plan === "pro") {
          clearCheckoutReturn();
        } else {
          setBillingReconciliationDelayed(true);
        }
      } catch {
        if (active) {
          setBillingReconciliationDelayed(true);
        }
      }
    };

    void reconcileCheckoutReturn();

    return () => {
      active = false;
    };
  }, [
    billingActionsAvailable,
    checkoutReturnState,
    hasTrustedProBilling,
    navigate,
    reconcileBilling,
    selectedOrganizationId,
  ]);

  if (settings === undefined || githubOwners === undefined) {
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

  const buildSettingsBillingUrl = (checkout: "success" | "cancel" | null) => {
    const location = router.buildLocation({
      search: (currentSearch) =>
        applySearchPatch(currentSearch, { [CHECKOUT_QUERY_PARAM]: checkout }),
      to: "/settings",
    });
    return new URL(location.href, window.location.origin).toString();
  };

  const handleUpgrade = async () => {
    if (
      !billingActionsAvailable ||
      billingRequestState !== "idle" ||
      selectedOrganizationId === null
    ) {
      return;
    }

    setBillingRequestState("checkout");
    try {
      const session = await createCheckoutSession({
        organizationId: selectedOrganizationId,
        returnUrl: buildSettingsBillingUrl("cancel"),
        successUrl: buildSettingsBillingUrl("success"),
      });
      window.location.assign(session.url);
    } catch (error) {
      toast({
        description: readErrorMessage(error, "Please try again."),
        title: "Could not open checkout",
        variant: "destructive",
      });
      setBillingRequestState("idle");
    }
  };

  const handleManageSubscription = async () => {
    if (
      !billingActionsAvailable ||
      billingRequestState !== "idle" ||
      selectedOrganizationId === null
    ) {
      return;
    }

    setBillingRequestState("portal");
    try {
      const session = await createCustomerPortalSession({
        organizationId: selectedOrganizationId,
        returnUrl: buildSettingsBillingUrl(null),
      });
      window.location.assign(session.url);
    } catch (error) {
      toast({
        description: readErrorMessage(error, "Please try again."),
        title: "Could not open subscription settings",
        variant: "destructive",
      });
      setBillingRequestState("idle");
    }
  };

  const handleInstallGitHubApp = async () => {
    if (isStartingGitHubAppSetup) return;
    setGitHubAppSetupError(null);
    setIsStartingGitHubAppSetup(true);
    try {
      await openGitHubAppSetupPopup(async () => {
        return await getGitHubAppInstallationUrl({
          returnToPath: getCurrentRootRelativeUrl(),
        });
      });
    } catch (error) {
      setGitHubAppSetupError(readErrorMessage(error, "Could not open GitHub App setup."));
    } finally {
      setIsStartingGitHubAppSetup(false);
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

  return (
    <main data-testid="user-settings-page" className="container mx-auto w-full max-w-2xl py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Settings</h1>
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

      <section className="mt-8 border-t pt-6" aria-labelledby="settings-billing-heading">
        <h2 id="settings-billing-heading" className="text-base font-semibold">
          Billing
        </h2>
        {githubOwners.length === 0 ? (
          <div className="mt-4">
            <Button
              disabled={isStartingGitHubAppSetup}
              onClick={() => void handleInstallGitHubApp()}
              type="button"
            >
              {isStartingGitHubAppSetup ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Opening...
                </>
              ) : (
                "Install GitHub App"
              )}
            </Button>
            {githubAppSetupError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {githubAppSetupError}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {githubOwners.length > 1 ? (
              <div className="mt-4 max-w-xs">
                <GitHubOwnerSelect
                  disabled={billingRequestState !== "idle"}
                  onChange={(owner) => {
                    setSelectedOrganizationId(owner.organizationId);
                    setBillingReconciliationDelayed(false);
                  }}
                  owners={githubOwners}
                  selectedOrganizationId={selectedOrganizationId}
                />
              </div>
            ) : null}
            {billingStatus !== undefined && billingUsage !== undefined ? (
              <>
                <dl className="mt-4 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm font-medium">Current plan</dt>
                    <dd className="text-sm text-muted-foreground">
                      {billingStatus.plan === "pro" ? "Pro" : "Free"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm font-medium">Cloudflare Workers</dt>
                    <dd className="text-sm text-muted-foreground">
                      {formatBillingResourceUsage(billingUsage.cloudflareWorkers)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm font-medium">Convex projects</dt>
                    <dd className="text-sm text-muted-foreground">
                      {formatBillingResourceUsage(billingUsage.convexProjects)}
                    </dd>
                  </div>
                  {billingStatus.plan === "pro" &&
                  billingStatus.currentPeriodEndAt !== undefined ? (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-sm font-medium">
                        {billingStatus.cancelAtPeriodEnd
                          ? "Access ends"
                          : billingStatus.status === "past_due"
                            ? "Billing period end"
                            : "Next billing date"}
                      </dt>
                      <dd className="text-sm text-muted-foreground">
                        <time dateTime={new Date(billingStatus.currentPeriodEndAt).toISOString()}>
                          {billingDateFormatter.format(billingStatus.currentPeriodEndAt)}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {billingStatus.status === "past_due" ? (
                  <p className="mt-4 text-sm text-destructive" role="alert">
                    Payment needs attention. Manage your subscription to update the payment method.
                  </p>
                ) : checkoutReturnState === "cancel" ? (
                  <p className="mt-4 text-sm text-muted-foreground" role="status">
                    Checkout canceled. Your plan did not change.
                  </p>
                ) : checkoutReturnState === "success" ? (
                  billingActionsAvailable ? (
                    billingStatus.plan === "pro" ? (
                      <p className="mt-4 text-sm text-muted-foreground" role="status">
                        Your Pro plan is active.
                      </p>
                    ) : billingReconciliationDelayed ? (
                      <p className="mt-4 text-sm text-muted-foreground" role="status">
                        Plan confirmation is delayed. Refresh this page to check again.
                      </p>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground" role="status">
                        Checking your payment and plan...
                      </p>
                    )
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground" role="status">
                      Checkout confirmation is disabled in this preview.
                    </p>
                  )
                ) : null}

                {canManageBilling &&
                (billingStatus.plan === "pro" || billingStatus.canStartCheckout) ? (
                  <div className="mt-6">
                    {billingStatus.plan === "pro" ? (
                      <Button
                        type="button"
                        disabled={!billingActionsAvailable || billingRequestState !== "idle"}
                        onClick={() => void handleManageSubscription()}
                      >
                        {billingRequestState === "portal" ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          "Manage subscription"
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={!billingActionsAvailable || billingRequestState !== "idle"}
                        onClick={() => void handleUpgrade()}
                      >
                        {billingRequestState === "checkout" ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          "Upgrade to Pro, $4/month"
                        )}
                      </Button>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
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
