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
 *   - Cloud dev containers (e.g. Builder.io Fusion): Each container gets a
 *     unique, ephemeral fly.dev URL. When a container is destroyed and a new
 *     one is created, the URL changes — but the SITE_URL on the Convex
 *     deployment still points to the old, dead URL. This script fixes that
 *     by reading the current container URL from the FUSION_ENV_ORIGIN env var.
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

import { execSync } from "child_process";

// FUSION_ENV_ORIGIN is set automatically by the cloud container platform.
// Falls back to localhost for local development.
const origin = process.env.FUSION_ENV_ORIGIN || "http://localhost:5173";

console.log(`Setting Convex SITE_URL to ${origin}`);
try {
  execSync(`npx convex env set SITE_URL "${origin}"`, { stdio: "inherit" });
  console.log(`✓ SITE_URL successfully set to ${origin}`);
} catch (error) {
  console.error(`✗ Failed to set SITE_URL to ${origin}:`, error.message);
  process.exit(1);
}
