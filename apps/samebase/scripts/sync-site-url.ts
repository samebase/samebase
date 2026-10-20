/**
 * sync-site-url.ts
 *
 * Sets the SITE_URL environment variable on the Convex dev deployment.
 * Runs automatically as part of `predev` before the dev server starts.
 *
 * WHY THIS EXISTS:
 * Convex Auth lets a GitHub or Google sign-in return only to the SITE_URL origin
 * (or the deployment's own site), and the MCP consent and provider OAuth flows
 * redirect to SITE_URL. In development, this URL changes depending on the
 * environment:
 *
 *   - Cloud dev containers (e.g. sandboxes): Each container gets a unique,
 *     ephemeral URL. When a container is destroyed and a new one is created,
 *     the URL changes, but the SITE_URL on the Convex deployment still points
 *     to the old, dead URL. This script fixes that by reading the current
 *     container URL from the DEV_ENV_ORIGIN env var.
 *
 *   - Local development: Reuses the deterministic local Vite port that Samebase
 *     picks before startup, beginning with http://localhost:5173.
 *
 * KNOWN LIMITATION:
 * All contributors share a single Convex dev deployment, so running this
 * script overwrites the SITE_URL for everyone. If multiple people are
 * developing simultaneously, only the last person to start their dev server
 * will have working OAuth redirects. The fix for this would be separate
 * Convex dev deployments per contributor.
 */

import { spawnSync } from "child_process";
import { resolveSiteUrlSyncOrigin, usesLocalConvexDeployment } from "./convex-local-utils.ts";

const writeProcessOutput = (stream: NodeJS.WriteStream, value: string | null | undefined): void => {
  if (typeof value === "string" && value.length > 0) {
    stream.write(value);
  }
};

const localDeployment = usesLocalConvexDeployment();

let origin: string;
try {
  origin = resolveSiteUrlSyncOrigin(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

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

const commandOutput = `${typeof result.output[1] === "string" ? result.output[1] : ""}${typeof result.output[2] === "string" ? result.output[2] : ""}`;
if (localDeployment && /Local backend isn't running/i.test(commandOutput)) {
  console.warn(
    `Skipping SITE_URL sync during predev because the temporary local Convex backend already exited. The long-running local backend will retry SITE_URL sync for ${origin} after it starts.`,
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
