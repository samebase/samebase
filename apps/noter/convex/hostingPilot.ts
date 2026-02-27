const RAILWAY_HOSTING_PILOT_ENV = "RAILWAY_HOSTING_PILOT_ENABLED";

function parseBooleanEnv(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function isRailwayHostingPilotEnabled(): boolean {
  return parseBooleanEnv(process.env[RAILWAY_HOSTING_PILOT_ENV]);
}
