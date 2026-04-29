import { isInIframe, openAuthPopup, useNoterSignInActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { Chrome } from "lucide-react";
import { buildCurrentGoogleRedirectTo } from "./lib/googleAuthRedirect";

export function SignInWithGoogle({
  visible = true,
  markPublicSignupReturn = false,
}: {
  visible?: boolean;
  markPublicSignupReturn?: boolean;
} = {}) {
  const { signInWithGoogle } = useNoterSignInActions();
  return (
    <Button
      aria-hidden={!visible}
      className={
        visible
          ? "visible h-auto flex-1 opacity-100 py-2.5 transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none"
          : "invisible h-auto flex-1 pointer-events-none opacity-0 py-2.5 transition-[opacity,visibility] duration-150 ease-out disabled:opacity-0 motion-reduce:transition-none"
      }
      disabled={!visible}
      variant="outline"
      type="button"
      tabIndex={visible ? undefined : -1}
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("google", { markPublicSignupReturn });
        } else {
          void signInWithGoogle(
            buildCurrentGoogleRedirectTo(
              window.location.pathname,
              window.location.search,
              window.location.hash,
              { markPublicSignupReturn },
            ),
          );
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
