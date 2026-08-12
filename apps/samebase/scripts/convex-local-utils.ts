import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { notEmpty } from "@samebase/dependent/main";
import { normalizeEnvValue } from "./normalizeEnvValue.ts";

const LOCAL_CONVEX_HOSTS = new Set(["127.0.0.1", "localhost"]);
export const DEFAULT_LOCAL_SITE_PORT = 5173;
const getLocalDevOriginStatePath = (cwd = process.cwd()) =>
  path.join(cwd, "node_modules", ".cache", "samebase-local-dev-origin.json");

export const readEnvFile = (cwd: string = process.cwd()): Partial<Record<string, string>> => {
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const contents = fs.readFileSync(envPath, "utf8");

  const env: Partial<Record<string, string>> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    if (!key) {
      continue;
    }
    env[key] = normalizeEnvValue(rest.join("=")) ?? "";
  }
  return env;
};

export const usesLocalConvexDeployment = (cwd: string = process.cwd()): boolean => {
  const env = readEnvFile(cwd);
  const rawUrl = normalizeEnvValue(env.CONVEX_URL ?? env.VITE_CONVEX_URL);
  if (rawUrl === undefined) {
    return false;
  }

  try {
    const deploymentUrl = new URL(rawUrl);
    return LOCAL_CONVEX_HOSTS.has(deploymentUrl.hostname);
  } catch {
    return false;
  }
};

const normalizeConfiguredPort = (value: string | undefined): string | null => {
  const normalizedValue = normalizeEnvValue(value);
  if (normalizedValue === undefined) {
    return null;
  }

  const parsed = Number(normalizedValue);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null;
};

export const readConfiguredLocalDevPort = (env: NodeJS.ProcessEnv = process.env): string | null =>
  normalizeConfiguredPort(env.VITE_PORT);

/**
 * Pick the same local frontend port that the Vite wrapper will claim so
 * SITE_URL can stay aligned even before Vite starts listening.
 */
export const resolveLocalDevPort = (env: NodeJS.ProcessEnv = process.env): string => {
  const configuredPort = readConfiguredLocalDevPort(env);
  let port = configuredPort !== null ? Number(configuredPort) : DEFAULT_LOCAL_SITE_PORT;
  while (isPortInUse(port)) {
    port += 1;
  }
  return String(port);
};

export const resolveLocalDevOrigin = (env: NodeJS.ProcessEnv = process.env): string => {
  const explicitOrigin = normalizeEnvValue(env.DEV_ENV_ORIGIN);
  if (explicitOrigin !== undefined) {
    return explicitOrigin;
  }
  return `http://localhost:${resolveLocalDevPort(env)}`;
};

/**
 * Shared Convex deployments must never silently fall back to localhost when
 * the explicit frontend origin is missing, or they can overwrite SITE_URL for
 * other contributors with an unusable redirect target.
 */
export const resolveSiteUrlSyncOrigin = (
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string => {
  const explicitOrigin = normalizeEnvValue(env.DEV_ENV_ORIGIN);
  if (explicitOrigin !== undefined) {
    return explicitOrigin;
  }
  if (!usesLocalConvexDeployment(cwd)) {
    throw new Error("DEV_ENV_ORIGIN is required unless the Convex deployment points at localhost.");
  }
  return resolveLocalDevOrigin(env);
};

export const writeLocalDevOriginState = (origin: string, cwd: string = process.cwd()): void => {
  fs.mkdirSync(path.dirname(getLocalDevOriginStatePath(cwd)), {
    recursive: true,
  });
  fs.writeFileSync(
    getLocalDevOriginStatePath(cwd),
    JSON.stringify({
      origin,
      writtenAt: Date.now(),
    }),
    "utf8",
  );
};

export const readLocalDevOriginState = (
  cwd: string = process.cwd(),
): { origin: string; writtenAt: number } | null => {
  const statePath = getLocalDevOriginStatePath(cwd);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.origin === "string" &&
      typeof parsed.writtenAt === "number"
    ) {
      return {
        origin: parsed.origin,
        writtenAt: parsed.writtenAt,
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const clearLocalDevOriginState = (cwd: string = process.cwd()): void => {
  fs.rmSync(getLocalDevOriginStatePath(cwd), { force: true });
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const parsePort = (url: string): number | null => {
  try {
    const parsed = new URL(url);
    const asNumber = Number(parsed.port);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
  } catch {
    return null;
  }
};

export const listListeningPids = (port: number): string[] => {
  if (process.platform === "win32") {
    const netstatResult = spawnSync("netstat", ["-ano", "-p", "tcp"], {
      stdio: "pipe",
      encoding: "utf8",
    });
    if (netstatResult.status !== 0 || !netstatResult.stdout) {
      return [];
    }

    return netstatResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 5 && /LISTENING/i.test(parts[3] ?? ""))
      .filter((parts) => {
        const localAddress = parts[1] ?? "";
        return localAddress.endsWith(`:${port}`) || localAddress.endsWith(`]:${port}`);
      })
      .map((parts) => parts.at(-1))
      .filter(notEmpty)
      .filter((pid, index, all) => all.indexOf(pid) === index);
  }

  const result = spawnSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

export const isPortInUse = (port: number): boolean => listListeningPids(port).length > 0;
