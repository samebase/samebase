import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile, resolvePasswordAuthMode } from "./deploymentProfile";
import { internalAction, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { readOptionalEnv } from "./oauthUtils";
import { normalizeAccountEmail } from "../shared/accountPresentation";

const { boolean, id, literal, null: vNull, object, string, union } = v;

function readSeedValue(envName: string): string | undefined {
  const value = readOptionalEnv(envName);
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readRequiredSeedPasswordAccountConfig(args: {
  emailEnvName: string;
  passwordEnvName: string;
}): {
  email: string;
  password: string;
} {
  const email = readSeedValue(args.emailEnvName);
  const password = readSeedValue(args.passwordEnvName);
  if (email === undefined && password === undefined) {
    throw new Error(`${args.emailEnvName} and ${args.passwordEnvName} are required`);
  }
  if (email === undefined || password === undefined) {
    throw new Error(
      email === undefined
        ? `${args.emailEnvName} is required when ${args.passwordEnvName} is set`
        : `${args.passwordEnvName} is required when ${args.emailEnvName} is set`,
    );
  }
  return {
    email: normalizeAccountEmail(email),
    password,
  };
}

/**
 * Password account seeding follows the explicit deployment profile instead of
 * inferring preview-vs-local behavior from env var presence alone.
 */
function readSeedPasswordAccountConfig(): {
  email: string;
  password: string;
} {
  const deploymentProfile = resolveDeploymentProfile();
  const passwordAuthMode = resolvePasswordAuthMode(deploymentProfile);

  switch (passwordAuthMode) {
    case "local_worktree_seed":
      return {
        email: normalizeAccountEmail(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL),
        password: LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
      };
    case "preview_seed":
      return readRequiredSeedPasswordAccountConfig({
        emailEnvName: "PREVIEW_SEED_AUTH_EMAIL",
        passwordEnvName: "PREVIEW_SEED_AUTH_PASSWORD",
      });
    case "manual":
    case "off":
      throw new Error("Password account seeding is disabled for this deployment profile");
    default:
      passwordAuthMode satisfies never;
      throw new Error("Unsupported password auth mode");
  }
}

export const approveSeedPasswordAccount = internalMutation({
  args: {
    userId: id("users"),
  },
  returns: vNull(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error(`Cannot approve missing seed user ${args.userId}`);
    }
    // Seeded preview/local password accounts must skip the pending access gate so
    // operators do not need a parallel code-side allowlist for dev access.
    if (user.isApproved !== true) {
      await ctx.db.patch(args.userId, { isApproved: true });
    }
    return null;
  },
});

const seedPasswordAccountUserResolution = union(
  object({
    kind: literal("existing"),
    userId: id("users"),
  }),
  object({
    kind: literal("missing"),
  }),
);
type SeedPasswordAccountUserResolution = Infer<typeof seedPasswordAccountUserResolution>;

export const resolveSeedPasswordAccountUser = internalMutation({
  args: {
    email: string(),
  },
  returns: seedPasswordAccountUserResolution,
  handler: async (ctx, args): Promise<SeedPasswordAccountUserResolution> => {
    const email = normalizeAccountEmail(args.email);
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .take(2);
    if (accounts.length > 1) {
      throw new Error(`Multiple password auth accounts exist for ${email}`);
    }
    if (accounts.length === 0) {
      return { kind: "missing" };
    }
    return { kind: "existing", userId: accounts[0].userId };
  },
});

const seedPasswordAccountReturns = object({
  email: string(),
  created: boolean(),
});
type SeedPasswordAccountResult = Infer<typeof seedPasswordAccountReturns>;

export const seedPasswordAccount = internalAction({
  args: {},
  returns: seedPasswordAccountReturns,
  handler: async (ctx): Promise<SeedPasswordAccountResult> => {
    const { email, password } = readSeedPasswordAccountConfig();

    let created = false;
    let userId: Id<"users">;
    const resolution: SeedPasswordAccountUserResolution = await ctx.runMutation(
      internal.devAuth.resolveSeedPasswordAccountUser,
      {
        email,
      },
    );
    if (resolution.kind === "existing") {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
      });
      userId = resolution.userId;
    } else {
      const createdAccount = await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: password,
        },
        profile: {
          email,
          emailVerificationTime: Date.now(),
        },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      });
      userId = createdAccount.user._id;
      created = true;
    }

    await ctx.runMutation(internal.devAuth.approveSeedPasswordAccount, { userId });

    return { email, created };
  },
});
