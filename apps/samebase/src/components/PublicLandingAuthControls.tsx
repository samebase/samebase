import { useAppSignInActions } from "@/authClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GOOGLE_AUTH_UI_ENABLED } from "@/lib/authMethodAvailability";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { useOAuthSignInRejection } from "@/lib/oauthSignInRejection";
import {
  getVisiblePasswordAuthSurface,
  shouldRenderOAuthReturnNotice,
  type PasswordAuthSurface,
} from "@/lib/publicLandingAuthState";
import {
  buildPathWithoutProdUiQuery,
  isProductionPublicOrigin,
  isProdUiModeActive,
  isProdUiModeEnabled,
  shouldStripVisibleProdUiQuery,
} from "@/lib/prodUiMode";
import { readRootRouteSearch, readSignInNextHref } from "@/routeSearch/root";
import { rootQueries } from "@/routes/root.queries";
import { SignInWithOAuth } from "@/SignInWithOAuth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
import { isOrganizationInvitationPath } from "@/organization/organizationInvitationRoute";

function readLocalWorktreePasswordCredentials(): {
  email: string;
  password: string;
} | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  const email = import.meta.env.VITE_LOCAL_WORKTREE_PASSWORD_EMAIL?.trim();
  const password = import.meta.env.VITE_LOCAL_WORKTREE_PASSWORD_VALUE;
  if (!email || !password) {
    return null;
  }
  return { email, password };
}

function usePublicLandingPasswordAuthControls(): {
  passwordAuthSurface: PasswordAuthSurface;
} {
  const location = useLocation({
    select: (currentLocation) => ({
      searchStr: currentLocation.searchStr,
    }),
  });
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const prodUiQueryEnabled = isProdUiModeEnabled(rootRouteSearch);
  const productionPublicOrigin = isProductionPublicOrigin();
  // The root loader fetched the policy for a server render without a session.
  const { data: deploymentAuthPolicy } = useQuery(rootQueries.deploymentAuthPolicy);
  const deploymentProfile = deploymentAuthPolicy?.deploymentProfile;
  const prodUiModeEnabled = isProdUiModeActive({
    deploymentProfile,
    productionPublicOrigin,
    search: rootRouteSearch,
  });
  const passwordAuthMode =
    deploymentAuthPolicy?.passwordAuthMode ??
    (readLocalWorktreePasswordCredentials() ? "local_worktree_seed" : "off");
  const passwordAuthSurface = getVisiblePasswordAuthSurface({
    passwordAuthMode,
    prodUiModeEnabled,
  });

  useEffect(() => {
    // Router search state intentionally drives this effect even though the URL
    // helpers read window.location.search while deciding whether to strip it.
    if (
      !shouldStripVisibleProdUiQuery({
        deploymentProfile,
        productionPublicOrigin,
        search: window.location.search,
      })
    ) {
      return;
    }

    const nextPath = buildPathWithoutProdUiQuery({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    });
    window.history.replaceState(window.history.state, "", nextPath);
  }, [deploymentProfile, prodUiQueryEnabled, productionPublicOrigin]);

  return { passwordAuthSurface };
}

export function PublicLandingAuthControls({
  oauthAuthFlow,
}: {
  oauthAuthFlow: "current-route" | "public-signup";
}) {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation({
    select: (currentLocation) => ({
      pathname: currentLocation.pathname,
      searchStr: currentLocation.searchStr,
    }),
  });
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const signInRejection = useOAuthSignInRejection();
  const showOAuthReturnNotice = shouldRenderOAuthReturnNotice(
    location.pathname,
    rootRouteSearch,
    signInRejection !== null,
  );
  const { passwordAuthSurface } = usePublicLandingPasswordAuthControls();

  if (isAuthenticated || showOAuthReturnNotice) {
    return null;
  }

  const publicSignup = oauthAuthFlow === "public-signup";
  const markPublicSignupReturn =
    location.pathname !== MCP_CONSENT_APP_PATH && !isOrganizationInvitationPath(location.pathname);

  // The OAuth buttons stay centered whether or not the password form renders: a prerendered page
  // does not know the deployment's password policy, and the form appears below them once it loads.
  return (
    <div className="flex flex-col items-center gap-2 self-stretch">
      {GOOGLE_AUTH_UI_ENABLED ? (
        <SignInWithOAuth
          provider="google"
          authReturn={publicSignup ? "dashboard" : undefined}
          markPublicSignupReturn={markPublicSignupReturn}
        />
      ) : null}
      <SignInWithOAuth
        provider="github"
        authReturn={publicSignup ? "dashboard" : undefined}
        markPublicSignupReturn={markPublicSignupReturn}
      />
      {passwordAuthSurface !== "hidden" ? (
        <PasswordAuthForm
          onSignIn={
            // With `next`, useAppAuthRuntimeEffects returns there once the provider confirms the
            // session. Without it, a document load renders the dashboard from the new session
            // cookie, where a navigation inside the app could reach the dashboard's gate before
            // the provider confirms the session.
            publicSignup && readSignInNextHref(rootRouteSearch) === null
              ? () => {
                  window.location.assign(DASHBOARD_ROUTE);
                }
              : undefined
          }
          surface={passwordAuthSurface}
        />
      ) : null}
    </div>
  );
}

export function PasswordAuthForm({
  onSignIn,
  surface,
}: {
  onSignIn?: () => Promise<unknown> | void;
  surface: Exclude<PasswordAuthSurface, "hidden">;
}) {
  const { signInWithPassword } = useAppSignInActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveFlow = surface === "sign_in" ? "signIn" : flow;

  const submitLabel = pending
    ? effectiveFlow === "signIn"
      ? "Signing in..."
      : "Creating account..."
    : effectiveFlow === "signIn"
      ? "Sign in"
      : "Create account";
  const title = surface === "local_worktree" ? "Password auth (dev)" : "Password sign in";

  const runPasswordSignIn = (
    nextFlow: "signIn" | "signUp",
    nextEmail: string,
    nextPassword: string,
  ) => {
    const normalizedEmail = nextEmail.trim().toLowerCase();
    if (!normalizedEmail || !nextPassword) {
      return;
    }
    setPending(true);
    setError(null);
    void signInWithPassword({
      flow: nextFlow,
      email: normalizedEmail,
      password: nextPassword,
    })
      .then(() => onSignIn?.())
      .catch((signInError: unknown) => {
        setError(
          signInError instanceof ConvexError && typeof signInError.data === "string"
            ? signInError.data
            : signInError instanceof Error
              ? signInError.message
              : "Password sign-in failed",
        );
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div className="flex flex-col gap-2 self-stretch rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {surface === "local_worktree" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => {
              setError(null);
              setFlow((current) => (current === "signIn" ? "signUp" : "signIn"));
            }}
            disabled={pending}
          >
            {flow === "signIn" ? "Need an account?" : "Have an account?"}
          </Button>
        ) : null}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runPasswordSignIn(effectiveFlow, email, password);
        }}
      >
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={pending}
        />
        <Input
          type="password"
          autoComplete={effectiveFlow === "signIn" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={10}
          disabled={pending}
        />
        <div className="flex items-center gap-2">
          {surface === "local_worktree" ? (
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                const credentials = readLocalWorktreePasswordCredentials();
                if (!credentials) {
                  setError(
                    "Autofill is only available from the worktree dev server. Restart with pnpm dev:worktree and reload.",
                  );
                  return;
                }
                const nextFlow = "signIn";
                const nextEmail = credentials.email;
                const nextPassword = credentials.password;
                setFlow(nextFlow);
                setError(null);
                setEmail(nextEmail);
                setPassword(nextPassword);
                runPasswordSignIn(nextFlow, nextEmail, nextPassword);
              }}
              disabled={pending}
            >
              Autofill & sign in
            </Button>
          ) : null}
          <Button type="submit" disabled={pending} className="flex-1">
            {submitLabel}
          </Button>
        </div>
      </form>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
