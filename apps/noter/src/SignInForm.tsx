import { useNoterAuthActions } from "@/authClient";
import { PublicLandingCopyStatic } from "@/components/PublicLandingCopyStatic";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { landingPageMarkdown } from "@/lib/landingCopy";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "@/lib/publicLanding";
import {
  getVisiblePasswordAuthSurface,
  rememberPublicLandingPasswordAuthMode,
  resolvePublicLandingPasswordAuthMode,
  type PasswordAuthSurface,
  shouldRenderGoogleSignupClosedState,
  shouldRenderPublicLandingWithoutAuthGate,
  shouldShowGoogleAuthForPathname,
} from "@/lib/publicLandingAuthState";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import {
  clearPublicLandingWaitlistDraft,
  readPublicLandingWaitlistDraft,
  writePublicLandingWaitlistDraft,
} from "@/lib/publicLandingWaitlistDraft";
import { Link, useLocation } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import { SignInWithGoogle } from "./SignInWithGoogle";

const LOCAL_WORKTREE_PASSWORD_EMAIL = "nicu@noter.md";
const LOCAL_WORKTREE_PASSWORD_VALUE = "pass1234";

type SignInFormProps = {
  topNotice?: ReactNode;
};

export function SignInForm({ topNotice }: SignInFormProps = {}) {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const rootRouteSearch = useRootRouteSearch();
  const landingDevModeEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const prodUiModeEnabled = isProdUiModeEnabled(rootRouteSearch);
  const showGoogleAuth = shouldShowGoogleAuthForPathname(
    pathname,
    rootRouteSearch,
  );
  const showGoogleSignupClosedState = shouldRenderGoogleSignupClosedState(
    pathname,
    rootRouteSearch,
  );
  const markPublicSignupReturn = shouldRenderPublicLandingWithoutAuthGate(
    pathname,
    rootRouteSearch,
  );
  const deploymentAuthPolicy = useQuery(
    api.deploymentProfile.getPublicDeploymentAuthPolicy,
  );
  const passwordAuthMode = resolvePublicLandingPasswordAuthMode(
    deploymentAuthPolicy?.passwordAuthMode,
  );
  const passwordAuthSurface = getVisiblePasswordAuthSurface({
    passwordAuthMode,
    prodUiModeEnabled,
  });
  const isLandingCopyEditable = !prodUiModeEnabled && landingDevModeEnabled;
  // Keep the editable `/?dev` view and the plain landing view on the same
  // in-memory draft so query-param toggles do not reset the current copy.
  const [landingMarkdownDraft, setLandingMarkdownDraft] =
    useState(landingPageMarkdown);

  useEffect(() => {
    const nextPasswordAuthMode = deploymentAuthPolicy?.passwordAuthMode;
    if (nextPasswordAuthMode === undefined) {
      return;
    }

    // Preserve the last resolved password-auth mode so a manual refresh keeps
    // the same landing-card height while Convex reconnects.
    rememberPublicLandingPasswordAuthMode(nextPasswordAuthMode);
  }, [deploymentAuthPolicy?.passwordAuthMode]);

  return (
    <div
      data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="container my-auto">
        <div
          data-testid="public-landing-content"
          className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8"
        >
          {topNotice}
          <PublicLandingLogo
            autoRotate={isLandingCopyEditable}
            enableViewSnapping={!landingDevModeEnabled}
          />
          {showGoogleSignupClosedState ? (
            <GoogleSignupClosedNotice />
          ) : (
            <>
              <div data-testid={PUBLIC_LANDING_COPY_TEST_ID}>
                {isLandingCopyEditable ? (
                  <ProsemarkReadOnly
                    value={landingMarkdownDraft}
                    className="text-sm"
                    editable
                    styleVariant="landingCopy"
                    onChange={setLandingMarkdownDraft}
                  />
                ) : (
                  <PublicLandingCopyStatic markdown={landingMarkdownDraft} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <SignInWithGoogle
                  visible={showGoogleAuth}
                  markPublicSignupReturn={markPublicSignupReturn}
                />
                {passwordAuthSurface !== "hidden" ? (
                  <PasswordAuthForm surface={passwordAuthSurface} />
                ) : null}
              </div>
            </>
          )}
          <WaitlistForm
            submittedMessage={
              showGoogleSignupClosedState
                ? "You're on the waitlist."
                : "You're on the waitlist. We'll reach out when a spot opens up."
            }
          />
        </div>
      </div>
    </div>
  );
}

function GoogleSignupClosedNotice() {
  return (
    <div className="flex flex-col gap-1 text-center">
      <h2 className="text-xl font-semibold tracking-tight">
        I'm sorry, signups are still just for a handful of people I know
        personally.
      </h2>

      <p className="text-sm text-muted-foreground">
        Please{" "}
        <a
          href="https://x.com/noter_md"
          target="_blank"
          rel="noopener noreferrer"
        >
          follow us on twitter
        </a>{" "}
        or join the waitlist below.
      </p>

      <Link to="/">go back</Link>
    </div>
  );
}

function WaitlistForm({ submittedMessage }: { submittedMessage?: string }) {
  const joinWaitlist = useMutation(api.waitlist.joinWaitlist);
  const [email, setEmail] = useState(readPublicLandingWaitlistDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    writePublicLandingWaitlistDraft(email);
  }, [email]);

  useEffect(() => {
    return () => {
      clearPublicLandingWaitlistDraft();
    };
  }, []);

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        {submittedMessage ??
          "You're on the waitlist. We'll reach out when a spot opens up."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          void joinWaitlist({ email: email.trim() }).then(() => {
            clearPublicLandingWaitlistDraft();
            setSubmitted(true);
          });
        }}
      >
        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Join Waitlist
        </Button>
      </form>
    </div>
  );
}

export function PasswordAuthForm({
  surface,
}: {
  surface: Exclude<PasswordAuthSurface, "hidden">;
}) {
  const { signInWithPassword } = useNoterAuthActions();
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
        setError(
          signInError instanceof Error
            ? signInError.message
            : "Password sign-in failed",
        );
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {surface === "preview"
            ? "Preview password sign in"
            : "Password auth (local worktree)"}
        </div>
        {surface === "local_worktree" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => {
              setError(null);
              setFlow((current) =>
                current === "signIn" ? "signUp" : "signIn",
              );
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
          autoComplete={
            effectiveFlow === "signIn" ? "current-password" : "new-password"
          }
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
                const nextFlow = "signIn";
                const nextEmail = LOCAL_WORKTREE_PASSWORD_EMAIL;
                const nextPassword = LOCAL_WORKTREE_PASSWORD_VALUE;
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
