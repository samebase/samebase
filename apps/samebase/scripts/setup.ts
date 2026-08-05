/**
 * This script runs `npx @convex-dev/auth` to help with setting up
 * environment variables for Convex Auth.
 *
 * You can safely delete it and remove it from package.json scripts.
 */

import fs from "fs";
import { config as loadEnvFile } from "dotenv";
import { spawnSync } from "child_process";

if (!fs.existsSync(".env.local")) {
  // Something is off, skip the script.
  process.exit(0);
}

const config: Record<string, string> = {};
loadEnvFile({ path: ".env.local", processEnv: config });

const runOnceWorkflow = process.argv.includes("--once");
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;
const hasSetupScriptRan = Object.prototype.hasOwnProperty.call(config, "SETUP_SCRIPT_RAN");

if (runOnceWorkflow && hasSetupScriptRan) {
  // The script has already ran once, skip.
  process.exit(0);
}

if (!isInteractive) {
  // Non-interactive environment, skip setup
  console.log("Skipping interactive setup in non-interactive environment");
  if (runOnceWorkflow) {
    fs.writeFileSync(".env.local", `\nSETUP_SCRIPT_RAN=1\n`, { flag: "a" });
  }
  process.exit(0);
}

console.error(
  "You chose Convex Auth as the auth solution. " +
    "This command will walk you through setting up " +
    "the required Convex environment variables",
);

const result = spawnSync("npx", ["@convex-dev/auth", "--skip-git-check"], { stdio: "inherit" });

if (runOnceWorkflow) {
  fs.writeFileSync(".env.local", `\nSETUP_SCRIPT_RAN=1\n`, { flag: "a" });
}

process.exit(result.status);
