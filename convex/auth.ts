import GitHub from "@auth/core/providers/github";
import Resend from "@auth/core/providers/resend";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: "repo user user:email",
        },
      },
    }),
    Resend,
  ],
});
