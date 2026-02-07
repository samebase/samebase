import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { useEffect } from "react";

export function SignInForm() {
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
        </ul>
        <SignInWithGitHub />
      </div>
    </div>
  );
}

function isInIframe() {
  try {
    return window !== window.top;
  } catch {
    return true;
  }
}

/**
 * Auto-trigger GitHub sign-in when opened as a popup with ?auth=github.
 * The popup handles the full OAuth redirect flow (not blocked by CSP
 * since it's a top-level window). After auth completes, the popup
 * auto-closes and the token syncs to the parent via localStorage.
 */
export function useAutoSignIn() {
  const { signIn } = useAuthActions();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "github" && window.opener) {
      params.delete("auth");
      const newUrl =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
      void signIn("github");
    }
  }, [signIn]);
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
          // Don't call signIn here — the library would try
          // window.location.href which breaks the iframe.
          // Instead open a popup that will auto-trigger sign-in.
          // Listen for auth tokens sent from the popup via postMessage.
          // This handles the case where iframe localStorage is
          // partitioned and can't read the popup's stored tokens.
          const handler = (event: MessageEvent) => {
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

          window.open(
            window.location.origin + "/?auth=github",
            "github-oauth",
            "width=600,height=700,popup=true",
          );
        } else {
          void signIn("github");
        }
      }}
    >
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> GitHub
    </Button>
  );
}
