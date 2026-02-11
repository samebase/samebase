export type EnvLabel = "prod" | "dev";

export const getEnvLabel = (): EnvLabel => {
  const isProd = process.env.CONVEX_CLOUD_URL?.includes(".convex.cloud");
  return isProd ? "prod" : "dev";
};
