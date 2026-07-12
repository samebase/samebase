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

// The fallback should never be used.
const configuredDeployment = Object.prototype.hasOwnProperty.call(config, "CONVEX_DEPLOYMENT")
  ? config.CONVEX_DEPLOYMENT
  : undefined;
const deploymentName = configuredDeployment?.split(":").slice(-1)[0] ?? "<your deployment name>";

const variables = JSON.stringify({
  help: "This command configures the additional Convex environment variables for GitHub OAuth.",
  providers: [
    {
      name: "GitHub OAuth",
      help:
        "Create a GitHub OAuth App, follow the instruction here: " +
        "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app\n\n" +
        `When you're asked for a callback URL use:\n\n` +
        `  https://${deploymentName}.convex.site/oauth/github/callback`,
      variables: [
        {
          name: "PROVIDER_GITHUB_OAUTH_CLIENT_ID",
          description: "the Client ID of your GitHub OAuth App",
        },
        {
          name: "PROVIDER_GITHUB_OAUTH_CLIENT_SECRET",
          description: "the generated client secret",
        },
        {
          name: "PROVIDER_GITHUB_OAUTH_REDIRECT_URL",
          description: "the callback URL from above",
        },
      ],
    },
  ],
  success:
    "You're all set. If you need to, you can rerun this command with `node ./scripts/setup.ts`.",
});

console.error(
  "You chose Convex Auth as the auth solution. " +
    "This command will walk you through setting up " +
    "the required Convex environment variables",
);

const result = spawnSync(
  "npx",
  ["@convex-dev/auth", "--variables", variables, "--skip-git-check"],
  { stdio: "inherit" },
);

if (runOnceWorkflow) {
  fs.writeFileSync(".env.local", `\nSETUP_SCRIPT_RAN=1\n`, { flag: "a" });
}

process.exit(result.status);
