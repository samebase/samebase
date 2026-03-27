import { setAuthProvider } from "@/authClient";
import { LandingCopy } from "@/components/LandingCopy";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/input";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { landingPageMarkdown } from "@/lib/landingCopy";
import {
  buildPublicLandingIntakeSuccessMessage,
  PUBLIC_LANDING_INTAKE_BUTTON_LABEL,
  PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID,
  PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER,
  PUBLIC_LANDING_INTAKE_HELP_TEXT,
  PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID,
  PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER,
  PUBLIC_LANDING_INTAKE_PROMPT,
} from "@/lib/publicLandingIntake";
import {
  clearPublicLandingIntakeDraft,
  readPublicLandingIntakeDraft,
  writePublicLandingIntakeDraft,
} from "@/lib/publicLandingIntakeDraft";
import { PUBLIC_LANDING_COPY_TEST_ID } from "@/lib/publicLanding";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { SignInWithGoogle } from "./SignInWithGoogle";

const DEV_PASSWORD_EMAIL = "nicu@noter.md";
const DEV_PASSWORD_VALUE = "pass1234";

type SignInFormProps = {
  topNotice?: ReactNode;
};

export function SignInForm({ topNotice }: SignInFormProps = {}) {
  const [searchParams] = useSearchParams();
  const landingDevModeEnabled = isLandingDevModeEnabled(searchParams);
  const prodUiModeEnabled = isProdUiModeEnabled(searchParams);
  const showPasswordAuth = import.meta.env.DEV && !prodUiModeEnabled;
  const isLandingCopyEditable = !prodUiModeEnabled && landingDevModeEnabled;
  // Keep the editable `/?dev` view and the plain landing view on the same
  // in-memory draft so query-param toggles do not reset the current copy.
  const [landingMarkdownDraft, setLandingMarkdownDraft] =
    useState(landingPageMarkdown);

  return (
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
            <LandingCopy className="text-sm" markdown={landingMarkdownDraft} />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <SignInWithGoogle />
          {showPasswordAuth ? <PasswordAuthForm /> : null}
        </div>
        <PublicLandingIntakeForm />
        <div className="border-t pt-2 text-center text-xs text-muted-foreground">
          <Link to="/terms" className="transition-colors hover:text-foreground">
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
  );
}

function PublicLandingIntakeForm() {
  const submitLandingIntake = useMutation(api.waitlist.joinWaitlist);
  const [landingDraft, setLandingDraft] = useState(
    readPublicLandingIntakeDraft,
  );
  const [submittedWithEmail, setSubmittedWithEmail] = useState<boolean | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    writePublicLandingIntakeDraft(landingDraft);
  }, [landingDraft]);

  useEffect(() => {
    return () => {
      clearPublicLandingIntakeDraft();
    };
  }, []);

  if (submittedWithEmail !== null) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        {buildPublicLandingIntakeSuccessMessage(submittedWithEmail)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t">
      <p className="text-sm">{PUBLIC_LANDING_INTAKE_PROMPT}</p>
      <p className="text-xs text-muted-foreground">
        {PUBLIC_LANDING_INTAKE_HELP_TEXT}
      </p>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();

          const nextMessage = landingDraft.message.trim();
          const nextEmail = landingDraft.email.trim();
          if (!nextMessage) {
            return;
          }

          setSubmitting(true);
          setSubmitError(null);
          void submitLandingIntake({
            message: nextMessage,
            email: nextEmail || undefined,
          })
            .then(() => {
              clearPublicLandingIntakeDraft();
              setSubmittedWithEmail(nextEmail.length > 0);
            })
            .catch((submitLandingIntakeError: unknown) => {
              setSubmitError(
                submitLandingIntakeError instanceof Error
                  ? submitLandingIntakeError.message
                  : "Couldn't send your note right now.",
              );
            })
            .finally(() => {
              setSubmitting(false);
            });
        }}
      >
        <Textarea
          id={PUBLIC_LANDING_INTAKE_MESSAGE_INPUT_ID}
          aria-label={PUBLIC_LANDING_INTAKE_PROMPT}
          placeholder={PUBLIC_LANDING_INTAKE_MESSAGE_PLACEHOLDER}
          value={landingDraft.message}
          onChange={(event) =>
            setLandingDraft((current) => ({
              ...current,
              message: event.target.value,
            }))
          }
          required
          disabled={submitting}
          className="min-h-[96px] resize-none"
        />
        <Input
          id={PUBLIC_LANDING_INTAKE_EMAIL_INPUT_ID}
          type="email"
          autoComplete="email"
          aria-label={PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER}
          placeholder={PUBLIC_LANDING_INTAKE_EMAIL_PLACEHOLDER}
          value={landingDraft.email}
          onChange={(event) =>
            setLandingDraft((current) => ({
              ...current,
              email: event.target.value,
            }))
          }
          disabled={submitting}
        />
        <Button type="submit" variant="outline" className="self-start">
          {submitting ? "Sharing..." : PUBLIC_LANDING_INTAKE_BUTTON_LABEL}
        </Button>
      </form>
      {submitError ? (
        <p className="text-xs text-red-600">{submitError}</p>
      ) : null}
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
