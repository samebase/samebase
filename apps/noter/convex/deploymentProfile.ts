import { Infer, v } from "convex/values";
import { query } from "./_generated/server";
import { readOptionalEnv } from "./oauthUtils";

const { literal, object, union } = v;

const deploymentProfileValidator = union(
  object({ kind: literal("local_development") }),
  object({ kind: literal("local_worktree") }),
  object({ kind: literal("preview") }),
  object({ kind: literal("development") }),
  object({ kind: literal("production") }),
);
export type DeploymentProfile = Infer<typeof deploymentProfileValidator>;

const passwordAuthModeValidator = union(
  literal("off"),
  literal("local_worktree_seed"),
  literal("preview_seed"),
);
export type PasswordAuthMode = Infer<typeof passwordAuthModeValidator>;

const publicDeploymentAuthPolicyValidator = object({
  deploymentProfile: deploymentProfileValidator,
  passwordAuthMode: passwordAuthModeValidator,
});
export type PublicDeploymentAuthPolicy = Infer<
  typeof publicDeploymentAuthPolicyValidator
>;

type DeploymentProfileEnv = {
  CONVEX_CLOUD_URL?: string;
  CONVEX_DEPLOYMENT?: string;
  CONVEX_SITE_URL?: string;
  DAYTONA_CONVEX_DEPLOY_KEY?: string;
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
    .filter((value): value is string => value !== null);
  return runtimeUrls.some(isLocalhostUrl);
}

function readDaytonaDeployKeySpecifier(
  env: DeploymentProfileEnv,
): string | null {
  const rawKey = readTrimmedValue(env.DAYTONA_CONVEX_DEPLOY_KEY);
  if (rawKey === null) {
    return null;
  }
  const [deploymentSpecifier] = rawKey.split("|", 1);
  return readTrimmedValue(deploymentSpecifier);
}

function readDeploymentSpecifier(env: DeploymentProfileEnv): string | null {
  const rawDeployment = readTrimmedValue(env.CONVEX_DEPLOYMENT);
  return rawDeployment ?? readDaytonaDeployKeySpecifier(env);
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
export function resolveDeploymentProfileFromEnv(
  env: DeploymentProfileEnv,
): DeploymentProfile {
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
        return { kind: "development" };
      case "prod":
        return { kind: "production" };
      case null:
        break;
      default:
        break;
    }
  }

  if (hasLocalRuntimeUrl(env)) {
    return { kind: "local_development" };
  }

  // Unknown deployment specifiers should fail closed instead of widening
  // password auth or sandbox-only integrations unexpectedly.
  return { kind: "production" };
}

export function resolveDeploymentProfile(): DeploymentProfile {
  return resolveDeploymentProfileFromEnv({
    CONVEX_CLOUD_URL: readOptionalEnv("CONVEX_CLOUD_URL") ?? undefined,
    CONVEX_DEPLOYMENT: readOptionalEnv("CONVEX_DEPLOYMENT") ?? undefined,
    CONVEX_SITE_URL: readOptionalEnv("CONVEX_SITE_URL") ?? undefined,
    DAYTONA_CONVEX_DEPLOY_KEY:
      readOptionalEnv("DAYTONA_CONVEX_DEPLOY_KEY") ?? undefined,
    SITE_URL: readOptionalEnv("SITE_URL") ?? undefined,
  });
}

/**
 * Password auth intentionally stays narrower than the deployment profile:
 * only local worktrees and preview deployments get seeded credentials.
 */
export function resolvePasswordAuthMode(
  profile: DeploymentProfile,
): PasswordAuthMode {
  switch (profile.kind) {
    case "local_worktree":
      return "local_worktree_seed";
    case "preview":
      return "preview_seed";
    case "local_development":
    case "development":
    case "production":
      return "off";
    default:
      profile satisfies never;
      return "off";
  }
}

export const getPublicDeploymentAuthPolicy = query({
  args: {},
  returns: publicDeploymentAuthPolicyValidator,
  handler: async (): Promise<PublicDeploymentAuthPolicy> => {
    const deploymentProfile = resolveDeploymentProfile();
    return {
      deploymentProfile,
      passwordAuthMode: resolvePasswordAuthMode(deploymentProfile),
    };
  },
});
