import { isInIframe, openAuthPopup, setAuthProvider } from "@/authClient";
import { LandingCopy } from "@/components/LandingCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isLandingDevModeEnabled } from "@/lib/landingDevMode";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { isProdUiModeEnabled } from "@/lib/prodUiMode";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { Chrome } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../convex/_generated/api";

const DEV_PASSWORD_EMAIL = "nicu@noter.md";
const DEV_PASSWORD_VALUE = "pass1234";
const EditableLandingCopy = lazy(async () => {
  const module = await import("@/components/ProsemarkReadOnly");
  return { default: module.ProsemarkReadOnly };
});

export function SignInForm() {
  const [searchParams] = useSearchParams();
  const prodUiModeEnabled = isProdUiModeEnabled(searchParams);
  const showPasswordAuth = import.meta.env.DEV && !prodUiModeEnabled;
  const isLandingCopyEditable =
    !prodUiModeEnabled && isLandingDevModeEnabled(searchParams);

  return (
    <div className="container my-auto">
      <div className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
        {isLandingCopyEditable ? (
          <Suspense fallback={<LandingCopy className="text-sm" />}>
            <EditableLandingCopy
              value={landingPageMarkdown}
              className="text-sm"
              editable
            />
          </Suspense>
        ) : (
          <LandingCopy className="text-sm" />
        )}
        <div className="flex flex-col gap-2">
          <SignInWithGoogle />
          {showPasswordAuth ? <PasswordAuthForm /> : null}
        </div>
        <WaitlistForm />
      </div>
    </div>
  );
}

function WaitlistForm() {
  const joinWaitlist = useMutation(api.waitlist.joinWaitlist);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

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
          void joinWaitlist({ email: email.trim() }).then(() =>
            setSubmitted(true),
          );
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

export function SignInWithGoogle() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("google");
        } else {
          setAuthProvider("google");
          void signIn("google");
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
