import { isInIframe, openAuthPopup, setAuthProvider } from "@/authClient";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { Chrome } from "lucide-react";
import { buildCurrentGoogleRedirectTo } from "./lib/googleAuthRedirect";

export function SignInWithGoogle({
  visible = true,
}: { visible?: boolean } = {}) {
  const { signIn } = useAuthActions();
  return (
    <Button
      aria-hidden={!visible}
      className={visible ? "flex-1" : "flex-1 invisible pointer-events-none"}
      disabled={!visible}
      variant="outline"
      type="button"
      tabIndex={visible ? undefined : -1}
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("google");
        } else {
          setAuthProvider("google");
          void signIn("google", {
            redirectTo: buildCurrentGoogleRedirectTo(
              window.location.pathname,
              window.location.search,
              window.location.hash,
            ),
          });
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
