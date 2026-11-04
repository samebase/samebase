// The push command of a preview stage of apps/samebase/alchemy.run.ts. Convex.Deployment runs it in
// that folder with CONVEX_DEPLOY_KEY set to a short-lived key of the preview deployment,
// so each Convex CLI call below reaches that deployment and no other.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { generateCredentialKeys } from "../../../scripts/lib/convexAuthKeys.ts";

const convex = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));

// convex/convex.config.ts requires the provider credential key ring, and the deploy below refuses a
// push without it. A preview keeps the ring it has: its credential rows are sealed under it. The CLI
// exits 0 with an empty stdout when the variable is absent.
const existingRing = execFileSync(process.execPath, [convex, "env", "get", "CREDENTIAL_KEYS"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
}).trim();
if (existingRing.length === 0) {
  execFileSync(process.execPath, [convex, "env", "set", "CREDENTIAL_KEYS"], {
    input: generateCredentialKeys().CREDENTIAL_KEYS,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

// The build, the upload of the site, and `convex deploy`, as in production.
// TEMPORARY diagnosis for PR 1789: the Site error keeps only the last 20 output lines.
const deploy = spawnSync(process.execPath, ["--run", "deploy"], {
  encoding: "utf8",
  maxBuffer: 1 << 28,
});
process.stdout.write(deploy.stdout);
process.stderr.write(deploy.stderr);
if (deploy.status !== 0) {
  const last = (text: string, count: number) =>
    text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(-count)
      .join("\n");
  process.stderr.write(
    `\n--- deploy stdout ---\n${last(deploy.stdout, 9)}\n--- deploy stderr ---\n${last(deploy.stderr, 8)}\n`,
  );
  process.exit(deploy.status ?? 1);
}

// OAuth sign-ins may return only to SITE_URL and CONVEX_SITE_URL, so the preview signs in on its own
// origin.
const siteUrl: unknown = JSON.parse(
  execFileSync(process.execPath, [convex, "run", "--inline-query", "process.env.CONVEX_SITE_URL"], {
    encoding: "utf8",
  }),
);
if (typeof siteUrl !== "string") {
  throw new Error("The preview deployment has no CONVEX_SITE_URL.");
}
execFileSync(process.execPath, [convex, "env", "set", "SITE_URL", siteUrl], { stdio: "inherit" });

// The preview's password account, from the DEV_SEED_AUTH_* values of the project's default
// environment variables for previews.
execFileSync(process.execPath, [convex, "run", "devAuth:seedPasswordAccount"], {
  stdio: "inherit",
});
