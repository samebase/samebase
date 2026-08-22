import { Infer, v } from "convex/values";
import { notEmpty } from "@samebase/dependent/main";
import { query } from "./functions";
import { env } from "./_generated/server";
import { readOptionalEnv } from "./oauthUtils";

const { literal, object, union } = v;

export const vDeploymentProfile = union(
  object({ kind: literal("local_development") }),
  object({ kind: literal("local_worktree") }),
  object({ kind: literal("preview") }),
  object({ kind: literal("convex_dev") }),
  object({ kind: literal("production") }),
);
export type DeploymentProfile = Infer<typeof vDeploymentProfile>;

export const vPasswordAuthMode = union(
  literal("off"),
  literal("local_worktree_seed"),
  literal("preview_seed"),
  literal("manual"),
);
export type PasswordAuthMode = Infer<typeof vPasswordAuthMode>;

const vPublicDeploymentAuthPolicy = object({
  deploymentProfile: vDeploymentProfile,
  passwordAuthMode: vPasswordAuthMode,
});
export type PublicDeploymentAuthPolicy = Infer<typeof vPublicDeploymentAuthPolicy>;

type DeploymentProfileEnv = {
  CONVEX_AGENT_MODE?: string;
  CONVEX_CLOUD_URL?: string;
  CONVEX_DEPLOYMENT?: string;
  CONVEX_SITE_URL?: string;
  PASSWORD_AUTH_ENABLED?: string;
  DEV_SEED_AUTH_EMAIL?: string;
  DEV_SEED_AUTH_PASSWORD?: string;
  SITE_URL?: string;
};

function readTrimmedValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function hasLocalRuntimeUrl(env: DeploymentProfileEnv): boolean {
  const runtimeUrls = [env.CONVEX_CLOUD_URL, env.CONVEX_SITE_URL, env.SITE_URL]
    .map(readTrimmedValue)
    .filter(notEmpty);
  return runtimeUrls.some(isLocalhostUrl);
}

function readAgentMode(env: DeploymentProfileEnv): string | null {
  return readTrimmedValue(env.CONVEX_AGENT_MODE)?.toLowerCase() ?? null;
}

function hasPreviewSeedPasswordAuth(env: DeploymentProfileEnv): boolean {
  return (
    readTrimmedValue(env.DEV_SEED_AUTH_EMAIL) !== null &&
    readTrimmedValue(env.DEV_SEED_AUTH_PASSWORD) !== null
  );
}

function hasManualPasswordAuth(env: DeploymentProfileEnv): boolean {
  return env.PASSWORD_AUTH_ENABLED === "true";
}

function readDeploymentSpecifier(env: DeploymentProfileEnv): string | null {
  return readTrimmedValue(env.CONVEX_DEPLOYMENT);
}

function parseDeploymentSpecifier(rawSpecifier: string): {
  name: string;
  prefix: string | null;
} {
  const normalized = rawSpecifier.trim();
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex === -1) {
    return {
      name: normalized,
      prefix: null,
    };
  }
  const prefix = normalized.slice(0, separatorIndex).trim().toLowerCase();
  const name = normalized.slice(separatorIndex + 1).trim();
  return {
    name,
    prefix: prefix.length > 0 ? prefix : null,
  };
}

function isAnonymousLikeDeploymentSpecifier(rawSpecifier: string): boolean {
  const { name, prefix } = parseDeploymentSpecifier(rawSpecifier);
  if (prefix === "anonymous") {
    return true;
  }
  return name.startsWith("anonymous-") || name.startsWith("local-");
}

/**
 * Classify the current runtime into the deployment buckets the app actually
 * cares about, rather than letting each subsystem infer its own environment.
 */
export function resolveDeploymentProfileFromEnv(env: DeploymentProfileEnv): DeploymentProfile {
  if (readAgentMode(env) === "anonymous") {
    return { kind: "local_worktree" };
  }

  const deploymentSpecifier = readDeploymentSpecifier(env);
  if (deploymentSpecifier !== null) {
    if (isAnonymousLikeDeploymentSpecifier(deploymentSpecifier)) {
      return { kind: "local_worktree" };
    }

    const { prefix } = parseDeploymentSpecifier(deploymentSpecifier);
    switch (prefix) {
      case "local":
        return { kind: "local_development" };
      case "preview":
        return { kind: "preview" };
      case "dev":
        return { kind: "convex_dev" };
      case "prod":
        return { kind: "production" };
      case null:
      default:
        // Unknown or missing prefixes should fall through to the remaining
        // runtime heuristics instead of being treated as a real deployment kind.
        break;
    }
  }

  if (hasLocalRuntimeUrl(env)) {
    return { kind: "local_development" };
  }

  // Preview deployments do not reliably expose CONVEX_DEPLOYMENT inside auth
  // and seed functions yet, so keep preview password-auth rollout tied to the
  // preview seed env pair until we adopt one explicit deployment-profile env.
  if (hasPreviewSeedPasswordAuth(env)) {
    return { kind: "preview" };
  }

  // Unknown deployment specifiers should fail closed to the shared non-prod
  // deployment. That keeps billing/webhook traffic on sandbox integrations
  // instead of accidentally widening to production.
  return { kind: "convex_dev" };
}

export function resolveDeploymentProfile(): DeploymentProfile {
  return resolveDeploymentProfileFromEnv({
    CONVEX_AGENT_MODE: readOptionalEnv("CONVEX_AGENT_MODE") ?? undefined,
    CONVEX_CLOUD_URL: readOptionalEnv("CONVEX_CLOUD_URL") ?? undefined,
    CONVEX_DEPLOYMENT: readOptionalEnv("CONVEX_DEPLOYMENT") ?? undefined,
    CONVEX_SITE_URL: readOptionalEnv("CONVEX_SITE_URL") ?? undefined,
    DEV_SEED_AUTH_EMAIL: readOptionalEnv("DEV_SEED_AUTH_EMAIL") ?? undefined,
    DEV_SEED_AUTH_PASSWORD: readOptionalEnv("DEV_SEED_AUTH_PASSWORD") ?? undefined,
    SITE_URL: readOptionalEnv("SITE_URL") ?? undefined,
  });
}

/**
 * Password auth intentionally stays narrower than the deployment profile:
 * local worktrees and previews use seeded accounts, while other deployments
 * require the explicit manual-account switch.
 */
export function resolvePasswordAuthModeFromEnv(
  profile: DeploymentProfile,
  deploymentEnv: DeploymentProfileEnv,
): PasswordAuthMode {
  switch (profile.kind) {
    case "local_worktree":
      return "local_worktree_seed";
    case "preview":
      return "preview_seed";
    case "local_development":
    case "convex_dev":
    case "production":
      return hasManualPasswordAuth(deploymentEnv) ? "manual" : "off";
    default:
      profile satisfies never;
      return "off";
  }
}

export function resolvePasswordAuthMode(profile: DeploymentProfile): PasswordAuthMode {
  return resolvePasswordAuthModeFromEnv(profile, {
    PASSWORD_AUTH_ENABLED: env.PASSWORD_AUTH_ENABLED,
  });
}

export function assertPasswordAuthLogLevelAllowed(authLogLevel: string | null): void {
  if (authLogLevel === "DEBUG") {
    throw new Error("Password authentication is unavailable while AUTH_LOG_LEVEL is DEBUG");
  }
}

/**
 * Preview and manual-account deployments keep password auth to sign-in only.
 * Local worktrees may still use the full sign-up path because they are
 * operator-owned.
 */
export function assertPasswordAuthFlowAllowed(
  passwordAuthMode: PasswordAuthMode,
  flow: string,
): void {
  switch (passwordAuthMode) {
    case "preview_seed":
      if (flow !== "signIn") {
        throw new Error("Preview deployments only allow password sign-in for the seeded account");
      }
      return;
    case "manual":
      if (flow !== "signIn") {
        throw new Error(
          "Manual password authentication only allows sign-in for operator-created accounts",
        );
      }
      return;
    case "local_worktree_seed":
      if (flow === "signIn" || flow === "signUp") {
        return;
      }
      throw new Error("Local worktrees only allow password sign-in and sign-up");
    case "off":
      throw new Error("Password authentication is disabled");
    default:
      passwordAuthMode satisfies never;
  }
}

export const getPublicDeploymentAuthPolicy = query({
  access: "access_public",
  args: {},
  returns: vPublicDeploymentAuthPolicy,
  handler: async (): Promise<PublicDeploymentAuthPolicy> => {
    const deploymentProfile = resolveDeploymentProfile();
    return {
      deploymentProfile,
      passwordAuthMode: resolvePasswordAuthMode(deploymentProfile),
    };
  },
});
