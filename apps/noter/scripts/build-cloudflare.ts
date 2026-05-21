import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROD_CONVEX_DEPLOY_KEY = "PROD_CONVEX_DEPLOY_KEY";
const PREVIEW_CONVEX_DEPLOY_KEY = "PREVIEW_CONVEX_DEPLOY_KEY";

type ConvexDeployPlan =
  | {
      kind: "deploy";
      deployKey: string;
      deployKeyName: typeof PROD_CONVEX_DEPLOY_KEY;
      args: readonly string[];
    }
  | {
      kind: "previewDeploy";
      deployKey: string;
      deployKeyName: typeof PREVIEW_CONVEX_DEPLOY_KEY;
      args: readonly string[];
    }
  | {
      kind: "frontendOnly";
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
  deployKeyName: typeof PROD_CONVEX_DEPLOY_KEY | typeof PREVIEW_CONVEX_DEPLOY_KEY;
}) {
  const deployKey = args.env[args.deployKeyName];
  if (deployKey) {
    return deployKey;
  }

  throw new Error(
    `Set ${args.deployKeyName} in Cloudflare Workers build variables for ${args.branch}.`,
  );
}

export function selectConvexDeployPlan(env: NodeJS.ProcessEnv): ConvexDeployPlan {
  if (isPagesBuild(env)) {
    throw new Error(
      "Cloudflare Pages builds are disabled for Noter production during the Workers cutover. Keep the last good Pages deployment active until the Worker is public.",
    );
  }

  // Convex expects CONVEX_DEPLOY_KEY, but the build environment must not store
  // that generic name because one Cloudflare UI table feeds both branch types.
  if (env.CONVEX_DEPLOY_KEY) {
    throw new Error(
      `Do not set CONVEX_DEPLOY_KEY in Cloudflare Workers build variables. Set ${PROD_CONVEX_DEPLOY_KEY} and ${PREVIEW_CONVEX_DEPLOY_KEY}; this script selects the right key by branch.`,
    );
  }

  const branch = env.WORKERS_CI_BRANCH;
  if (!branch) {
    if (isWorkersBuild(env)) {
      throw new Error(
        "Set WORKERS_CI_BRANCH in Cloudflare Workers build variables to prevent unintended production Convex deploys.",
      );
    }

    if (env[PROD_CONVEX_DEPLOY_KEY] || env[PREVIEW_CONVEX_DEPLOY_KEY]) {
      throw new Error(
        `Set WORKERS_CI_BRANCH to choose ${PROD_CONVEX_DEPLOY_KEY} or ${PREVIEW_CONVEX_DEPLOY_KEY}, or unset both keys for a frontend-only local build.`,
      );
    }

    return { kind: "frontendOnly" };
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
      args: [
        "exec",
        "convex",
        "deploy",
        "--preview-create",
        branch,
        "--preview-run",
        "devAuth:seedPasswordAccount",
        "--cmd",
        "pnpm run build:ci",
      ],
    };
  }

  return {
    kind: "deploy",
    deployKeyName: PROD_CONVEX_DEPLOY_KEY,
    deployKey: readDeployKey({
      env,
      branch,
      deployKeyName: PROD_CONVEX_DEPLOY_KEY,
    }),
    args: ["exec", "convex", "deploy", "--cmd", "pnpm run build:ci"],
  };
}

export async function main(env: NodeJS.ProcessEnv = process.env) {
  const plan = selectConvexDeployPlan(env);

  if (plan.kind === "frontendOnly") {
    console.warn(
      `${PROD_CONVEX_DEPLOY_KEY} and ${PREVIEW_CONVEX_DEPLOY_KEY} are not set; building static assets without deploying Convex.`,
    );
    await run("pnpm", ["run", "build:app"]);
    return;
  }

  await run("pnpm", plan.args, {
    ...env,
    CONVEX_DEPLOY_KEY: plan.deployKey,
  });
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
