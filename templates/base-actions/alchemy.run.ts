// The setup stack of this app. Workers Builds deploys the app; this stack
// declares the setup around it. The split follows the Samebase research note
// "Alchemy setup stacks next to Workers Builds"
// (research/2026-10-05-alchemy-setup-stack-and-wrangler-split.md in the
// Samebase repository): the stack owns wiring, not settings, and each field
// has one owner.
//
// - This stack owns the Worker shell, the Workers Builds link to this
//   repository with its build variables, the Convex project, and the two
//   Convex deploy keys that the builds use. It never uploads Worker code.
// - cloudflare.config.ts owns everything of the Worker version: the assets,
//   the compatibility date, and Preview URLs. This file imports only the
//   Worker name from it.
// - Workers Builds builds every push: `pnpm run build` deploys Convex (the
//   production deployment on main, a preview deployment named after the
//   branch on other branches) and creates the Convex Auth keys, then
//   `pnpm run deploy` or `pnpm run deploy:preview` uploads the Worker.
//
// One stage, `prod`. .github/workflows/alchemy.yml runs it: a plan and a
// drift report on a pull request that changes the stack, a deploy on main.
// The deploy that creates the Builds link also starts the first build (see
// FirstBuild below). A destroy of the stage keeps the Worker and the Convex
// project, the production app, unless DESTROY_APP marked them for deletion
// (see keepProductionApp below).
//
// The outputs: `workerUrl`, the workers.dev URL of the Worker, and
// `convexUrl`, the URL of the production Convex deployment.
//
// A deploy from a laptop needs GITHUB_REPOSITORY (`<owner>/<repository>`),
// CONVEX_TEAM_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID in the
// environment or in .env, CONVEX_ACCESS_TOKEN or the Convex CLI login, and
// GITHUB_TOKEN for a private repository:
//   pnpm exec alchemy deploy --stage prod
import * as WorkersBuilds from "@samebase/alchemy-cloudflare-workers-builds";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { worker } from "./cloudflare.config.ts";
import { deployNames } from "./scripts/deploy-names.ts";

const names = deployNames();

/**
 * Whether a destroy of stage prod keeps the production Worker and the Convex
 * project: yes by default. Alchemy reads a removal policy from the state row
 * that the last deploy wrote, not from this program, so a destroy acts on the
 * policy of the last deploy. scripts/destroy-app.ts, the confirmed destroy of
 * the app, deploys the Worker and the project with DESTROY_APP=true, which
 * only rewrites their policy, and then destroys the stage, so it deletes
 * them. Any later deploy without DESTROY_APP keeps them again.
 */
const keepProductionApp = Effect.gen(function* () {
  return !(yield* Config.Boolean("DESTROY_APP").pipe(Config.withDefault(false)));
}).pipe(Effect.orDie);

/**
 * Starts the first production build of the Builds link. Workers Builds builds
 * the pushes that reach it after the link exists. Samebase pushes the starter
 * to main before this stack creates the link, and creating the link through
 * the API starts no build, so without this the Worker stays a shell with no
 * version until the next push to main. Samebase's own Workers Builds setup
 * starts the same build after it creates a link.
 *
 * An Action runs on a deploy when its input differs from its last successful
 * run, and on `alchemy deploy --force`. The input is the Worker tag and the
 * production branch, so it runs on the deploy that creates the link, and
 * again only for a new Worker or another production branch.
 */
const FirstBuild = Alchemy.Action(
  "FirstBuild",
  Effect.fn(function* (link: { accountId: string; scriptTag: string; branch: string }) {
    // The Builds API accepts only an API token, the token of the Builds link.
    const token = yield* Config.Redacted("CLOUDFLARE_API_TOKEN");
    const request = (path: string, init?: { method: "POST"; body: string }) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${link.accountId}/builds${path}`,
            {
              ...init,
              headers: {
                authorization: `Bearer ${Redacted.value(token)}`,
                "content-type": "application/json",
              },
            },
          );
          // Cloudflare answers some errors with a body that is not JSON.
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
          }
          const body: unknown = JSON.parse(text);
          return body;
        },
        catch: (cause) => new Error(`The Workers Builds request ${path} failed. ${String(cause)}`),
      });

    const { result: triggers } = Schema.decodeUnknownSync(
      Schema.Struct({
        result: Schema.Array(
          Schema.Struct({
            trigger_uuid: Schema.String,
            branch_includes: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
            deleted_on: Schema.optionalKey(Schema.NullOr(Schema.String)),
          }),
        ),
      }),
    )(yield* request(`/workers/${link.scriptTag}/triggers`));
    // The production trigger builds exactly the production branch.
    const production = triggers.filter(
      (trigger) =>
        !trigger.deleted_on &&
        trigger.branch_includes?.length === 1 &&
        trigger.branch_includes[0] === link.branch,
    );
    if (production.length !== 1) {
      return yield* Effect.die(
        new Error(
          `Workers Builds has ${production.length} production triggers for ${link.branch}, not one. Start the first build in the Cloudflare dashboard.`,
        ),
      );
    }

    // With only the branch, Workers Builds builds the head of the branch.
    yield* request(`/triggers/${production[0].trigger_uuid}/builds`, {
      method: "POST",
      body: JSON.stringify({ branch: link.branch }),
    });
    return { triggerUuid: production[0].trigger_uuid };
  }),
);

export default Alchemy.Stack(
  names.stack,
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      WorkersBuilds.providers(),
      Convex.providers(),
    ),
    // The Cloudflare state store: an encrypted Durable Object in the account,
    // shared by the laptop and GitHub Actions.
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    if (stage !== "prod") {
      return yield* Effect.die(
        new Error(`Stage "${stage}" is not prod. This stack has one stage: --stage prod.`),
      );
    }

    // An unset repository variable reaches the workflow as an empty string.
    const teamId = yield* Config.String("CONVEX_TEAM_ID").pipe(Config.withDefault(""));
    if (!/^\d+$/.test(teamId)) {
      return yield* Effect.die(
        new Error(
          `CONVEX_TEAM_ID is "${teamId}", not the numeric id of a Convex team. Set the repository variable CONVEX_TEAM_ID. For a deploy from a laptop, set it in the environment or in .env.`,
        ),
      );
    }

    // Only the name: every other Worker setting stays with cloudflare.config.ts.
    // A Worker with this name that the stack did not create stops the deploy
    // until `alchemy deploy --adopt`.
    const shell = yield* WorkersBuilds.Worker("Worker", { name: worker.name }).pipe(
      Alchemy.RemovalPolicy.retain(keepProductionApp),
    );

    // Found by name when it has no state, then by id. Deleting the project
    // deletes all of its deployments and data.
    const project = yield* Convex.Project("Project", {
      team: Number(teamId),
      name: names.convexProject,
    }).pipe(Alchemy.RemovalPolicy.retain(keepProductionApp));
    const deployment = Output.map(project.prodDeploymentName, (name) => {
      if (!name) {
        throw new Error(`The Convex project ${names.convexProject} has no production deployment.`);
      }
      return name;
    });

    // Convex lists each key under its name plus a hash of the resource, such
    // as "workers-builds-3f2a1b0c9d8e". A key cannot change, so a changed prop
    // replaces it, and the Builds variables below take the new secret.
    //
    // The production key gets only what scripts/build-cloudflare.ts and
    // scripts/ensure-convex-auth.ts need. Without allowedActions, Convex
    // grants every deployment action, including data writes and backup
    // deletes.
    const deployKey = yield* Convex.DeployKey("DeployKey", {
      deployment,
      name: "workers-builds",
      allowedActions: [
        "deployment:deploy",
        "deployment:env:view",
        "deployment:env:write",
        "deployment:data:view",
      ],
    });
    const previewKey = yield* Convex.PreviewDeployKey("PreviewDeployKey", {
      projectId: project.projectId,
      name: "workers-builds",
    });

    // The production branch is the default branch of the repository, which
    // the provider reads from GitHub. Samebase makes main the default branch,
    // and scripts/build-cloudflare.ts deploys production Convex only on main.
    const builds = yield* WorkersBuilds.Repository("Builds", {
      worker: shell.workerId,
      repository: names.repository,
      buildCommand: "pnpm run build",
      deployCommand: "pnpm run deploy",
      previewDeployCommand: "pnpm run deploy:preview",
      buildCachingEnabled: false,
      previews: true,
      // scripts/build-cloudflare.ts reads CONVEX_DEPLOY_KEY: the production
      // key on main, the project preview key on other branches. Samebase
      // reads SAMEBASE_CONVEX_PROJECT to link the Worker to its Convex
      // project in the dashboard. Same format Samebase writes itself.
      variables: {
        CONVEX_DEPLOY_KEY: deployKey.deployKey,
        SAMEBASE_CONVEX_PROJECT: Output.interpolate`version=1&teamId=${project.teamId}&projectId=${project.projectId}`,
      },
      previewVariables: { CONVEX_DEPLOY_KEY: previewKey.previewDeployKey },
    });

    yield* FirstBuild({
      accountId: builds.accountId,
      scriptTag: builds.scriptTag,
      branch: builds.repository.branch,
    });

    return { workerUrl: shell.url, convexUrl: project.prodDeploymentUrl };
  }),
);
