import { ConvexError } from "convex/values";

import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, MutationCtx } from "../_generated/server";

/**
The password sign-in identity for a normalized email. Its `authAccounts` row keys the identity by
the email, and the password component keeps the password hash by the user id.
*/
export async function readPasswordAccount(
  db: DatabaseReader,
  email: string,
): Promise<Doc<"authAccounts"> | null> {
  return await db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (query) =>
      query.eq("provider", "password").eq("providerAccountId", email),
    )
    .unique();
}

/**
Sets the password of a user's password sign-in identity and records the identity when it is new.
Only server functions create password accounts: the operator action, the dev and preview seeds, and
sign-up on a local worktree.
*/
export async function writePasswordAccount(
  ctx: MutationCtx,
  args: { email: string; password: string; userId: Id<"users"> },
): Promise<void> {
  const account = await readPasswordAccount(ctx.db, args.email);
  if (account !== null && account.userId !== args.userId) {
    throw new Error(`The password account for ${args.email} belongs to another user.`);
  }

  const result = await ctx.runMutation(components.authPassword.public.setPassword, {
    userId: args.userId,
    password: args.password,
  });
  if (!result.success) {
    const { userError } = result;
    switch (userError.error) {
      case "PASSWORD_TOO_SHORT":
        throw new ConvexError(`Password must have at least ${userError.minimumLength} characters.`);
      case "PASSWORD_TOO_LONG":
        throw new ConvexError(`Password must have at most ${userError.maximumLength} characters.`);
      case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
        throw new ConvexError("Password cannot start or end with a space.");
      case "PASSWORD_TOO_COMMON":
        throw new ConvexError("This password is too common. Choose a different password.");
      default:
        userError satisfies never;
        throw new ConvexError("This password cannot be used.");
    }
  }

  if (account === null) {
    await ctx.db.insert("authAccounts", {
      userId: args.userId,
      provider: "password",
      providerAccountId: args.email,
    });
  }
}
