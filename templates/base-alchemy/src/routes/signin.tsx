import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { GoogleSignIn } from "#components/GoogleSignIn";
import { GuestSignIn } from "#components/GuestSignIn";

export const Route = createFileRoute("/signin")({
  loader: async ({ context }) => {
    // @ts-expect-error convexQuery always sets queryFn, but its type allows undefined there, which `query` rejects under exactOptionalPropertyTypes.
    await context.queryClient.query(convexQuery(api.hub.googleSignInEnabled, {}));
  },
  component: SignInPage,
});

function SignInPage() {
  const { data: googleSignInEnabled } = useSuspenseQuery(
    convexQuery(api.hub.googleSignInEnabled, {}),
  );

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <h1 className="text-lg">Sign in</h1>
      {googleSignInEnabled ? <GoogleSignIn next="/account" /> : null}
      <GuestSignIn next="/account" />
    </main>
  );
}
