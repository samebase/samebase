import { useOauth, useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { SignedIn } from "@samebase/convex-auth-tanstack-start";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "#components/ui/button";

/**
 * Starts Google sign-in through the identity hub. The hub sends the browser back to this page, which
 * the server renders without a session. The provider finishes the sign-in there, and `SignedIn`
 * then opens `next`. A gated page cannot be the way back: its server redirect drops the code.
 */
export function GoogleSignIn({ next }: { next: string }) {
  const { signIn } = useOauthSignIn({
    providerName: "hub",
    startSignIn: api.auth.startSignInWithHub,
    completeSignIn: api.auth.completeSignInWithHub,
  });
  const { flowError } = useOauth();
  const [isPending, setIsPending] = useState(false);
  const [startFailed, setStartFailed] = useState(false);

  const continueWithGoogle = () => {
    setStartFailed(false);
    setIsPending(true);
    void signIn().then((result) => {
      // After a good start the browser is leaving the page.
      if (result.status === "error") {
        setStartFailed(true);
        setIsPending(false);
      }
    });
  };

  return (
    <>
      <Button type="button" disabled={isPending} onClick={continueWithGoogle}>
        Sign in with Google
      </Button>
      {flowError || startFailed ? (
        <p className="text-destructive text-sm" role="alert">
          Could not sign in with Google
        </p>
      ) : null}
      <SignedIn>
        <OpenPage path={next} />
      </SignedIn>
    </>
  );
}

/** A document load, so the server renders the page from the new cookie, as GuestSignIn does. */
function OpenPage({ path }: { path: string }) {
  useEffect(() => {
    location.assign(path);
  }, [path]);
  return null;
}
