import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { isAllowedEmail } from "./users";

const DEV_SEED_EMAIL = "nicu@noter.md";
const DEV_SEED_PASSWORD = "pass1234";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isMissingPasswordAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("does not exist") ||
      error.message.includes("not found"))
  );
}

export const seedPasswordAccount = internalAction({
  args: {},
  returns: v.object({
    email: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx) => {
    const email = normalizeEmail(DEV_SEED_EMAIL);
    const password = DEV_SEED_PASSWORD;

    if (!isAllowedEmail(email)) {
      throw new Error("Seed email is not allowlisted");
    }

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
      });
      return { email, created: false };
    } catch (error) {
      if (!isMissingPasswordAccountError(error)) {
        throw error;
      }
    }

    await createAccount(ctx, {
      provider: "password",
      account: {
        id: email,
        secret: password,
      },
      profile: {
        email,
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });

    return { email, created: true };
  },
});
