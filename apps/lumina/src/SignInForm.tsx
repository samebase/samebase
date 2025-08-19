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

export function SignInWithGitHub() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={() => void signIn("github")}
    >
      <GitHubLogoIcon className="mr-2 h-4 w-4" /> GitHub
    </Button>
  );
}
