import { isInIframe, openAuthPopup, useAppSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID,
  PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID,
} from "@/lib/publicLanding";
import {
  buildOAuthAuthPopupSearch,
  buildOAuthRedirectSearch,
  type OAuthAuthProvider,
} from "@/lib/oauthAuthRedirect";
import { useRouter } from "@tanstack/react-router";
import { Github } from "lucide-react";

export function SignInWithOAuth({
  provider,
  authReturn,
  markPublicSignupReturn = false,
}: {
  provider: OAuthAuthProvider;
  authReturn?: "dashboard";
  markPublicSignupReturn?: boolean;
}) {
  const { signInWithOAuth } = useAppSignInActions();
  const router = useRouter();
  const buildRedirectTo = () =>
    router.buildLocation({
      hash: true,
      search: (currentSearch) =>
        buildOAuthRedirectSearch(currentSearch, provider, {
          authReturn,
          markPublicSignupReturn,
        }),
      state: true,
      to: authReturn === "dashboard" ? "/" : ".",
    }).href;
  const buildPopupPath = () =>
    router.buildLocation({
      search: (currentSearch) =>
        buildOAuthAuthPopupSearch(currentSearch, provider, {
          authReturn,
          markPublicSignupReturn,
        }),
      to: authReturn === "dashboard" ? "/" : ".",
    }).href;

  let label: string;
  let testId: string;
  let icon: React.ReactNode;
  switch (provider) {
    case "google":
      label = "Continue with Google";
      testId = PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID;
      icon = null;
      break;
    case "github":
      label = "Continue with GitHub";
      testId = PUBLIC_LANDING_GITHUB_AUTH_SLOT_TEST_ID;
      icon = <Github className="mr-2 h-4 w-4 @max-[120px]:hidden" />;
      break;
    default:
      provider satisfies never;
      throw new Error("Unsupported OAuth provider.");
  }

  return (
    <Button
      data-testid={testId}
      className="h-auto min-w-0 flex-1 whitespace-normal py-2.5 @max-[200px]:leading-tight @max-[120px]:px-1.5"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup(provider, { popupPath: buildPopupPath() });
        } else {
          void Promise.resolve(signInWithOAuth(provider, buildRedirectTo())).catch(() => {
            toast({
              description: "Try again.",
              title: `Could not start ${provider === "github" ? "GitHub" : "Google"} sign-in`,
              variant: "destructive",
            });
          });
        }
      }}
    >
      {icon}
      <span className="min-w-0">{label}</span>
    </Button>
  );
}
