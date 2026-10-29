import { useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useSignOutSession } from "@samebase/convex-auth-tanstack-start";
import { useRouter } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useCallback, useEffect } from "react";
import { api } from "../convex/_generated/api";
import { buildOAuthRedirectSearch, type OAuthAuthProvider } from "@/lib/oauthAuthRedirect";
import { type RootRouteSearch } from "@/routeSearch/root";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";
import { toast } from "@/components/ui/use-toast";

type SignOutAction = () => Promise<boolean>;
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
 * telemetry issue can block the user from leaving the current session. It
 * resolves to `false` when the sign-out route failed and the session stays.
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
 * Starts the redirect to the identity hub, which signs in with the provider of the button. The
 * browser leaves the page when the start succeeds, and the Convex Auth client finishes the sign-in
 * when the hub returns to `redirectTo`, a path on this origin.
 */
function useOAuthSignIn() {
  const { signIn: signInWithGithub } = useOauthSignIn({
    providerName: "hub-github",
    startSignIn: api.auth.startSignInWithHubGithub,
    completeSignIn: api.auth.completeSignInWithHubGithub,
  });
  const { signIn: signInWithGoogle } = useOauthSignIn({
    providerName: "hub-google",
    startSignIn: api.auth.startSignInWithHubGoogle,
    completeSignIn: api.auth.completeSignInWithHubGoogle,
  });

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

/**
A client for the sign-in mutations of Samebase's own methods (password, agent browser handoff). It
calls them through the app's `/auth/signin` route, which mints the session, keeps the refresh token
in its httpOnly cookie, and returns only the access token for `setSession`. The trailing `?path=`
puts the endpoint that the client appends into the query string. The current access token goes
along, so a mutation can read the browser's identity.
*/
export function useSessionRouteClient() {
  const accessToken = useAuthToken();

  return useCallback(() => {
    const client = new ConvexHttpClient("/auth/signin?path=", {
      skipConvexDeploymentUrlCheck: true,
    });
    if (accessToken !== null) {
      client.setAuth(accessToken);
    }
    return client;
  }, [accessToken]);
}

export function useAppSignInActions() {
  const { setSession } = useAuthActions();
  const signInWithOAuth = useOAuthSignIn();
  const sessionRouteClient = useSessionRouteClient();

  return {
    signInWithOAuth,
    signInWithPassword: async (args: PasswordSignInArgs) => {
      const credentials = { email: args.email, password: args.password };
      const result =
        args.flow === "signUp"
          ? await sessionRouteClient().mutation(api.auth.signUpWithPassword, credentials)
          : await sessionRouteClient().mutation(api.auth.signInWithPassword, credentials);
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
  // Posts to the sign-out route, which clears the session cookies, then reloads the page.
  const signOut = useSignOutSession("/auth/signout");

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
