import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";

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

export function SignInWithGitHub() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={async () => {
        const result = await signIn("github");
        if (result.redirect && isInIframe()) {
          // The library's window.location.href redirect is blocked by
          // GitHub's CSP (frame-ancestors 'none') when running inside
          // an iframe. Open in a popup instead — the token will sync
          // back via the localStorage storage-event listener that
          // @convex-dev/auth already sets up.
          window.open(
            result.redirect.toString(),
            "github-oauth",
            "width=600,height=700,popup=true",
          );
        }
      }}
    >
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> GitHub
    </Button>
  );
}
