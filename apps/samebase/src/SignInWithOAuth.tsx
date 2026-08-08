import { isInIframe, openAuthPopup, useAppSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
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
import { Chrome, Github } from "lucide-react";

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
        buildOAuthRedirectSearch(currentSearch, provider, { markPublicSignupReturn }),
      state: true,
      to: authReturn === "dashboard" ? DASHBOARD_ROUTE : ".",
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
      icon = <Chrome className="mr-2 h-4 w-4 @max-[120px]:hidden" />;
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
          void signInWithOAuth(provider, buildRedirectTo());
        }
      }}
    >
      {icon}
      <span className="min-w-0">{label}</span>
    </Button>
  );
}
