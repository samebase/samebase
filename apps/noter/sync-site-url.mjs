/**
 * sync-site-url.mjs
 *
 * Sets the SITE_URL environment variable on the Convex dev deployment.
 * Runs automatically as part of `predev` before the dev server starts.
 *
 * WHY THIS EXISTS:
 * Convex Auth uses the SITE_URL env var to know where to redirect the browser
 * after GitHub OAuth completes. In development, this URL changes depending on
 * the environment:
 *
 *   - Cloud dev containers (e.g. sandboxes): Each container gets a unique,
 *     ephemeral URL. When a container is destroyed and a new one is created,
 *     the URL changes, but the SITE_URL on the Convex deployment still points
 *     to the old, dead URL. This script fixes that by reading the current
 *     container URL from the DEV_ENV_ORIGIN env var.
 *
 *   - Local development: Defaults to http://localhost:5173 (Vite's default).
 *
 * KNOWN LIMITATION:
 * All contributors share a single Convex dev deployment, so running this
 * script overwrites the SITE_URL for everyone. If multiple people are
 * developing simultaneously, only the last person to start their dev server
 * will have working OAuth redirects. The fix for this would be separate
 * Convex dev deployments per contributor.
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const LOCAL_CONVEX_HOSTS = new Set(["127.0.0.1", "localhost"]);

const readEnvFile = () => {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const env = {};
  const contents = fs.readFileSync(envPath, "utf8");
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

const usesLocalConvexDeployment = () => {
  const env = readEnvFile();
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

const writeProcessOutput = (stream, value) => {
  if (typeof value === "string" && value.length > 0) {
    stream.write(value);
  }
};

// DEV_ENV_ORIGIN is set by sandbox providers (e.g. Daytona).
// Falls back to localhost for local development.
const origin = process.env.DEV_ENV_ORIGIN || "http://localhost:5173";

console.log(`Setting Convex SITE_URL to ${origin}`);
const result = spawnSync("npx", ["convex", "env", "set", "SITE_URL", origin], {
  stdio: "pipe",
  encoding: "utf8",
});
writeProcessOutput(process.stdout, result.stdout);
writeProcessOutput(process.stderr, result.stderr);

if (result.status === 0) {
  console.log(`SITE_URL successfully set to ${origin}`);
  process.exit(0);
}

const commandOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (
  usesLocalConvexDeployment() &&
  /Local backend isn't running/i.test(commandOutput)
) {
  console.warn(
    `Skipping SITE_URL sync during predev because the temporary local Convex backend already exited. If you need local OAuth redirects in this session, rerun \`pnpm --dir apps/noter exec convex env set SITE_URL "${origin}"\` after the backend starts.`,
  );
  process.exit(0);
}

console.error(
  `Failed to set SITE_URL to ${origin}:`,
  commandOutput.trim().length > 0
    ? commandOutput.trim()
    : `Command exited with status ${result.status ?? 1}.`,
);
process.exit(result.status ?? 1);
