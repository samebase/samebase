import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CONVEX_DEPLOY_KEY = "CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";
const PROD_POSTHOG_PROJECT_TOKEN = "PROD_POSTHOG_PROJECT_TOKEN";
const PRODUCTION_POSTHOG_PROXY_HOST = "https://e.samebase.com";
const VITE_PUBLIC_POSTHOG_HOST = "VITE_PUBLIC_POSTHOG_HOST";
const VITE_PUBLIC_POSTHOG_PROJECT_TOKEN = "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN";
const VITE_SAMEBASE_ROUTE_ENVIRONMENT = "VITE_SAMEBASE_ROUTE_ENVIRONMENT";
const WORKERS_BUILD_COMMAND = "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts";

type BuildRouteEnvironment = "local" | "preview" | "production";

type ConvexDeployPlan =
  | {
      kind: "deploy";
      deployKey: string;
      deployKeyName: typeof CONVEX_DEPLOY_KEY;
      postHogProjectToken: string | null;
      routeEnvironment: BuildRouteEnvironment;
      args: readonly string[];
    }
  | {
      kind: "previewDeploy";
      deployKey: string;
      deployKeyName: typeof PREVIEW_CONVEX_DEPLOY_KEY;
      routeEnvironment: BuildRouteEnvironment;
      args: readonly string[];
      seedArgs: readonly string[];
    }
  | {
      kind: "frontendOnly";
      routeEnvironment: BuildRouteEnvironment;
    };

function run(command: string, args: readonly string[], env?: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited with ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function isEnabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function isPagesBuild(env: NodeJS.ProcessEnv) {
  return isEnabled(env.CF_PAGES) || Boolean(env.CF_PAGES_BRANCH);
}

function isWorkersBuild(env: NodeJS.ProcessEnv) {
  return isEnabled(env.WORKERS_CI);
}

function readDeployKey(args: {
  env: NodeJS.ProcessEnv;
  branch: string;
  deployKeyName: typeof CONVEX_DEPLOY_KEY | typeof PREVIEW_CONVEX_DEPLOY_KEY;
}) {
  const deployKey = args.env[args.deployKeyName];
  if (deployKey) {
    return deployKey;
  }

  if (args.deployKeyName === CONVEX_DEPLOY_KEY) {
    throw new Error(
      `Set ${CONVEX_DEPLOY_KEY} in Cloudflare Workers build variables for ${args.branch}. Use a Convex production deploy key with exactly deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view.`,
    );
  }

  throw new Error(
    `Set ${PREVIEW_CONVEX_DEPLOY_KEY} in Cloudflare Workers build variables for ${args.branch}. Use a Convex project Preview deploy key.`,
  );
}

export function selectConvexDeployPlan(env: NodeJS.ProcessEnv): ConvexDeployPlan {
  if (isPagesBuild(env)) {
    throw new Error(
      "Cloudflare Pages builds are disabled for Samebase production during the Workers cutover. Keep the last good Pages deployment active until the Worker is public.",
    );
  }

  if (isWorkersBuild(env) && env[VITE_PUBLIC_POSTHOG_PROJECT_TOKEN]) {
    throw new Error(
      `Do not set ${VITE_PUBLIC_POSTHOG_PROJECT_TOKEN} in Cloudflare Workers build variables. Set ${PROD_POSTHOG_PROJECT_TOKEN}; this script exposes it to Vite only for main.`,
    );
  }

  if (isWorkersBuild(env) && env[VITE_PUBLIC_POSTHOG_HOST]) {
    throw new Error(
      `Do not set ${VITE_PUBLIC_POSTHOG_HOST} in Cloudflare Workers build variables. Samebase production builds derive the first-party PostHog proxy host from source control.`,
    );
  }

  const branch = env.WORKERS_CI_BRANCH;
  if (!branch) {
    if (isWorkersBuild(env)) {
      throw new Error(
        "Set WORKERS_CI_BRANCH in Cloudflare Workers build variables to prevent unintended production Convex deploys.",
      );
    }

    if (env[CONVEX_DEPLOY_KEY] || env[PREVIEW_CONVEX_DEPLOY_KEY]) {
      throw new Error(
        `Set WORKERS_CI_BRANCH to choose ${CONVEX_DEPLOY_KEY} or ${PREVIEW_CONVEX_DEPLOY_KEY}, or unset both keys for a frontend-only local build.`,
      );
    }

    return { kind: "frontendOnly", routeEnvironment: "local" };
  }

  if (branch !== "main") {
    return {
      kind: "previewDeploy",
      deployKeyName: PREVIEW_CONVEX_DEPLOY_KEY,
      deployKey: readDeployKey({
        env,
        branch,
        deployKeyName: PREVIEW_CONVEX_DEPLOY_KEY,
      }),
      routeEnvironment: "preview",
      args: ["exec", "convex", "deploy", "--preview-name", branch, "--cmd", WORKERS_BUILD_COMMAND],
      seedArgs: ["exec", "convex", "run", "devAuth:seedPasswordAccount", "--preview-name", branch],
    };
  }

  return {
    kind: "deploy",
    deployKeyName: CONVEX_DEPLOY_KEY,
    deployKey: readDeployKey({
      env,
      branch,
      deployKeyName: CONVEX_DEPLOY_KEY,
    }),
    postHogProjectToken: env[PROD_POSTHOG_PROJECT_TOKEN] ?? null,
    routeEnvironment: "production",
    args: ["exec", "convex", "deploy", "--cmd", WORKERS_BUILD_COMMAND],
  };
}

export async function main(env: NodeJS.ProcessEnv = process.env, runCommand = run) {
  const plan = selectConvexDeployPlan(env);

  if (plan.kind === "frontendOnly") {
    console.warn(
      `${CONVEX_DEPLOY_KEY} and ${PREVIEW_CONVEX_DEPLOY_KEY} are not set; building static assets without deploying Convex.`,
    );
    await runCommand("pnpm", ["run", "build:app"], {
      ...env,
      [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    });
    return;
  }

  const convexEnv = {
    ...env,
    CONVEX_DEPLOY_KEY: plan.deployKey,
    [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    // Cloudflare Workers build variables are shared across branch types. Keep
    // the app-facing Vite env out of previews by deriving it only after the
    // script has selected the production deploy plan.
    ...(plan.kind === "deploy" && plan.postHogProjectToken
      ? {
          [VITE_PUBLIC_POSTHOG_HOST]: PRODUCTION_POSTHOG_PROXY_HOST,
          [VITE_PUBLIC_POSTHOG_PROJECT_TOKEN]: plan.postHogProjectToken,
        }
      : {}),
    ...(plan.kind === "deploy" ? { SAMEBASE_PRERENDER_ORIGIN: "https://samebase.com" } : {}),
  };

  await runCommand("pnpm", plan.args, convexEnv);
  if (plan.kind === "previewDeploy") {
    await runCommand("pnpm", plan.seedArgs, convexEnv);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
