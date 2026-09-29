import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONVEX_DEPLOY_KEY = "CONVEX_DEPLOY_KEY";
const PROD_POSTHOG_PROJECT_TOKEN = "PROD_POSTHOG_PROJECT_TOKEN";
const PRODUCTION_POSTHOG_PROXY_HOST = "https://e.samebase.com";
const VITE_PUBLIC_POSTHOG_HOST = "VITE_PUBLIC_POSTHOG_HOST";
const VITE_PUBLIC_POSTHOG_PROJECT_TOKEN = "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN";
const VITE_SAMEBASE_ROUTE_ENVIRONMENT = "VITE_SAMEBASE_ROUTE_ENVIRONMENT";
const WORKERS_BUILD_COMMAND = "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts";
const vitePlusEntrypoint = fileURLToPath(import.meta.resolve("vite-plus/bin"));

type BuildRouteEnvironment = "local" | "preview" | "production";

type ConvexDeployPlan =
  | {
      kind: "deploy";
      postHogProjectToken: string | null;
      routeEnvironment: BuildRouteEnvironment;
      args: readonly string[];
    }
  | {
      kind: "previewDeploy";
      routeEnvironment: BuildRouteEnvironment;
      args: readonly string[];
      seedArgs: readonly string[];
    }
  | {
      kind: "frontendOnly";
      routeEnvironment: BuildRouteEnvironment;
    };

function run(args: readonly string[], env?: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [vitePlusEntrypoint, ...args], {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`vp ${args.join(" ")} exited with ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`vp ${args.join(" ")} exited with ${code}`));
    });
  });
}

function isEnabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function isPagesBuild(env: NodeJS.ProcessEnv) {
  return isEnabled(env.CF_PAGES) || Boolean(env.CF_PAGES_BRANCH);
}

export function selectConvexDeployPlan(env: NodeJS.ProcessEnv): ConvexDeployPlan {
  if (isPagesBuild(env)) {
    throw new Error(
      "Cloudflare Pages builds are disabled for Samebase production during the Workers cutover. Keep the last good Pages deployment active until the Worker is public.",
    );
  }

  if (!isEnabled(env.WORKERS_CI)) {
    return { kind: "frontendOnly", routeEnvironment: "local" };
  }

  if (env[VITE_PUBLIC_POSTHOG_PROJECT_TOKEN]) {
    throw new Error(
      `Do not set ${VITE_PUBLIC_POSTHOG_PROJECT_TOKEN} in Cloudflare Workers build variables. Set ${PROD_POSTHOG_PROJECT_TOKEN}; this script exposes it to Vite only for main.`,
    );
  }

  if (env[VITE_PUBLIC_POSTHOG_HOST]) {
    throw new Error(
      `Do not set ${VITE_PUBLIC_POSTHOG_HOST} in Cloudflare Workers build variables. Samebase production builds derive the first-party PostHog proxy host from source control.`,
    );
  }

  const branch = env.WORKERS_CI_BRANCH;
  if (!branch) {
    throw new Error(
      "Set WORKERS_CI_BRANCH in Cloudflare Workers build variables to prevent unintended production Convex deploys.",
    );
  }

  if (!env[CONVEX_DEPLOY_KEY]) {
    throw new Error(
      branch === "main"
        ? `Set ${CONVEX_DEPLOY_KEY} in Cloudflare production build variables. Use a Convex production deploy key with exactly deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view.`
        : `Set ${CONVEX_DEPLOY_KEY} in Cloudflare Builds > Previews Base > Variables and secrets. Use a Convex project Preview deploy key.`,
    );
  }

  if (branch !== "main") {
    return {
      kind: "previewDeploy",
      routeEnvironment: "preview",
      args: ["exec", "convex", "deploy", "--preview-name", branch, "--cmd", WORKERS_BUILD_COMMAND],
      seedArgs: ["exec", "convex", "run", "devAuth:seedPasswordAccount", "--preview-name", branch],
    };
  }

  return {
    kind: "deploy",
    postHogProjectToken: env[PROD_POSTHOG_PROJECT_TOKEN] ?? null,
    routeEnvironment: "production",
    args: ["exec", "convex", "deploy", "--cmd", WORKERS_BUILD_COMMAND],
  };
}

export async function main(env: NodeJS.ProcessEnv = process.env, runCommand = run) {
  const plan = selectConvexDeployPlan(env);

  if (plan.kind === "frontendOnly") {
    await runCommand(["run", "build:app"], {
      ...env,
      CONVEX_DEPLOY_KEY: undefined,
      [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    });
    return;
  }

  const convexEnv = {
    ...env,
    [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    ...(plan.kind === "deploy" && plan.postHogProjectToken
      ? {
          [VITE_PUBLIC_POSTHOG_HOST]: PRODUCTION_POSTHOG_PROXY_HOST,
          [VITE_PUBLIC_POSTHOG_PROJECT_TOKEN]: plan.postHogProjectToken,
        }
      : {}),
    ...(plan.kind === "deploy" ? { SAMEBASE_PRERENDER_ORIGIN: "https://samebase.com" } : {}),
  };

  await runCommand(plan.args, convexEnv);
  if (plan.kind === "previewDeploy") {
    await runCommand(plan.seedArgs, convexEnv);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
