export type DaytonaEnvLabel = "prod" | "dev";

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
    `${DAYTONA_DEPLOY_KEY_ENV} must start with "dev:" or "prod:" (received "${label}").`,
  );
};

export const getDaytonaEnvLabel = (): DaytonaEnvLabel => {
  // TODO: Revisit non-Daytona call sites (e.g. Codespaces display names).
  // This helper intentionally derives labels from DAYTONA_CONVEX_DEPLOY_KEY.
  // Non-Daytona flows should infer environment from CONVEX_DEPLOYMENT instead.
  return parseDaytonaDeployKeyLabel(process.env[DAYTONA_DEPLOY_KEY_ENV]);
};
