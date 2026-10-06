// The deploy stack of this app. One stack owns the Convex backend and the
// Cloudflare Worker, and pushes code to both on every deploy.
//
// - Stage `prod` (push to main): the Convex project and its production
//   deployment, the Convex Auth keys, the functions push, and the Worker.
// - A pull request: the stage is the branch name made safe for a stage and a
//   Worker Preview name (scripts/alchemy-stage.ts), and PREVIEW_BRANCH holds
//   the branch itself. A Convex preview deployment named after the branch, the
//   name `npx convex deploy --preview-name` gives it, and a Worker Preview of
//   the prod Worker named after the stage. `alchemy destroy --stage <stage>`
//   deletes both.
// - No other stage. `pnpm run dev` runs Convex and Vite without Alchemy.
//
// .github/workflows/alchemy.yml runs the deploys. A deploy from a laptop needs
// GITHUB_REPOSITORY (`<owner>/<repository>`), CONVEX_TEAM_ID,
// CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID in the environment or in
// .env, and CONVEX_ACCESS_TOKEN or the Convex CLI login:
//   pnpm exec alchemy deploy --stage prod
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// The stack, the Worker, and the Convex project take the name of the
// repository, so every app made from this template gets its own. The stack
// name also keeps apps apart in the Cloudflare state store: Alchemy keys state
// by stack name and stage, and all stacks of an account share one store.
// Alchemy reads the stack name when it loads this file, before the stack has
// its config, so this reads the process environment over .env, in the same
// order as the Alchemy CLI.
const startupConfig = existsSync(".env")
  ? ConfigProvider.orElse(
      ConfigProvider.fromEnv(),
      ConfigProvider.fromDotEnvContents(readFileSync(".env", "utf8")),
    )
  : ConfigProvider.fromEnv();
const repository = Effect.runSync(
  Config.String("GITHUB_REPOSITORY").pipe(Config.withDefault("")).parse(startupConfig),
);
const repositoryName = /^[^/]+\/([^/]+)$/.exec(repository)?.[1];
if (repositoryName === undefined) {
  throw new Error(
    `GITHUB_REPOSITORY is "${repository}", not "<owner>/<repository>". GitHub Actions sets it. For a deploy from a laptop, set it in the environment or in .env.`,
  );
}

// Samebase names resources after the repository the same way: lowercase,
// every run of other characters as one dash, no dash at the ends, cut to 54
// characters for a Worker with preview URLs and 40 for a Convex project.
const resourceName = (maxLength: number) =>
  repositoryName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
const workerName = resourceName(54);
const convexProjectName = resourceName(40);
if (workerName === "") {
  throw new Error(`The repository name "${repositoryName}" has no letter or digit.`);
}

// Convex Auth reads JWT_PRIVATE_KEY (PKCS#8 PEM, line breaks as spaces) and
// JWKS (the public key as a JSON Web Key Set). Same format as
// scripts/ensure-convex-auth.ts.
const authVariables = (keys: Alchemy.KeyPair) => ({
  JWT_PRIVATE_KEY: Output.map(keys.privateKey, (pem) =>
    Redacted.make(Redacted.value(pem).trimEnd().replace(/\n/g, " ")),
  ),
  JWKS: Output.map(keys.publicKey, (pem) =>
    JSON.stringify({ keys: [{ use: "sig", ...createPublicKey(pem).export({ format: "jwk" }) }] }),
  ),
});

/** The project, its production deployment, the auth keys, and the push. */
const production = Effect.gen(function* () {
  // An unset repository variable reaches the workflow as an empty string.
  const teamId = yield* Config.String("CONVEX_TEAM_ID").pipe(Config.withDefault(""));
  if (!/^\d+$/.test(teamId)) {
    return yield* Effect.die(
      new Error(
        `CONVEX_TEAM_ID is "${teamId}", not the numeric id of a Convex team. Set the repository variable CONVEX_TEAM_ID. For a deploy from a laptop, set it in the environment or in .env.`,
      ),
    );
  }

  const project = yield* Convex.Project("Project", {
    team: Number(teamId),
    name: convexProjectName,
  });
  const deployment = yield* Convex.Deployment("Deployment", {
    projectId: project.projectId,
    type: "prod",
  });
  const key = yield* Convex.DeployKey("DeployKey", {
    deployment: deployment.name,
    name: "alchemy",
    allowedActions: [
      "deployment:deploy",
      "deployment:env:view",
      "deployment:env:write",
      "deployment:data:view",
    ],
  });

  // Preview and dev deployments get their auth keys as project defaults:
  // a preview deploy key cannot set variables, and Convex copies the
  // defaults into each new deployment of that type.
  const nonProduction = authVariables(
    yield* Alchemy.KeyPair("NonProductionJwtKey", { algorithm: "rsa" }),
  );
  for (const deploymentType of ["preview", "dev"] as const) {
    for (const [name, value] of Object.entries(nonProduction)) {
      yield* Convex.DefaultEnvironmentVariable(`${deploymentType}-${name}`, {
        projectId: project.projectId,
        deploymentType,
        name,
        value,
      });
    }
  }

  return yield* Convex.Code("Functions", {
    deployment,
    deployKey: key.deployKey,
    cwd: ".",
    env: authVariables(yield* Alchemy.KeyPair("JwtKey", { algorithm: "rsa" })),
  });
});

/**
 * A preview deployment of the project that stage `prod` owns, and the push.
 * The deployment is named after the branch, like the preview that `npx convex
 * deploy --preview-name <branch>` makes, so a reader finds it under one name
 * on both deploy paths.
 */
const preview = (branch: string) =>
  Effect.gen(function* () {
    const project = yield* Convex.Project.ref("Project", { stage: "prod" });
    const deployment = yield* Convex.Deployment("Deployment", {
      projectId: project.projectId,
      type: "preview",
      name: branch,
    }).pipe(Alchemy.RemovalPolicy.destroy());
    const key = yield* Convex.PreviewDeployKey("PreviewDeployKey", {
      projectId: project.projectId,
      name: "alchemy",
    });
    return yield* Convex.Code("Functions", {
      deployment,
      deployKey: key.previewDeployKey,
      cwd: ".",
    });
  });

export default Alchemy.Stack(
  workerName,
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), Convex.providers()),
    // The Cloudflare state store: an encrypted Durable Object in the account,
    // shared by the laptop and GitHub Actions.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    // .github/workflows/alchemy.yml sets PREVIEW_BRANCH on pull requests and
    // passes the same branch, made safe by scripts/alchemy-stage.ts, as the
    // stage. Empty on a push.
    const previewBranch = yield* Config.String("PREVIEW_BRANCH").pipe(Config.withDefault(""));
    const isPreview = previewBranch !== "";
    if (isPreview && stage === "prod") {
      return yield* Effect.die(
        new Error(
          `PREVIEW_BRANCH is "${previewBranch}" on stage prod. A preview never deploys as prod.`,
        ),
      );
    }
    if (!isPreview && stage !== "prod") {
      return yield* Effect.die(
        new Error(
          `Stage "${stage}" is not prod and PREVIEW_BRANCH is empty. This stack deploys stage prod and pull request stages only.`,
        ),
      );
    }

    const backend = isPreview ? yield* preview(previewBranch) : yield* production;

    // The same settings as wrangler.jsonc in the Workers Builds template.
    // VITE_ variables go into the client bundle as import.meta.env.VITE_*.
    const settings = {
      compatibility: { date: "2026-05-14" },
      assets: {
        htmlHandling: "none",
        // Cloudflare SPA mode serves /index.html for unknown app routes.
        // vite.config.ts emits the TanStack Start shell there.
        notFoundHandling: "single-page-application",
      },
      env: { VITE_CONVEX_URL: backend.url },
    } as const;

    const site = isPreview
      ? yield* Cloudflare.Website.Vite("Website", {
          ...settings,
          // Alchemy names the Preview after the stage: the branch, made safe.
          preview: { of: yield* Cloudflare.Worker.ref("Website", { stage: "prod" }) },
        })
      : yield* Cloudflare.Website.Vite("Website", { ...settings, name: workerName });

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`
          **Preview:** ${site.url}

          Convex: ${backend.url}

          Built from commit ${github.sha.slice(0, 7)}. Alchemy updates this comment on each push.
        `,
      });
    }

    return { url: site.url, convexUrl: backend.url };
  }),
);
