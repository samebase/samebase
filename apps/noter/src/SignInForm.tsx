import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthActions } from "@convex-dev/auth/react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Chrome } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useEffect, useRef, useState } from "react";

const AUTH_FLAG_KEY = "noter_was_authenticated";
const AUTH_PROVIDER_KEY = "noter_auth_provider";

type AuthProvider = "github" | "google";

function readAuthProvider(): AuthProvider | null {
  const value = localStorage.getItem(AUTH_PROVIDER_KEY);
  if (value === "github" || value === "google") {
    return value;
  }
  return null;
}

export function clearAuthFlag() {
  localStorage.removeItem(AUTH_FLAG_KEY);
  localStorage.removeItem(AUTH_PROVIDER_KEY);
}

export function setAuthFlag() {
  localStorage.setItem(AUTH_FLAG_KEY, "1");
}

export function setAuthProvider(provider: AuthProvider) {
  localStorage.setItem(AUTH_PROVIDER_KEY, provider);
}

function useAutoReauthenticate() {
  const { signIn } = useAuthActions();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (isInIframe() || window.opener) return;
    if (!localStorage.getItem(AUTH_FLAG_KEY)) return;

    const provider = readAuthProvider();
    if (!provider) return;

    attempted.current = true;
    void signIn(provider);
  }, [signIn]);

  // Returning whether we're attempting auto-login so the form can hide itself
  return attempted.current;
}

export function SignInForm() {
  const autoLoginInProgress = useAutoReauthenticate();

  if (autoLoginInProgress) return null;

  return (
    <div className="container my-auto">
      <div className="max-w-[384px] mx-auto flex flex-col my-auto gap-4 pb-8">
        <h2 className="font-semibold text-2xl tracking-tight">
          If Notion and Obsidian had a baby
        </h2>
        <ul className="list-disc list-inside">
          <li>stores everything on GitHub</li>
          <li>supports real-time collaboration</li>
          <li>is mobile-web first</li>
          <li className="text-muted-foreground/90">
            can build small apps with Codex
          </li>
          <li className="text-muted-foreground/70">can be built it intself</li>
          <li className="text-muted-foreground/40">
            is built in itself
            <span className="sr-only">
              {" "}
              This line is intentionally de-emphasized to make the tone feel
              more mysterious.
            </span>
          </li>
        </ul>
        <SignInWithGoogle />
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
        You're in the queue! We'll reach out when a spot opens up.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t">
      <p className="text-sm text-muted-foreground text-center">
        Usage is invite-only. Join the queue to get access.
      </p>
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
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="outline" className="shrink-0">
          Join queue
        </Button>
      </form>
    </div>
  );
}

export function isInIframe() {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

export function openAuthPopup(provider: "google" | "github") {
  // Don't call signIn directly — the library would try window.location.href
  // which breaks in iframes. Instead open a popup that will auto-trigger sign-in.
  // Listen for auth tokens sent from the popup via postMessage.
  setAuthProvider(provider);
  let popup: Window | null = null;
  const expectedOrigin = window.location.origin;
  const handler = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (popup && event.source !== popup) return;
    if (event.data?.type === "convex-auth-tokens") {
      window.removeEventListener("message", handler);
      const tokens = event.data.tokens as Record<string, string>;
      for (const [key, value] of Object.entries(tokens)) {
        localStorage.setItem(key, value);
      }
      window.location.reload();
    }
  };
  window.addEventListener("message", handler);

  popup = window.open(
    `${window.location.origin}/?auth=${provider}`,
    `${provider}-oauth`,
    "width=600,height=700,popup=true",
  );
}

/**
 * Auto-trigger provider sign-in when opened as a popup with ?auth=github|google.
 * The popup handles the full OAuth redirect flow (not blocked by CSP
 * since it's a top-level window). After auth completes, the popup
 * auto-closes and the token syncs to the parent via localStorage.
 */
export function useAutoSignIn() {
  const { signIn } = useAuthActions();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if ((auth === "github" || auth === "google") && window.opener) {
      setAuthProvider(auth);
      params.delete("auth");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
      void signIn(auth);
    }
  }, [signIn]);
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

export function SignInWithGitHub() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("github");
        } else {
          setAuthProvider("github");
          void signIn("github");
        }
      }}
    >
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> GitHub
    </Button>
  );
}
