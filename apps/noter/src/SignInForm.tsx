import { setAuthProvider } from "@/authClient";
import { AppPageScrollShell } from "@/components/AppPageScrollShell";
import { LandingCopy } from "@/components/LandingCopy";
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
  clearPendingPublicLandingScrollTop,
  readPendingPublicLandingScrollTop,
} from "@/lib/publicLandingScrollState";
import { shouldShowGoogleAuthForLocation } from "@/lib/publicLandingAuthState";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import {
  clearPublicLandingWaitlistDraft,
  readPublicLandingWaitlistDraft,
  writePublicLandingWaitlistDraft,
} from "@/lib/publicLandingWaitlistDraft";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { SignInWithGoogle } from "./SignInWithGoogle";

const DEV_PASSWORD_EMAIL = "nicu@noter.md";
const DEV_PASSWORD_VALUE = "pass1234";

type SignInFormProps = {
  topNotice?: ReactNode;
};

export function SignInForm({ topNotice }: SignInFormProps = {}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const landingDevModeEnabled = isLandingDevModeEnabled(searchParams);
  const prodUiModeEnabled = isProdUiModeEnabled(searchParams);
  const showGoogleAuth = shouldShowGoogleAuthForLocation(location);
  const showPasswordAuth = import.meta.env.DEV && !prodUiModeEnabled;
  const isLandingCopyEditable = !prodUiModeEnabled && landingDevModeEnabled;
  const scrollShellRef = useRef<HTMLDivElement | null>(null);
  // Keep the editable `/?dev` view and the plain landing view on the same
  // in-memory draft so query-param toggles do not reset the current copy.
  const [landingMarkdownDraft, setLandingMarkdownDraft] =
    useState(landingPageMarkdown);

  useLayoutEffect(() => {
    const scrollTop = readPendingPublicLandingScrollTop();
    if (scrollTop === null || scrollShellRef.current === null) {
      return;
    }

    scrollShellRef.current.scrollTop = scrollTop;
    const animationFrameId = window.requestAnimationFrame(() => {
      clearPendingPublicLandingScrollTop(scrollTop);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <AppPageScrollShell
      ref={scrollShellRef}
      data-testid={PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}
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
              <LandingCopy
                className="text-sm"
                markdown={landingMarkdownDraft}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            {showGoogleAuth ? <SignInWithGoogle /> : null}
            {showPasswordAuth ? <PasswordAuthForm /> : null}
          </div>
          <WaitlistForm />
          <div className="border-t pt-2 text-center text-xs text-muted-foreground">
            <Link
              to="/terms"
              className="transition-colors hover:text-foreground"
            >
              /terms
            </Link>
            <span className="px-2">·</span>
            <Link
              to="/privacy"
              className="transition-colors hover:text-foreground"
            >
              /privacy
            </Link>
          </div>
        </div>
      </div>
    </AppPageScrollShell>
  );
}

function WaitlistForm() {
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
        You're on the waitlist. We'll reach out when a spot opens up.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t">
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

function PasswordAuthForm() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitLabel = pending
    ? flow === "signIn"
      ? "Signing in..."
      : "Creating account..."
    : flow === "signIn"
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
    void signIn("password", {
      flow: nextFlow,
      email: normalizedEmail,
      password: nextPassword,
    })
      .then(() => {
        setAuthProvider("password");
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
        <div className="text-sm font-medium">Password auth (dev)</div>
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
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runPasswordSignIn(flow, email, password);
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
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          disabled={pending}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              const nextFlow = "signIn";
              const nextEmail = DEV_PASSWORD_EMAIL;
              const nextPassword = DEV_PASSWORD_VALUE;
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
          <Button type="submit" disabled={pending} className="flex-1">
            {submitLabel}
          </Button>
        </div>
      </form>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
