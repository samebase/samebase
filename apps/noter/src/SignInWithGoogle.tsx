import { isInIframe, openAuthPopup, useNoterSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID } from "@/lib/publicLanding";
import { markPublicDashboardAuthReturnStarted } from "@/lib/publicDashboardAuthReturn";
import { Chrome } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { buildGoogleAuthPopupSearch, buildGoogleRedirectSearch } from "./lib/googleAuthRedirect";

export function SignInWithGoogle({
  authReturn,
  visible = true,
  markPublicSignupReturn = false,
}: {
  authReturn?: "dashboard";
  visible?: boolean;
  markPublicSignupReturn?: boolean;
} = {}) {
  const { signInWithGoogle } = useNoterSignInActions();
  const router = useRouter();
  const buildCurrentGoogleRedirectTo = () =>
    router.buildLocation({
      hash: true,
      search: (currentSearch) =>
        buildGoogleRedirectSearch(currentSearch, { authReturn, markPublicSignupReturn }),
      state: true,
      to: ".",
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

  if (!visible) {
    // Preserve the landing auth slot without leaving a provider button for password managers.
    return (
      <div
        aria-hidden="true"
        data-testid={PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID}
        className="h-[42px]"
      />
    );
  }

  return (
    <Button
      data-testid={PUBLIC_LANDING_GOOGLE_AUTH_SLOT_TEST_ID}
      className="h-auto flex-1 py-2.5"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          if (authReturn === "dashboard") {
            markPublicDashboardAuthReturnStarted("popup");
          }
          openAuthPopup("google", { popupPath: buildGooglePopupPath() });
        } else {
          if (authReturn === "dashboard") {
            markPublicDashboardAuthReturnStarted("top-level");
          }
          void signInWithGoogle(buildCurrentGoogleRedirectTo());
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
