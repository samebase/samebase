import { afterEach, describe, expect, it } from "vitest";

import { getCloudflarePagesApp } from "./cloudflare-pages-apps.ts";
import {
  buildCloudflarePagesProjectPayload,
  buildManagedPagesEnvVars,
  parseCloudflarePagesSyncArgs,
  parseGitHubRepoSlugFromRemoteUrl,
  redactCloudflarePagesProjectPayload,
} from "./cloudflare-pages-sync.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("cloudflare-pages-sync", () => {
  it("parses the CLI arguments for dry-run and targeted app syncs", () => {
    expect(
      parseCloudflarePagesSyncArgs(["--dry-run", "--app", "noter"]),
    ).toEqual({
      dryRun: true,
      appIds: ["noter"],
    });
  });

  it("parses GitHub repo slugs from both HTTPS and SSH remotes", () => {
    expect(
      parseGitHubRepoSlugFromRemoteUrl("https://github.com/noter-md/noter.git"),
    ).toEqual({
      owner: "noter-md",
      repo: "noter",
    });

    expect(
      parseGitHubRepoSlugFromRemoteUrl("git@github.com:noter-md/noter.git"),
    ).toEqual({
      owner: "noter-md",
      repo: "noter",
    });
  });

  it("builds the Cloudflare Pages payload for the shipped noter app", () => {
    process.env.NOTER_CONVEX_PRODUCTION_DEPLOY_KEY = "prod:key";
    process.env.NOTER_CONVEX_PREVIEW_DEPLOY_KEY = "preview:key";
    process.env.NOTER_SITE_URL = "https://noter.md";

    const payload = buildCloudflarePagesProjectPayload(
      {
        id: "123",
        ownerId: "456",
        owner: "noter-md",
        repo: "noter",
      },
      getCloudflarePagesApp("noter"),
    );

    expect(payload).toMatchObject({
      name: "noter",
      build_config: {
        root_dir: "apps/noter",
        destination_dir: "dist",
      },
      source: {
        type: "github",
        config: {
          owner: "noter-md",
          repo_name: "noter",
          repo_id: "123",
          owner_id: "456",
          production_branch: "main",
          preview_deployment_setting: "all",
          pr_comments_enabled: true,
        },
      },
      deployment_configs: {
        production: {
          env_vars: {
            CONVEX_DEPLOY_KEY: {
              type: "secret_text",
              value: "prod:key",
            },
            CONVEX_SITE_URL: {
              type: "plain_text",
              value: "https://noter.md",
            },
          },
        },
        preview: {
          env_vars: {
            CONVEX_DEPLOY_KEY: {
              type: "secret_text",
              value: "preview:key",
            },
          },
        },
      },
    });
    expect(payload.build_config.build_command).toContain(
      "cloudflare-pages-build.ts noter",
    );
  });

  it("redacts secret deploy keys before dry-run output", () => {
    const redacted = redactCloudflarePagesProjectPayload({
      name: "noter",
      production_branch: "main",
      build_config: {
        build_command: "node scripts/cloudflare-pages-build.ts noter",
        root_dir: "apps/noter",
        destination_dir: "dist",
      },
      deployment_configs: {
        production: {
          env_vars: buildManagedPagesEnvVars({
            deployKey: "prod:key",
          }),
        },
        preview: {
          env_vars: buildManagedPagesEnvVars({
            deployKey: "preview:key",
          }),
        },
      },
      source: {
        type: "github",
        config: {
          owner: "noter-md",
          owner_id: "456",
          repo_name: "noter",
          repo_id: "123",
          production_branch: "main",
          production_deployments_enabled: true,
          preview_deployment_setting: "all",
          pr_comments_enabled: true,
          path_includes: ["apps/noter/*"],
        },
      },
    });

    expect(redacted.deployment_configs.preview.env_vars).toEqual({
      CONVEX_DEPLOY_KEY: {
        type: "secret_text",
        value: "<redacted>",
      },
    });
  });
});
