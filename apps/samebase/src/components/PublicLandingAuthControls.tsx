import { useAppSignInActions } from "@/authClient";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID,
  PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID,
} from "@/lib/publicLanding";
import { cn } from "@/lib/utils";
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
import { readRootRouteSearch, type RootRouteSearch } from "@/routeSearch/root";
import { readBrowserRouteEnvironment, type RouteEnvironment } from "@/routing/availability";
import { SignInWithGoogle } from "@/SignInWithGoogle";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { Chrome } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { PasswordAuthMode as PublicPasswordAuthMode } from "../../convex/deploymentProfile";

type PasswordAuthFlow = "signIn" | "signUp";
type SidebarAuthPrehydrationSurfaceKind = Exclude<PasswordAuthSurface, "hidden"> | "google_only";

const SIDEBAR_AUTH_PREHYDRATION_SURFACE_CLASS =
  "vault-dashboard-sidebar-inset border-b border-border/50 py-3";

function useHasHydratedLayout() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useLayoutEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}

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

function resolveRouteEnvironmentPasswordAuthMode(
  routeEnvironment: RouteEnvironment,
): PublicPasswordAuthMode | undefined {
  switch (routeEnvironment) {
    case "local":
      return "local_worktree_seed";
    case "preview":
      return "preview_seed";
    case "production":
      return undefined;
    default:
      routeEnvironment satisfies never;
      return undefined;
  }
}

function readInitialPasswordAuthMode(): PublicPasswordAuthMode | undefined {
  if (readLocalWorktreePasswordCredentials()) {
    return "local_worktree_seed";
  }

  return resolveRouteEnvironmentPasswordAuthMode(readBrowserRouteEnvironment());
}

function resolvePasswordAuthFlow(routeSearch: RootRouteSearch): PasswordAuthFlow {
  return routeSearch["create-account"] === true ? "signUp" : "signIn";
}

function SidebarAuthPrehydrationText({ label }: { label: string }) {
  return <span>{label}</span>;
}

function SidebarAuthPrehydrationInput({ label }: { label: string }) {
  return <Input aria-hidden="true" placeholder={label} readOnly tabIndex={-1} />;
}

function SidebarAuthPrehydrationPasswordCard({
  flow,
  surface,
}: {
  flow: PasswordAuthFlow;
  surface: Exclude<SidebarAuthPrehydrationSurfaceKind, "google_only">;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          <SidebarAuthPrehydrationText label="Password auth (dev)" />
        </div>
        {surface === "local_worktree" ? (
          <div
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-auto px-2 py-1 text-xs",
            )}
          >
            <SidebarAuthPrehydrationText
              label={flow === "signIn" ? "Need an account?" : "Have an account?"}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <SidebarAuthPrehydrationInput label="you@example.com" />
        <SidebarAuthPrehydrationInput label="Password" />
        <div className="flex items-center gap-2">
          {surface === "local_worktree" ? (
            <div className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}>
              <SidebarAuthPrehydrationText label="Autofill & sign in" />
            </div>
          ) : null}
          <div className={cn(buttonVariants(), "flex-1")}>
            <SidebarAuthPrehydrationText label={flow === "signIn" ? "Sign in" : "Create account"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarAuthPrehydrationSurface({
  flow,
  surface,
}: {
  flow: PasswordAuthFlow;
  surface: SidebarAuthPrehydrationSurfaceKind;
}) {
  return (
    <div data-app-auth-prehydration-sidebar-auth={`${flow}-${surface}`} className="hidden">
      <div className={SIDEBAR_AUTH_PREHYDRATION_SURFACE_CLASS}>
        <div className="flex flex-col gap-2">
          {flow === "signIn" ? (
            <div className={cn(buttonVariants({ variant: "outline" }), "h-auto flex-1 py-2.5")}>
              <Chrome className="mr-2 h-4 w-4" />
              <SidebarAuthPrehydrationText label="Google" />
            </div>
          ) : null}
          {surface === "google_only" ? null : (
            <SidebarAuthPrehydrationPasswordCard flow={flow} surface={surface} />
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarAuthPrehydrationPlaceholders() {
  return (
    <div
      aria-hidden="true"
      data-testid={PUBLIC_LANDING_SIDEBAR_AUTH_PLACEHOLDER_TEST_ID}
      className="hidden"
    >
      <SidebarAuthPrehydrationSurface flow="signIn" surface="preview" />
      <SidebarAuthPrehydrationSurface flow="signIn" surface="local_worktree" />
      <SidebarAuthPrehydrationSurface flow="signIn" surface="google_only" />
      <SidebarAuthPrehydrationSurface flow="signUp" surface="preview" />
      <SidebarAuthPrehydrationSurface flow="signUp" surface="local_worktree" />
    </div>
  );
}

function usePublicLandingPasswordAuthControls(): {
  onPasswordSignIn: () => Promise<unknown> | void;
  passwordAuthSurface: PasswordAuthSurface;
} {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const [passwordSignInReadyForDashboard, setPasswordSignInReadyForDashboard] = useState(false);
  const searchStr = useLocation({
    select: (location) => location.searchStr,
  });
  const rootRouteSearch = readRootRouteSearch(searchStr);
  const prodUiQueryEnabled = isProdUiModeEnabled(rootRouteSearch);
  const productionPublicOrigin = isBrowserProductionPublicOrigin();
  const deploymentAuthPolicy = useQuery(api.deploymentProfile.getPublicDeploymentAuthPolicy);
  const deploymentProfile = deploymentAuthPolicy?.deploymentProfile;
  const prodUiModeEnabled = isProdUiModeActive({
    deploymentProfile,
    productionPublicOrigin,
    search: rootRouteSearch,
  });
  const passwordAuthMode = resolvePublicLandingPasswordAuthMode(
    deploymentAuthPolicy?.passwordAuthMode ?? readInitialPasswordAuthMode(),
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
    if (!passwordSignInReadyForDashboard || !isAuthenticated) {
      return;
    }

    void navigate({
      search: (currentSearch) => ({
        ...currentSearch,
        auth: undefined,
        "auth-return": undefined,
        "create-account": undefined,
        signup: undefined,
        "sign-in": undefined,
      }),
      to: DASHBOARD_ROUTE,
    });
  }, [isAuthenticated, navigate, passwordSignInReadyForDashboard]);

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

  return {
    onPasswordSignIn: () => {
      setPasswordSignInReadyForDashboard(true);
    },
    passwordAuthSurface,
  };
}

export function PublicLandingAuthControls() {
  const location = useLocation({
    select: (currentLocation) => ({
      pathname: currentLocation.pathname,
      searchStr: currentLocation.searchStr,
    }),
  });
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const showGoogleAuth = shouldShowGoogleAuthForPathname(location.pathname, rootRouteSearch);
  const showGoogleSignupClosedState = shouldRenderGoogleSignupClosedState(
    location.pathname,
    rootRouteSearch,
  );
  const markPublicSignupReturn = shouldRenderPublicLandingWithoutAuthGate(
    location.pathname,
    rootRouteSearch,
  );
  const { onPasswordSignIn, passwordAuthSurface } = usePublicLandingPasswordAuthControls();

  if (showGoogleSignupClosedState) {
    return null;
  }

  const authReturn = location.pathname === "/" ? "dashboard" : undefined;

  return (
    <div className="flex flex-col gap-2">
      <SignInWithGoogle
        authReturn={authReturn}
        visible={showGoogleAuth}
        markPublicSignupReturn={markPublicSignupReturn}
      />
      {passwordAuthSurface !== "hidden" ? (
        <PasswordAuthForm
          flow={resolvePasswordAuthFlow(rootRouteSearch)}
          onSignIn={onPasswordSignIn}
          surface={passwordAuthSurface}
        />
      ) : null}
    </div>
  );
}

export function PublicLandingSidebarAuthControls() {
  const { isAuthenticated } = useConvexAuth();
  const hasHydrated = useHasHydratedLayout();
  const location = useLocation({
    select: (currentLocation) => ({
      pathname: currentLocation.pathname,
      searchStr: currentLocation.searchStr,
    }),
  });
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const showAuthRoute =
    location.pathname === "/" &&
    (rootRouteSearch["sign-in"] === true || rootRouteSearch["create-account"] === true);
  const showGoogleAuth =
    showAuthRoute && shouldShowGoogleAuthForPathname(location.pathname, rootRouteSearch);
  const markPublicSignupReturn = shouldRenderPublicLandingWithoutAuthGate(
    location.pathname,
    rootRouteSearch,
  );
  const { onPasswordSignIn, passwordAuthSurface } = usePublicLandingPasswordAuthControls();
  const showPasswordAuth = showAuthRoute && passwordAuthSurface !== "hidden";

  if (!hasHydrated) {
    return <SidebarAuthPrehydrationPlaceholders />;
  }

  if (isAuthenticated || (!showGoogleAuth && !showPasswordAuth)) {
    return <SidebarAuthPrehydrationPlaceholders />;
  }

  const authReturn = location.pathname === "/" ? "dashboard" : undefined;

  return (
    <div
      data-testid={PUBLIC_LANDING_PASSWORD_AUTH_SECTION_TEST_ID}
      className="vault-dashboard-sidebar-inset border-b border-border/50 py-3"
    >
      <div className="flex flex-col gap-2">
        {showGoogleAuth ? (
          <SignInWithGoogle
            authReturn={authReturn}
            markPublicSignupReturn={markPublicSignupReturn}
          />
        ) : null}
        {showPasswordAuth ? (
          <PasswordAuthForm
            flow={resolvePasswordAuthFlow(rootRouteSearch)}
            onSignIn={onPasswordSignIn}
            surface={passwordAuthSurface}
          />
        ) : null}
      </div>
    </div>
  );
}

export function PasswordAuthForm({
  flow,
  onSignIn,
  surface,
}: {
  flow: PasswordAuthFlow;
  onSignIn?: () => Promise<unknown> | void;
  surface: Exclude<PasswordAuthSurface, "hidden">;
}) {
  const { signInWithPassword } = useAppSignInActions();
  const [selectedFlow, setSelectedFlow] = useState<PasswordAuthFlow>(flow);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveFlow = selectedFlow;

  useEffect(() => {
    setSelectedFlow(flow);
  }, [flow]);

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
      .then(() => onSignIn?.())
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
        <div className="text-sm font-medium">Password auth (dev)</div>
        {surface === "local_worktree" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => {
              setError(null);
              setSelectedFlow((current) => (current === "signIn" ? "signUp" : "signIn"));
            }}
            disabled={pending}
          >
            {selectedFlow === "signIn" ? "Need an account?" : "Have an account?"}
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
                    "Autofill is only available from the worktree dev server. Restart with pnpm dev:worktree and reload.",
                  );
                  return;
                }
                const nextFlow = "signIn";
                const nextEmail = credentials.email;
                const nextPassword = credentials.password;
                setSelectedFlow(nextFlow);
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
