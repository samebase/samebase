import { useNoterSignInActions } from "@/authClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getVisiblePasswordAuthSurface,
  rememberPublicLandingPasswordAuthMode,
  resolvePublicLandingPasswordAuthMode,
  shouldRenderGoogleSignupClosedState,
  shouldRenderPublicLandingWithoutAuthGate,
  shouldShowGoogleAuthForPathname,
  type PasswordAuthSurface,
} from "@/lib/publicLandingAuthState";
import {
  buildPathWithoutProdUiQuery,
  isBrowserProductionPublicOrigin,
  isProdUiModeActive,
  isProdUiModeEnabled,
  shouldStripVisibleProdUiQuery,
} from "@/lib/prodUiMode";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { SignInWithGoogle } from "@/SignInWithGoogle";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

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

export function PublicLandingAuthControls() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const prodUiQueryEnabled = isProdUiModeEnabled(rootRouteSearch);
  const productionPublicOrigin = isBrowserProductionPublicOrigin();
  const showGoogleAuth = shouldShowGoogleAuthForPathname(pathname, rootRouteSearch);
  const showGoogleSignupClosedState = shouldRenderGoogleSignupClosedState(
    pathname,
    rootRouteSearch,
  );
  const markPublicSignupReturn = shouldRenderPublicLandingWithoutAuthGate(
    pathname,
    rootRouteSearch,
  );
  const deploymentAuthPolicy = useQuery(api.deploymentProfile.getPublicDeploymentAuthPolicy);
  const deploymentProfile = deploymentAuthPolicy?.deploymentProfile;
  const prodUiModeEnabled = isProdUiModeActive({
    deploymentProfile,
    productionPublicOrigin,
    search: rootRouteSearch,
  });
  const passwordAuthMode = resolvePublicLandingPasswordAuthMode(
    deploymentAuthPolicy?.passwordAuthMode,
  );
  const passwordAuthSurface = getVisiblePasswordAuthSurface({
    passwordAuthMode,
    prodUiModeEnabled,
  });

  useEffect(() => {
    const nextPasswordAuthMode = deploymentAuthPolicy?.passwordAuthMode;
    if (nextPasswordAuthMode === undefined) {
      return;
    }

    // Preserve the last resolved password-auth mode so a manual refresh keeps
    // the same auth surface while Convex reconnects.
    rememberPublicLandingPasswordAuthMode(nextPasswordAuthMode);
  }, [deploymentAuthPolicy?.passwordAuthMode]);

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

  if (showGoogleSignupClosedState) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <SignInWithGoogle visible={showGoogleAuth} markPublicSignupReturn={markPublicSignupReturn} />
      {passwordAuthSurface !== "hidden" ? <PasswordAuthForm surface={passwordAuthSurface} /> : null}
    </div>
  );
}

export function PasswordAuthForm({ surface }: { surface: Exclude<PasswordAuthSurface, "hidden"> }) {
  const { signInWithPassword } = useNoterSignInActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveFlow = surface === "preview" ? "signIn" : flow;

  const submitLabel = pending
    ? effectiveFlow === "signIn"
      ? "Signing in..."
      : "Creating account..."
    : effectiveFlow === "signIn"
      ? "Sign in"
      : "Create account";

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
      .catch((signInError: unknown) => {
        setError(signInError instanceof Error ? signInError.message : "Password sign-in failed");
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {surface === "preview" ? "Preview password sign in" : "Password auth (local worktree)"}
        </div>
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
          minLength={8}
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
                    "Autofill is only available from the worktree anon dev server. Restart with pnpm anon and reload.",
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
