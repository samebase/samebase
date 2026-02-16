export type EnvLabel = "prod" | "dev";

const DEPLOY_KEY_ENV = "DAYTONA_CONVEX_DEPLOY_KEY";

const parseDeployKeyLabel = (raw: string | undefined): EnvLabel => {
  if (!raw) {
    throw new Error(`${DEPLOY_KEY_ENV} is required to infer the environment label.`);
  }
  const label = raw.split(":")[0]?.trim().toLowerCase() ?? "";
  if (label === "prod") {
    return "prod";
  }
  if (label === "dev" || label === "preview") {
    return "dev";
  }
  throw new Error(
    `${DEPLOY_KEY_ENV} must start with "dev:" or "prod:" (received "${label}").`,
  );
};

export const getEnvLabel = (): EnvLabel => {
  return parseDeployKeyLabel(process.env[DEPLOY_KEY_ENV]);
};
