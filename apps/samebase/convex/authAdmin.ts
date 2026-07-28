import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { assertPasswordAuthLogLevelAllowed } from "./deploymentProfile";
import { readOptionalEnv } from "./oauthUtils";

const { boolean, id, literal, null: vNull, object, string, union } = v;

const passwordAccountResolution = union(
  object({
    kind: literal("existing"),
    userId: id("users"),
  }),
  object({
    kind: literal("missing"),
  }),
);
type PasswordAccountResolution = Infer<typeof passwordAccountResolution>;

export const resolvePasswordAccount = internalQuery({
  args: {
    email: string(),
  },
  returns: passwordAccountResolution,
  handler: async (ctx, args): Promise<PasswordAccountResolution> => {
    const email = normalizeAccountEmail(args.email);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    let verifiedUserId: Id<"users"> | null = null;
    for await (const user of ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))) {
      if (user.emailVerificationTime !== undefined) {
        if (verifiedUserId !== null) {
          throw new Error(`Multiple verified users exist for ${email}`);
        }
        verifiedUserId = user._id;
      }
    }

    if (account === null) {
      return { kind: "missing" };
    }
    const accountUser = await ctx.db.get(account.userId);
    if (accountUser === null) {
      throw new Error(`Password account user does not exist for ${email}`);
    }
    if (normalizeAccountEmail(accountUser.email) !== email) {
      throw new Error(`Password account user email does not match ${email}`);
    }
    if (verifiedUserId !== null && account.userId !== verifiedUserId) {
      throw new Error(`Password account is not linked to the verified user for ${email}`);
    }

    return {
      kind: "existing",
      userId: account.userId,
    };
  },
});

export const approvePasswordAccount = internalMutation({
  args: {
    email: string(),
    expectedUserId: id("users"),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const email = normalizeAccountEmail(args.email);
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    if (account === null) {
      throw new Error(`Password account does not exist for ${email}`);
    }
    if (account.userId !== args.expectedUserId) {
      throw new Error(`Password account user changed for ${email}`);
    }

    const user = await ctx.db.get(account.userId);
    if (user === null) {
      throw new Error(`Password account user does not exist for ${email}`);
    }
    if (!user.isApproved) {
      await ctx.db.patch(user._id, { isApproved: true });
    }

    return null;
  },
});

const createOrUpdatePasswordAccountReturns = object({
  created: boolean(),
  email: string(),
});
type CreateOrUpdatePasswordAccountResult = Infer<typeof createOrUpdatePasswordAccountReturns>;

export const createOrUpdatePasswordAccount = internalAction({
  args: {
    email: string(),
    password: string(),
  },
  returns: createOrUpdatePasswordAccountReturns,
  handler: async (ctx, args): Promise<CreateOrUpdatePasswordAccountResult> => {
    assertPasswordAuthLogLevelAllowed(readOptionalEnv("AUTH_LOG_LEVEL"));
    const email = normalizeAccountEmail(args.email);
    if (args.password.length < 8) {
      throw new Error("Password must contain at least 8 characters");
    }

    const resolution: PasswordAccountResolution = await ctx.runQuery(
      internal.authAdmin.resolvePasswordAccount,
      { email },
    );
    let userId: Id<"users">;
    if (resolution.kind === "existing") {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: args.password,
        },
      });
      userId = resolution.userId;
    } else {
      const createdAccount = await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: args.password,
        },
        profile: {
          email,
          emailVerificationTime: Date.now(),
          isApproved: true,
        },
        shouldLinkViaEmail: true,
        shouldLinkViaPhone: false,
      });
      userId = createdAccount.user._id;
    }

    await ctx.runMutation(internal.authAdmin.approvePasswordAccount, {
      email,
      expectedUserId: userId,
    });
    if (resolution.kind === "existing") {
      await invalidateSessions(ctx, { userId });
    }

    return {
      created: resolution.kind === "missing",
      email,
    };
  },
});
