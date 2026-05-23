import { isInIframe, openAuthPopup, useNoterSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { Chrome } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { buildGoogleAuthPopupSearch, buildGoogleRedirectSearch } from "./lib/googleAuthRedirect";

export function SignInWithGoogle({
  visible = true,
  markPublicSignupReturn = false,
}: {
  visible?: boolean;
  markPublicSignupReturn?: boolean;
} = {}) {
  const { signInWithGoogle } = useNoterSignInActions();
  const router = useRouter();
  const buildCurrentGoogleRedirectTo = () =>
    router.buildLocation({
      hash: true,
      search: (currentSearch) =>
        buildGoogleRedirectSearch(currentSearch, { markPublicSignupReturn }),
      state: true,
      to: ".",
    }).href;
  const buildGooglePopupPath = () =>
    router.buildLocation({
      search: (currentSearch) =>
        buildGoogleAuthPopupSearch(currentSearch, "google", {
          markPublicSignupReturn,
        }),
      to: "/",
    }).href;

  if (!visible) {
    // Preserve the landing auth slot without leaving a provider button for password managers.
    return <div aria-hidden="true" className="h-[42px] flex-1" />;
  }

  return (
    <Button
      className="h-auto flex-1 py-2.5"
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
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
