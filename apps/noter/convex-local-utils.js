// @ts-check
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const LOCAL_CONVEX_HOSTS = new Set(["127.0.0.1", "localhost"]);
export const DEFAULT_LOCAL_SITE_PORT = 5173;
const getLocalDevOriginStatePath = (cwd = process.cwd()) =>
  path.join(cwd, "node_modules", ".cache", "noter-local-dev-origin.json");

/**
 * @param {string} [cwd]
 * @returns {Record<string, string>}
 */
export const readEnvFile = (cwd = process.cwd()) => {
  const envPath = path.join(cwd, ".env.local");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const contents = fs.readFileSync(envPath, "utf8");
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    if (!key) {
      continue;
    }
    env[key] = rest.join("=");
  }
  return env;
};

/**
 * @param {string} [cwd]
 * @returns {boolean}
 */
export const usesLocalConvexDeployment = (cwd = process.cwd()) => {
  const env = readEnvFile(cwd);
  const rawUrl = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
  if (!rawUrl) {
    return false;
  }

  try {
    const deploymentUrl = new URL(rawUrl.replace(/^['"]|['"]$/g, ""));
    return LOCAL_CONVEX_HOSTS.has(deploymentUrl.hostname);
  } catch {
    return false;
  }
};

/**
 * @param {string | undefined} value
 * @returns {string | null}
 */
const normalizeConfiguredPort = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null;
};

/**
 * Pick the same local frontend port that the Vite wrapper will claim so
 * SITE_URL can stay aligned even before Vite starts listening.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export const resolveLocalDevPort = (env = process.env) => {
  const configuredPort = normalizeConfiguredPort(env.VITE_PORT);
  let port =
    configuredPort !== null ? Number(configuredPort) : DEFAULT_LOCAL_SITE_PORT;
  while (isPortInUse(port)) {
    port += 1;
  }
  return String(port);
};

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export const resolveLocalDevOrigin = (env = process.env) => {
  const explicitOrigin = env.DEV_ENV_ORIGIN?.trim();
  if (explicitOrigin) {
    return explicitOrigin;
  }
  return `http://localhost:${resolveLocalDevPort(env)}`;
};

/**
 * @param {string} origin
 * @param {string} [cwd]
 * @returns {void}
 */
export const writeLocalDevOriginState = (origin, cwd = process.cwd()) => {
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

/**
 * @param {string} [cwd]
 * @returns {{ origin: string; writtenAt: number } | null}
 */
export const readLocalDevOriginState = (cwd = process.cwd()) => {
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

/**
 * @param {string} [cwd]
 * @returns {void}
 */
export const clearLocalDevOriginState = (cwd = process.cwd()) => {
  fs.rmSync(getLocalDevOriginStatePath(cwd), { force: true });
};

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * @param {string} url
 * @returns {number | null}
 */
export const parsePort = (url) => {
  try {
    const parsed = new URL(url);
    const asNumber = Number(parsed.port);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : null;
  } catch {
    return null;
  }
};

/**
 * @param {number} port
 * @returns {string[]}
 */
export const listListeningPids = (port) => {
  /**
   * @param {unknown} value
   * @returns {value is string}
   */
  const isString = (value) => typeof value === "string";

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
        return (
          localAddress.endsWith(`:${port}`) ||
          localAddress.endsWith(`]:${port}`)
        );
      })
      .map((parts) => parts.at(-1))
      .filter(isString)
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

/**
 * @param {number} port
 * @returns {boolean}
 */
export const isPortInUse = (port) => listListeningPids(port).length > 0;
