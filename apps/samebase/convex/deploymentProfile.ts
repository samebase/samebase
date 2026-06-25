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
  literal("production_review_seed"),
);
export type PasswordAuthMode = Infer<typeof vPasswordAuthMode>;

const vPasswordAuthFlow = union(literal("signIn"), literal("signUp"));
export type PasswordAuthFlow = Infer<typeof vPasswordAuthFlow>;

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
  OPENAI_REVIEW_AUTH_EMAIL?: string;
  OPENAI_REVIEW_AUTH_PASSWORD?: string;
  PREVIEW_SEED_AUTH_EMAIL?: string;
  PREVIEW_SEED_AUTH_PASSWORD?: string;
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
    readTrimmedValue(env.PREVIEW_SEED_AUTH_EMAIL) !== null &&
    readTrimmedValue(env.PREVIEW_SEED_AUTH_PASSWORD) !== null
  );
}

function hasCompleteProductionReviewSeedPasswordAuth(env: DeploymentProfileEnv): boolean {
  const email = readTrimmedValue(env.OPENAI_REVIEW_AUTH_EMAIL);
  const password = readTrimmedValue(env.OPENAI_REVIEW_AUTH_PASSWORD);
  return email !== null && password !== null;
}

export function assertProductionReviewSeedPasswordAuthConfig(env: DeploymentProfileEnv): void {
  const email = readTrimmedValue(env.OPENAI_REVIEW_AUTH_EMAIL);
  const password = readTrimmedValue(env.OPENAI_REVIEW_AUTH_PASSWORD);
  if (email === null || password === null) {
    throw new Error(
      "OPENAI_REVIEW_AUTH_EMAIL and OPENAI_REVIEW_AUTH_PASSWORD must be set together",
    );
  }
}

export function assertProductionReviewPasswordEmailAllowed(args: {
  passwordAuthMode: PasswordAuthMode;
  reviewEmail: string | undefined;
  email: string;
}): void {
  if (args.passwordAuthMode !== "production_review_seed") {
    return;
  }

  const reviewEmail = readTrimmedValue(args.reviewEmail);
  if (reviewEmail === null) {
    throw new Error("Missing required environment variable: OPENAI_REVIEW_AUTH_EMAIL");
  }
  if (args.email.trim().toLowerCase() !== reviewEmail.toLowerCase()) {
    throw new Error("Password sign-in is limited to the OpenAI review account");
  }
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
    OPENAI_REVIEW_AUTH_EMAIL: env.OPENAI_REVIEW_AUTH_EMAIL,
    OPENAI_REVIEW_AUTH_PASSWORD: env.OPENAI_REVIEW_AUTH_PASSWORD,
    PREVIEW_SEED_AUTH_EMAIL: readOptionalEnv("PREVIEW_SEED_AUTH_EMAIL") ?? undefined,
    PREVIEW_SEED_AUTH_PASSWORD: readOptionalEnv("PREVIEW_SEED_AUTH_PASSWORD") ?? undefined,
    SITE_URL: readOptionalEnv("SITE_URL") ?? undefined,
  });
}

/**
 * Password auth intentionally stays narrower than the deployment profile:
 * only local worktrees, previews, and the temporary production review account
 * get seeded credentials.
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
    case "production":
      return hasCompleteProductionReviewSeedPasswordAuth(deploymentEnv)
        ? "production_review_seed"
        : "off";
    case "local_development":
    case "convex_dev":
      return "off";
    default:
      profile satisfies never;
      return "off";
  }
}

export function resolvePasswordAuthMode(profile: DeploymentProfile): PasswordAuthMode {
  return resolvePasswordAuthModeFromEnv(profile, {
    OPENAI_REVIEW_AUTH_EMAIL: env.OPENAI_REVIEW_AUTH_EMAIL,
    OPENAI_REVIEW_AUTH_PASSWORD: env.OPENAI_REVIEW_AUTH_PASSWORD,
  });
}

/**
 * Preview and production-review deployments intentionally keep password auth
 * to sign-in only. Local worktrees may still use the full sign-up path because
 * they are operator-owned.
 */
export function assertPasswordAuthFlowAllowed(
  passwordAuthMode: PasswordAuthMode,
  flow: PasswordAuthFlow,
): void {
  switch (passwordAuthMode) {
    case "preview_seed":
      if (flow === "signUp") {
        throw new Error("Preview deployments only allow password sign-in for the seeded account");
      }
      return;
    case "production_review_seed":
      if (flow === "signUp") {
        throw new Error("Production review only allows password sign-in for the review account");
      }
      return;
    case "local_worktree_seed":
    case "off":
      return;
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
