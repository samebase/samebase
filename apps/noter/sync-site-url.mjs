/**
 * Automatically syncs the container's origin URL to the Convex
 * SITE_URL environment variable. This ensures GitHub OAuth redirects
 * work correctly in ephemeral dev containers.
 *
 * Runs as part of `predev` — no-ops if not in a container environment.
 */

import { execSync } from "child_process";

const origin = process.env.FUSION_ENV_ORIGIN;

if (!origin) {
  console.log("No FUSION_ENV_ORIGIN found, skipping SITE_URL sync.");
  process.exit(0);
}

console.log(`Setting Convex SITE_URL to ${origin}`);
execSync(`npx convex env set SITE_URL "${origin}"`, { stdio: "inherit" });
