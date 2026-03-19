import { isInIframe, openAuthPopup, setAuthProvider } from "@/authClient";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { Chrome } from "lucide-react";
import { buildCurrentGoogleRedirectTo } from "./lib/googleAuthRedirect";

export function SignInWithGoogle() {
  const { signIn } = useAuthActions();
  return (
    <Button
      className="flex-1"
      variant="outline"
      type="button"
      onClick={() => {
        if (isInIframe()) {
          openAuthPopup("google");
        } else {
          setAuthProvider("google");
          void signIn("google", {
            redirectTo: buildCurrentGoogleRedirectTo(window.location),
          });
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
