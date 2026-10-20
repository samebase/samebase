import { Infer, v } from "convex/values";
import { normalizeAccountEmail } from "../shared/accountPresentation";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { readActiveUser } from "./identity/lifecycle";
import { readPasswordAccount, writePasswordAccount } from "./identity/passwordAccounts";

const { boolean, object, string } = v;

/** The one active user whose verified account email is `email`, or null. */
async function readVerifiedUserId(ctx: MutationCtx, email: string): Promise<Id<"users"> | null> {
  let verifiedUserId: Id<"users"> | null = null;
  for await (const user of ctx.db.query("users").withIndex("email", (q) => q.eq("email", email))) {
    const activeUser = readActiveUser(user);
    if (activeUser?.emailVerificationTime !== undefined) {
      if (verifiedUserId !== null) {
        throw new Error(`Multiple verified users exist for ${email}`);
      }
      verifiedUserId = user._id;
    }
  }
  return verifiedUserId;
}

const createOrUpdatePasswordAccountReturns = object({
  created: boolean(),
  email: string(),
});
type CreateOrUpdatePasswordAccountResult = Infer<typeof createOrUpdatePasswordAccountReturns>;

/**
Creates or rotates an operator-created password account. A new identity links to the one verified
user with the same email, or creates a verified user. The user is approved either way.
*/
export const createOrUpdatePasswordAccount = internalMutation({
  args: {
    email: string(),
    password: string(),
  },
  returns: createOrUpdatePasswordAccountReturns,
  handler: async (ctx, args): Promise<CreateOrUpdatePasswordAccountResult> => {
    const email = normalizeAccountEmail(args.email);
    const [account, verifiedUserId] = await Promise.all([
      readPasswordAccount(ctx.db, email),
      readVerifiedUserId(ctx, email),
    ]);

    let userId: Id<"users">;
    if (account !== null) {
      const accountUser = await ctx.db.get(account.userId);
      if (accountUser === null) {
        throw new Error(`Password account user does not exist for ${email}`);
      }
      const activeAccountUser = readActiveUser(accountUser);
      if (activeAccountUser === null) {
        throw new Error(`Password account user is not active for ${email}`);
      }
      if (normalizeAccountEmail(activeAccountUser.email) !== email) {
        throw new Error(`Password account user email does not match ${email}`);
      }
      if (verifiedUserId !== null && account.userId !== verifiedUserId) {
        throw new Error(`Password account is not linked to the verified user for ${email}`);
      }
      userId = account.userId;
    } else {
      userId =
        verifiedUserId ??
        (await ctx.db.insert("users", {
          state: "active",
          email,
          emailVerificationTime: Date.now(),
        }));
    }

    await writePasswordAccount(ctx, { email, password: args.password, userId });
    await ctx.db.patch(userId, { isApproved: true });

    return {
      created: account === null,
      email,
    };
  },
});
