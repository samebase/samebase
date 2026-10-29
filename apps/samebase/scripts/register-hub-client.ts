// Registers the development deployment of the primary checkout as a client of the team's identity
// hub, once, and stores the client on it: HUB_ISSUER, HUB_CLIENT_ID, and HUB_CLIENT_SECRET, which
// convex/convex.config.ts requires. scripts/predev.ts runs it before the first push of `pnpm run
// dev`.
//
// The root alchemy.run.ts registers production and every preview. This script covers the one
// deployment that Alchemy does not deploy: the development deployment of apps/samebase/.env.local.
// The developer puts HUB_ISSUER and HUB_REGISTRATION_TOKEN in that file once. A deployment that has
// a complete client of that issuer keeps it; the script registers again only when the stored secret
// is missing or the stored issuer is another one. A linked worktree has no hub: its deployment
// holds the no-hub values, and the script leaves them. The registration token stays in this
// process: the Convex CLI does not get it, and the client secret reaches the CLI on standard input.
//
//   node ./scripts/register-hub-client.ts
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validate } from "convex-helpers/validators";
import { v } from "convex/values";
import { NO_HUB_ENVIRONMENT } from "../../../scripts/lib/convexAuthKeys.ts";
import { readEnvFile } from "./convex-local-utils.ts";

const CALLBACK_PATH = "/auth/hub/callback";
const { object, string } = v;
/** The hub's RFC 7591 answer to a registration, and its OAuth error answer. */
const vHubRegistration = object({ client_id: string(), client_secret: string() });
const vHubError = object({ error: string() });
const CONVEX_CLI_PATH = fileURLToPath(
  new URL("../node_modules/convex/bin/main.js", import.meta.url),
);

type RunConvex = (args: string[], input?: string) => string;

function runConvexCli(args: string[], input?: string): string {
  const env = { ...process.env };
  delete env.HUB_REGISTRATION_TOKEN;
  const result = spawnSync(process.execPath, [CONVEX_CLI_PATH, ...args], {
    encoding: "utf8",
    env,
    input,
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    // `env set` reads the client secret on standard input, never from its arguments.
    throw new Error(`convex ${args.slice(0, 2).join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout.trim();
}

export async function registerHubClient(
  hubEnv: { HUB_ISSUER?: string; HUB_REGISTRATION_TOKEN?: string },
  { runConvex, fetch: fetchHub }: { runConvex: RunConvex; fetch: typeof fetch },
): Promise<{ clientId: string; callbackUrl: string } | null> {
  const issuer = hubEnv.HUB_ISSUER?.replace(/\/$/, "") || undefined;
  const token = hubEnv.HUB_REGISTRATION_TOKEN || undefined;

  // One call at a time: on a stopped local deployment each call may start a temporary backend.
  const storedIssuer = runConvex(["env", "get", "HUB_ISSUER"]);
  const storedClientId = runConvex(["env", "get", "HUB_CLIENT_ID"]);
  const storedClientSecret = runConvex(["env", "get", "HUB_CLIENT_SECRET"]);
  if (storedClientId === NO_HUB_ENVIRONMENT.HUB_CLIENT_ID) {
    console.log("Hub registration skipped: this deployment has no hub.");
    return null;
  }
  if (
    storedClientId !== "" &&
    storedClientSecret !== "" &&
    (issuer === undefined || storedIssuer === issuer)
  ) {
    console.log("Hub client already registered.");
    return null;
  }
  if (issuer === undefined || token === undefined) {
    throw new Error(
      "The development deployment has no complete hub client. Set HUB_ISSUER and HUB_REGISTRATION_TOKEN in apps/samebase/.env.local (README, Sign-in).",
    );
  }

  const siteUrl: unknown = JSON.parse(
    runConvex(["run", "--inline-query", "process.env.CONVEX_SITE_URL"]),
  );
  if (typeof siteUrl !== "string") {
    throw new Error("Could not read CONVEX_SITE_URL of the development deployment.");
  }
  const callbackUrl = `${siteUrl.replace(/\/$/, "")}${CALLBACK_PATH}`;

  const response = await fetchHub(`${issuer}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [callbackUrl],
      client_name: "development",
      software_version: new URL(siteUrl).host,
      deployment_type: "development",
      // Convex Auth posts the client credentials in the token request body.
      token_endpoint_auth_method: "client_secret_post",
    }),
  });
  const body: unknown = await response.json();
  if (response.status !== 201 || !validate(vHubRegistration, body, { allowUnknownFields: true })) {
    // The hub's OAuth error code only, never its description.
    const code = validate(vHubError, body, { allowUnknownFields: true }) ? body.error : "";
    throw new Error(`Hub registration failed with ${response.status}: ${code}`.trim());
  }
  // One request on standard input, so the secret stays out of the process arguments. `--force`
  // replaces the values of an earlier client.
  runConvex(
    ["env", "set", "--force"],
    `HUB_ISSUER='${issuer}'\nHUB_CLIENT_ID='${body.client_id}'\nHUB_CLIENT_SECRET='${body.client_secret}'\n`,
  );
  console.log(`Hub client registered for ${callbackUrl}.`);
  return { clientId: body.client_id, callbackUrl };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { HUB_ISSUER, HUB_REGISTRATION_TOKEN } = readEnvFile();
  try {
    await registerHubClient(
      { HUB_ISSUER, HUB_REGISTRATION_TOKEN },
      { runConvex: runConvexCli, fetch },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
