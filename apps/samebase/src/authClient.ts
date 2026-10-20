import { useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect } from "react";
import { api } from "../convex/_generated/api";
import { buildOAuthRedirectSearch, type OAuthAuthProvider } from "@/lib/oauthAuthRedirect";
import { type RootRouteSearch } from "@/routeSearch/root";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";
import { toast } from "@/components/ui/use-toast";

type SignOutAction = ReturnType<typeof useAuthActions>["signOut"];
type PostHogResetClient = {
  reset: () => void;
};
type PasswordSignInArgs = {
  flow: "signIn" | "signUp";
  email: string;
  password: string;
};

/**
 * Sign-out should always continue even if PostHog cleanup fails, otherwise a
 * telemetry issue can block the user from leaving the current session.
 */
export function signOutWithAnalytics(args: {
  signOut: SignOutAction;
  posthog: PostHogResetClient;
}) {
  try {
    args.posthog.reset();
  } catch {
    // Analytics cleanup is best-effort; the auth sign-out must still complete.
  }
  return args.signOut();
}

const deferredPostHogResetClient: PostHogResetClient = {
  /**
   * Reset PostHog on sign-out without importing analytics into the initial auth
   * client chunk. The PostHog helper keeps the SDK import lazy, so sign-out can
   * clear analytics identity without making the public landing path preload it.
   */
  reset: () => {
    void resetSamebasePostHogClient();
  },
};

/**
 * Starts the provider redirect. The browser leaves the page when the start succeeds, and the
 * Convex Auth client finishes the sign-in when the provider returns to `redirectTo`, a path on
 * this origin.
 */
function useOAuthSignIn() {
  const { signIn: signInWithGithub } = useSignInWithGithub(api.auth);
  const { signIn: signInWithGoogle } = useSignInWithGoogle(api.auth);

  return useCallback(
    async (provider: OAuthAuthProvider, redirectTo: string) => {
      const result = await (provider === "github" ? signInWithGithub : signInWithGoogle)({
        redirectTo: new URL(redirectTo, window.location.origin).href,
      });
      if (result.status === "error") {
        throw new Error(`Could not start ${provider} sign-in.`);
      }
    },
    [signInWithGithub, signInWithGoogle],
  );
}

export function useAppSignInActions() {
  const { setSession } = useAuthActions();
  const signInWithOAuth = useOAuthSignIn();
  const signInWithPassword = useMutation(api.auth.signInWithPassword);
  const signUpWithPassword = useMutation(api.auth.signUpWithPassword);

  return {
    signInWithOAuth,
    signInWithPassword: async (args: PasswordSignInArgs) => {
      const credentials = { email: args.email, password: args.password };
      const result =
        args.flow === "signUp"
          ? await signUpWithPassword(credentials)
          : await signInWithPassword(credentials);
      if (result.status === "error") {
        throw new Error(
          result.userError.error === "RATE_LIMITED"
            ? `Too many attempts. Try again in ${Math.ceil(result.userError.retryAfterMs / 1000)} seconds.`
            : "Incorrect email or password.",
        );
      }
      await setSession(result.tokens);
    },
  };
}

export function useAppAuthActions() {
  const { signOut } = useAuthActions();

  return {
    signOut: () =>
      signOutWithAnalytics({
        posthog: deferredPostHogResetClient,
        signOut,
      }),
  };
}

export function isInIframe() {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

/**
 * Starts provider sign-in when a route sets its one-use `auth` search value, for links that begin
 * a GitHub or Google sign-in directly.
 */
export function useAutoSignIn(rootRouteSearch: RootRouteSearch) {
  const signInWithOAuth = useOAuthSignIn();
  const router = useRouter();
  const authProvider = rootRouteSearch.auth;
  const authReturn = rootRouteSearch["auth-return"];
  const signupReturn = rootRouteSearch.signup;
  useEffect(() => {
    if (authProvider !== undefined) {
      const redirectTo = router.buildLocation({
        hash: true,
        search: (currentSearch) =>
          buildOAuthRedirectSearch(currentSearch, authProvider, {
            authReturn,
            markPublicSignupReturn: signupReturn === authProvider,
          }),
        state: true,
        to: authReturn === "dashboard" ? "/" : ".",
      }).href;
      // Preserve TanStack Router history metadata while stripping the auth param from the URL
      // before the provider redirect begins.
      window.history.replaceState(window.history.state, "", redirectTo);
      void signInWithOAuth(authProvider, redirectTo).catch(() => {
        toast({
          description: "Try again.",
          title: `Could not start ${authProvider === "github" ? "GitHub" : "Google"} sign-in`,
          variant: "destructive",
        });
      });
    }
  }, [authProvider, authReturn, router, signInWithOAuth, signupReturn]);
}
