#!/usr/bin/env node
import path from "node:path";

export type PreviewDeploymentSetting = "all" | "none" | "custom";

export type CloudflarePagesAppConfig = {
  id: string;
  projectName: string;
  rootDir: string;
  destinationDir: string;
  frontendBuildCommand: string;
  productionBranch: string;
  productionDeployKeyEnvVar: string;
  previewDeployKeyEnvVar: string;
  productionSiteUrlEnvVar?: string;
  pathIncludes: string[];
  pathExcludes?: string[];
  prCommentsEnabled: boolean;
  previewDeploymentSetting: PreviewDeploymentSetting;
  previewBranchIncludes?: string[];
  previewBranchExcludes?: string[];
  syncSiteUrlToDeploymentEnvNames?: string[];
  buildSiteUrlEnvVarName?: string;
};

const BUILD_SCRIPT_REPO_PATH = "scripts/cloudflare-pages-build.ts";

const SHARED_MONOREPO_PATH_INCLUDES = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig*.json",
  "scripts/*",
];

/**
 * Keep the first rollout conservative: these are the repo-owned inputs that can
 * affect the shipped app even when a change lands outside `apps/noter`.
 */
const NOTER_PATH_INCLUDES = [
  ...SHARED_MONOREPO_PATH_INCLUDES,
  "apps/noter/*",
  "packages/*",
  "slogans.md",
];

const STARTER_TEMPLATE_PATH_INCLUDES = [
  ...SHARED_MONOREPO_PATH_INCLUDES,
  "apps/noter-starter-template/*",
];

export const cloudflarePagesApps = [
  {
    id: "noter",
    projectName: "noter",
    rootDir: "apps/noter",
    destinationDir: "dist",
    frontendBuildCommand: "pnpm run build:ci",
    productionBranch: "main",
    productionDeployKeyEnvVar: "NOTER_CONVEX_PRODUCTION_DEPLOY_KEY",
    previewDeployKeyEnvVar: "NOTER_CONVEX_PREVIEW_DEPLOY_KEY",
    productionSiteUrlEnvVar: "NOTER_SITE_URL",
    pathIncludes: NOTER_PATH_INCLUDES,
    prCommentsEnabled: true,
    previewDeploymentSetting: "all",
    syncSiteUrlToDeploymentEnvNames: ["SITE_URL", "CONVEX_SITE_URL"],
    buildSiteUrlEnvVarName: "VITE_CONVEX_SITE_URL",
  },
  {
    id: "noter-starter-template",
    projectName: "noter-starter-template",
    rootDir: "apps/noter-starter-template",
    destinationDir: "dist",
    frontendBuildCommand: "pnpm run build",
    productionBranch: "main",
    productionDeployKeyEnvVar:
      "NOTER_STARTER_TEMPLATE_CONVEX_PRODUCTION_DEPLOY_KEY",
    previewDeployKeyEnvVar: "NOTER_STARTER_TEMPLATE_CONVEX_PREVIEW_DEPLOY_KEY",
    pathIncludes: STARTER_TEMPLATE_PATH_INCLUDES,
    prCommentsEnabled: true,
    previewDeploymentSetting: "all",
  },
] satisfies readonly CloudflarePagesAppConfig[];

/**
 * Cloudflare runs the Pages build command from the app-specific `rootDir`, so
 * the repo-owned wrapper path must be rewritten relative to that working tree.
 */
export function buildCloudflarePagesAppBuildCommand(
  app: CloudflarePagesAppConfig,
): string {
  const relativeBuildWrapperPath = path.posix.relative(
    app.rootDir,
    BUILD_SCRIPT_REPO_PATH,
  );
  const wrappedCommand = `node ${relativeBuildWrapperPath} ${app.id}`;
  return `npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd ${JSON.stringify(
    wrappedCommand,
  )}`;
}

export function getCloudflarePagesApp(appId: string): CloudflarePagesAppConfig {
  const app = cloudflarePagesApps.find((candidate) => candidate.id === appId);
  if (!app) {
    const knownApps = cloudflarePagesApps.map((candidate) => candidate.id);
    throw new Error(
      `Unknown Cloudflare Pages app ${JSON.stringify(appId)}. Expected one of ${knownApps
        .map((value) => JSON.stringify(value))
        .join(", ")}.`,
    );
  }
  return app;
}
