import { isInIframe, openAuthPopup, useAppSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID } from "@/lib/publicLanding";
import { Chrome } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { buildGoogleAuthPopupSearch, buildGoogleRedirectSearch } from "./lib/googleAuthRedirect";

export function SignInWithGoogle({
  authReturn,
  markPublicSignupReturn = false,
}: {
  authReturn?: "dashboard" | undefined;
  markPublicSignupReturn?: boolean;
} = {}) {
  const { signInWithGoogle } = useAppSignInActions();
  const router = useRouter();
  const buildCurrentGoogleRedirectTo = () =>
    router.buildLocation({
      hash: true,
      search: (currentSearch) =>
        buildGoogleRedirectSearch(currentSearch, { markPublicSignupReturn }),
      state: true,
      to: authReturn === "dashboard" ? DASHBOARD_ROUTE : ".",
    }).href;
  const buildGooglePopupPath = () =>
    router.buildLocation({
      search: (currentSearch) =>
        buildGoogleAuthPopupSearch(currentSearch, "google", {
          authReturn,
          markPublicSignupReturn,
        }),
      to: authReturn === "dashboard" ? "/" : ".",
    }).href;

  return (
    <Button
      data-testid={PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID}
      className="h-auto min-w-0 flex-1 whitespace-normal py-2.5 @max-[200px]:leading-tight @max-[120px]:px-1.5"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("google", { popupPath: buildGooglePopupPath() });
        } else {
          void signInWithGoogle(buildCurrentGoogleRedirectTo());
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4 @max-[120px]:hidden" />
      <span className="min-w-0">Continue with Google</span>
    </Button>
  );
}
