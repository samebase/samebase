import {
  createAccount,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { readOptionalEnv } from "./oauthUtils";
import { isAllowedEmail } from "./users";

function isFlagEnabled(key: string): boolean {
  const value = readOptionalEnv(key);
  return value !== null && value.toLowerCase() === "true";
}

function readRequiredSeedValue(key: string): string {
  const value = readOptionalEnv(key);
  if (value === null) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isMissingPasswordAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("because it does not exist")
  );
}

export const seedPasswordAccount = action({
  args: {},
  returns: v.object({
    email: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx) => {
    if (!isFlagEnabled("AUTH_ENABLE_PASSWORD")) {
      throw new Error("Password auth seeding is disabled");
    }

    const email = normalizeEmail(readRequiredSeedValue("AUTH_SEED_EMAIL"));
    const password = readRequiredSeedValue("AUTH_SEED_PASSWORD");

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
