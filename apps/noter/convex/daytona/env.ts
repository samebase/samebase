import { toSafeRepoName } from "../repoName";

export type DaytonaEnvLabel = "prod" | "dev";

const CONVEX_DEPLOYMENT_ENV = "CONVEX_DEPLOYMENT";
const DAYTONA_DEPLOY_KEY_ENV = "DAYTONA_CONVEX_DEPLOY_KEY";

const parseDaytonaDeployKeyLabel = (
  raw: string | undefined,
): DaytonaEnvLabel => {
  if (!raw) {
    throw new Error(
      `${DAYTONA_DEPLOY_KEY_ENV} is required to infer the Daytona environment label.`,
    );
  }
  const label = raw.split(":")[0]?.trim().toLowerCase() ?? "";
  if (label === "prod") {
    return "prod";
  }
  if (label === "dev" || label === "preview") {
    return "dev";
  }
  throw new Error(
    `${DAYTONA_DEPLOY_KEY_ENV} must start with "dev:", "preview:", or "prod:" (received "${label}").`,
  );
};

export const getDaytonaEnvLabel = (): DaytonaEnvLabel => {
  // TODO: Revisit non-Daytona call sites (e.g. Codespaces display names).
  // This helper intentionally derives labels from DAYTONA_CONVEX_DEPLOY_KEY.
  // Non-Daytona flows should infer environment from CONVEX_DEPLOYMENT instead.
  return parseDaytonaDeployKeyLabel(process.env[DAYTONA_DEPLOY_KEY_ENV]);
};

function readDaytonaDeployKeySpecifier(): string | null {
  const daytonaDeployKey = process.env[DAYTONA_DEPLOY_KEY_ENV]?.trim() ?? "";
  if (daytonaDeployKey.length === 0) {
    return null;
  }

  const [deploymentSpecifier] = daytonaDeployKey.split("|", 1);
  const normalized = deploymentSpecifier.trim();
  return normalized.length > 0 ? normalized : null;
}

function isAnonymousLikeDeploymentSpecifier(
  rawDeploymentSpecifier: string,
): boolean {
  const normalized = rawDeploymentSpecifier.trim().toLowerCase();
  return (
    normalized.startsWith("local-") ||
    normalized.startsWith("anonymous-") ||
    normalized.startsWith("local:") ||
    normalized.startsWith("anonymous:")
  );
}

function readDaytonaDeploymentSpecifier(): string | null {
  const daytonaDeployKeySpecifier = readDaytonaDeployKeySpecifier();
  const convexDeployment = process.env[CONVEX_DEPLOYMENT_ENV]?.trim() ?? "";
  if (convexDeployment.length === 0) {
    return daytonaDeployKeySpecifier;
  }
  if (
    isAnonymousLikeDeploymentSpecifier(convexDeployment) &&
    daytonaDeployKeySpecifier !== null
  ) {
    return daytonaDeployKeySpecifier;
  }
  return convexDeployment;
}

function parseDaytonaLabelFromDeploymentSpecifier(
  rawDeploymentSpecifier: string,
): DaytonaEnvLabel {
  const normalized = rawDeploymentSpecifier.trim().toLowerCase();
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex === -1) {
    return "dev";
  }
  const label = normalized.slice(0, separatorIndex);
  if (label === "prod") {
    return "prod";
  }
  return "dev";
}

function readDaytonaDeploymentName(
  rawDeploymentSpecifier: string | null,
): string | null {
  if (rawDeploymentSpecifier === null) {
    return null;
  }

  const normalized = rawDeploymentSpecifier.trim();
  if (normalized.length === 0) {
    return null;
  }
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex === -1) {
    return normalized;
  }

  const deploymentName = normalized.slice(separatorIndex + 1).trim();
  return deploymentName.length > 0 ? deploymentName : null;
}

export const getDaytonaResourceScope = (): string => {
  const deploymentSpecifier = readDaytonaDeploymentSpecifier();
  if (deploymentSpecifier === null) {
    return getDaytonaEnvLabel();
  }

  const envLabel =
    parseDaytonaLabelFromDeploymentSpecifier(deploymentSpecifier);
  if (envLabel === "prod") {
    return envLabel;
  }

  const deploymentName = readDaytonaDeploymentName(deploymentSpecifier);
  if (deploymentName === null) {
    return envLabel;
  }

  const scopedName = toSafeRepoName(`${envLabel}-${deploymentName}`);
  return scopedName.length > 0 ? scopedName : envLabel;
};
