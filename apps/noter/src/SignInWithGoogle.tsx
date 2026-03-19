import { isInIframe, openAuthPopup, setAuthProvider } from "@/authClient";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { Chrome } from "lucide-react";
import { buildPathWithUpdatedQuery, setQueryParam } from "./lib/queryParams";

function buildCurrentGoogleRedirectTo() {
  return buildPathWithUpdatedQuery(window.location, (searchParams) => {
    setQueryParam(searchParams, "auth", false);
  });
}

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
            redirectTo: buildCurrentGoogleRedirectTo(),
          });
        }
      }}
    >
      <Chrome className="mr-2 h-4 w-4" /> Google
    </Button>
  );
}
