import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";
import { isAdminUser } from "./users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: "repo user user:email",
        },
      },

      profile: (profile, tokens) => {
        console.log("profile", profile, tokens);

        const value = {
          id: profile.id.toString(),
          // login: profile.login,
          name: profile.name,
          email: profile.email,
          image: profile.avatar_url,

          githubUsername: profile.login,
          githubAccessToken: tokens.access_token,
          githubRefreshToken: tokens.refresh_token,
          githubExpiresAt: tokens.expires_at,
        };
        console.log("value", value);
        return value;
      },
    }),
  ],

  callbacks: {
    // createOrUpdateUser: async (_ctx, args) => {
    //   const { profile } = args;
    //   console.log("createOrUpdateUser", args);
    //   return {
    //     userId: args.existingUserId,
    //     name: profile.name,
    //     email: profile.email,
    //     provider: "github",
    //     providerAccountId: "123",
    //     // remove accessToken/refreshToken here to avoid schema error
    //   };
    // },
    // afterUserCreatedOrUpdated: async (ctx, args) => {
    //   console.log(ctx, args);
    // },
  },
});
