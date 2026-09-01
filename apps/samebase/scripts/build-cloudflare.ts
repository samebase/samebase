import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const vitePlusEntrypoint = fileURLToPath(import.meta.resolve("vite-plus/bin"));
const PROD_POSTHOG_PROJECT_TOKEN = "PROD_POSTHOG_PROJECT_TOKEN";
const PRODUCTION_POSTHOG_PROXY_HOST = "https://e.samebase.com";
const VITE_PUBLIC_POSTHOG_HOST = "VITE_PUBLIC_POSTHOG_HOST";
const VITE_PUBLIC_POSTHOG_PROJECT_TOKEN = "VITE_PUBLIC_POSTHOG_PROJECT_TOKEN";
const VITE_SAMEBASE_ROUTE_ENVIRONMENT = "VITE_SAMEBASE_ROUTE_ENVIRONMENT";
const WORKERS_BUILD_COMMAND = "pnpm run build:ci && node ./scripts/verify-current-branch-head.ts";

type BuildRouteEnvironment = "local" | "preview" | "production";

type CloudflareBuildPlan =
  | {
      kind: "app";
      buildArgs: readonly string[];
      routeEnvironment: BuildRouteEnvironment;
    }
  | {
      kind: "production";
      deployArgs: readonly string[];
      postHogProjectToken: string | null;
      routeEnvironment: BuildRouteEnvironment;
    }
  | {
      kind: "preview";
      deployArgs: readonly string[];
      previewName: string;
      routeEnvironment: BuildRouteEnvironment;
      seedArgs: readonly string[];
    };

type RunNode = (
  entrypoint: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => Promise<void>;

function runNode(entrypoint: string, args: readonly string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${entrypoint} exited with ${signal}`));
        return;
      }

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${entrypoint} exited with ${code ?? 1}`));
    });
  });
}

function isEnabled(value: string | undefined) {
  return value === "1" || value === "true";
}

function isPagesBuild(env: NodeJS.ProcessEnv) {
  return isEnabled(env["CF_PAGES"]) || Boolean(env["CF_PAGES_BRANCH"]);
}

function isWorkersBuild(env: NodeJS.ProcessEnv) {
  return isEnabled(env["WORKERS_CI"]);
}

function readWorkersBuildBranch(env: NodeJS.ProcessEnv) {
  const branch = env["WORKERS_CI_BRANCH"];
  if (!branch) {
    throw new Error("Workers Builds must provide WORKERS_CI_BRANCH before Convex deploys.");
  }
  return branch;
}

function requireConvexDeployKey(env: NodeJS.ProcessEnv, branch: string) {
  if (env["CONVEX_DEPLOY_KEY"]) {
    return;
  }

  if (branch === "main") {
    throw new Error(
      "Set CONVEX_DEPLOY_KEY in the Cloudflare build settings for main. Use a Convex production deploy key with exactly deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view.",
    );
  }

  throw new Error(
    `Set CONVEX_DEPLOY_KEY in the Cloudflare build settings for ${branch}. Use a Convex project Preview deploy key.`,
  );
}

export function selectCloudflareBuildPlan(env: NodeJS.ProcessEnv): CloudflareBuildPlan {
  if (isPagesBuild(env)) {
    throw new Error(
      "Cloudflare Pages builds are disabled for Samebase production during the Workers cutover. Keep the last good Pages deployment active until the Worker is public.",
    );
  }

  if (!isWorkersBuild(env)) {
    return {
      kind: "app",
      buildArgs: ["run", "build:app"],
      routeEnvironment: "local",
    };
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

  const branch = readWorkersBuildBranch(env);
  requireConvexDeployKey(env, branch);

  if (branch === "main") {
    return {
      kind: "production",
      deployArgs: ["exec", "convex", "deploy", "--cmd", WORKERS_BUILD_COMMAND],
      postHogProjectToken: env[PROD_POSTHOG_PROJECT_TOKEN] ?? null,
      routeEnvironment: "production",
    };
  }

  return {
    kind: "preview",
    deployArgs: [
      "exec",
      "convex",
      "deploy",
      "--preview-name",
      branch,
      "--cmd",
      WORKERS_BUILD_COMMAND,
    ],
    previewName: branch,
    routeEnvironment: "preview",
    seedArgs: ["exec", "convex", "run", "devAuth:seedPasswordAccount", "--preview-name", branch],
  };
}

export async function main(
  env: NodeJS.ProcessEnv = process.env,
  runNodeCommand: RunNode = runNode,
) {
  const plan = selectCloudflareBuildPlan(env);

  if (plan.kind === "app") {
    await runNodeCommand(vitePlusEntrypoint, plan.buildArgs, {
      ...env,
      [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    });
    return;
  }

  const convexEnv = {
    ...env,
    [VITE_SAMEBASE_ROUTE_ENVIRONMENT]: plan.routeEnvironment,
    // Keep the app-facing Vite env out of previews by deriving it only after
    // the script has selected the production deploy plan.
    ...(plan.kind === "production" && plan.postHogProjectToken
      ? {
          [VITE_PUBLIC_POSTHOG_HOST]: PRODUCTION_POSTHOG_PROXY_HOST,
          [VITE_PUBLIC_POSTHOG_PROJECT_TOKEN]: plan.postHogProjectToken,
        }
      : {}),
    ...(plan.kind === "production" ? { SAMEBASE_PRERENDER_ORIGIN: "https://samebase.com" } : {}),
  };

  await runNodeCommand(vitePlusEntrypoint, plan.deployArgs, convexEnv);
  if (plan.kind === "preview") {
    await runNodeCommand(vitePlusEntrypoint, plan.seedArgs, convexEnv);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
