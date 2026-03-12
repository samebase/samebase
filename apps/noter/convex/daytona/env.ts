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

function readDaytonaDeploymentSpecifier(): string | null {
  const convexDeployment = process.env[CONVEX_DEPLOYMENT_ENV]?.trim() ?? "";
  if (convexDeployment.length > 0) {
    return convexDeployment;
  }

  const daytonaDeployKey = process.env[DAYTONA_DEPLOY_KEY_ENV]?.trim() ?? "";
  if (daytonaDeployKey.length === 0) {
    return null;
  }

  const [deploymentSpecifier] = daytonaDeployKey.split("|", 1);
  const normalized = deploymentSpecifier.trim();
  return normalized.length > 0 ? normalized : null;
}

function readDaytonaDeploymentName(
  rawDeploymentSpecifier: string | null,
): string | null {
  if (rawDeploymentSpecifier === null) {
    return null;
  }

  const [_, ...rest] = rawDeploymentSpecifier.split(":");
  if (rest.length === 0) {
    return null;
  }

  const deploymentName = rest.join(":").trim();
  return deploymentName.length > 0 ? deploymentName : null;
}

export const getDaytonaResourceScope = (): string => {
  const envLabel = getDaytonaEnvLabel();
  if (envLabel === "prod") {
    return envLabel;
  }

  const deploymentName = readDaytonaDeploymentName(
    readDaytonaDeploymentSpecifier(),
  );
  if (deploymentName === null) {
    return envLabel;
  }

  const scopedName = toSafeRepoName(`${envLabel}-${deploymentName}`);
  return scopedName.length > 0 ? scopedName : envLabel;
};
