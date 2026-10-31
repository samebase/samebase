// Stage `prod` is the production deployment of the Convex project of this
// repository. Any other stage, such as `pr-42` for a pull request, is a
// preview deployment named after the stage, which `alchemy destroy` deletes.
// The push is the `deploy` script: convex-hosting builds the site, sets the
// Convex Auth keys, uploads the site, and pushes the functions.
//
// The stack is named after the repository, `owner/name`, and its Convex
// project after `name`. The state of every stage is in the `alchemy-state-store`
// project of the team, which Convex.state() creates on the first run. Every
// run needs the team token CONVEX_ACCESS_TOKEN, or a Convex CLI login
// (`npx convex login`) on a laptop; it mints the deploy keys itself.
import { execFileSync } from "node:child_process";
import * as GitHub from "@alchemy.run/github";
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** The Convex team that holds the project and the state: the variable CONVEX_TEAM_ID, an id or a slug. */
const team = process.env["CONVEX_TEAM_ID"];
if (team === undefined || team === "") {
  throw new Error("Set the repository variable CONVEX_TEAM_ID to your Convex team (README, Start).");
}

/** The GitHub repository, `owner/name`: GITHUB_REPOSITORY in Actions, else the origin remote. */
const repository =
  process.env["GITHUB_REPOSITORY"] ??
  /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(
    execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim(),
  )?.[1];
if (repository === undefined) {
  throw new Error("Set GITHUB_REPOSITORY to owner/name: the origin remote names no repository.");
}

export default Alchemy.Stack(
  repository,
  {
    // The GitHub provider has no resource here: it forgets the PreviewComment rows of older previews.
    providers: Layer.mergeAll(GitHub.providers(), Convex.providers()),
    state: Convex.state({ team }),
  },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    const source = {
      path: "./convex",
      command: ["node", "--run", "deploy"],
      // The build inputs. The functions, package.json, and the lockfile are always hashed.
      include: ["src/**", "public/**", "scripts/**", "vite.config.ts", "tsconfig*.json"],
    } satisfies Convex.Source;
    // The stage `prod` owns the project, and `alchemy destroy --stage prod` deletes it with
    // every deployment. A preview stage reads the project from the state of `prod`.
    const project =
      stage === "prod"
        ? yield* Convex.Project("Project", {
            team,
            name: repository.slice(repository.indexOf("/") + 1),
          }).pipe(RemovalPolicy.destroy())
        : yield* Convex.Project.ref("Project", { stage: "prod" });
    const deployment =
      stage === "prod"
        ? yield* Convex.Deployment("Deployment", { project, type: "prod", source })
        : yield* Convex.Deployment("Deployment", {
            project,
            type: "preview",
            name: stage,
            source,
          }).pipe(RemovalPolicy.destroy());

    return { url: deployment.siteUrl };
  }),
);
