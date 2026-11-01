// The stack of the team's identity hub, with one stage: `prod` is the production deployment of the
// Convex project `identity-hub`, and nothing else is deployed. The hub has no previews: no app points at
// one, and Google cannot sign in on one, since only the production callback is registered at Google.
// The push is the `deploy` package script, which checks the key set and pushes the functions. The
// state of this stack is in the project `alchemy-state-store`, with the state of every other stack.
// .github/workflows/identity-hub.yml runs it from this folder.
//
// The stack name is the repository and the folder of this file: the stack of the repository root is
// named samebase/samebase, and a stack in a folder samebase/samebase/<folder>. The stacks that this
// hub had in its own repository are not read. The project and the deployment exist already, and
// this stack did not create them, so both are adopted and retained. Adoption changes the variables
// of `env` and the code; it leaves every other variable, the data, and the project as they are.
//
// Every run needs the team token CONVEX_ACCESS_TOKEN, or a Convex CLI login (`npx convex login`)
// on a laptop; it mints the deploy key itself. Every run also reads the Google and GitHub client
// ids and secrets and hands them to the deployment, for the three connectors: no connector variable
// is ever set by hand. IDENTITY_BROKER_KEYS is not in `env`: it stays on the deployment, and the
// `deploy` script stops when it is missing. REGISTRATION_ACCESS_TOKEN is not in `env` either: it
// stays on the deployment too and is set by hand, and `/register` refuses every request without it.
import * as Convex from "@samebase/alchemy-convex";
import * as Alchemy from "alchemy";
import { adopt } from "alchemy/AdoptPolicy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

/** The Convex team that holds the project and the state. */
const team = "nicu";

export default Alchemy.Stack(
  "samebase/samebase/apps/identity-hub",
  { providers: Convex.providers(), state: Convex.state({ team }) },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack;
    // One stage: any other name would push this code over the same production deployment.
    if (stage !== "prod") {
      throw new Error(`This stack has one stage, prod. The stage ${stage} is not deployed.`);
    }
    const source = {
      path: "./convex",
      command: ["node", "--run", "deploy"],
      // The push inputs besides the functions, package.json, and the lockfile.
      include: ["scripts/**", "tsconfig*.json"],
    } satisfies Convex.Source;
    // The variables of the deployment. The secret is a prop, so the state store holds it next to
    // the deployment it serves.
    const env = {
      ISSUER: "https://auth.samebase.com",
      GOOGLE_CLIENT_ID: yield* Config.String("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: yield* Config.Redacted("GOOGLE_CLIENT_SECRET"),
      GOOGLE_APPS_CLIENT_ID: yield* Config.String("GOOGLE_APPS_CLIENT_ID"),
      GOOGLE_APPS_CLIENT_SECRET: yield* Config.Redacted("GOOGLE_APPS_CLIENT_SECRET"),
      AUTH_GITHUB_CLIENT_ID: yield* Config.String("AUTH_GITHUB_CLIENT_ID"),
      AUTH_GITHUB_CLIENT_SECRET: yield* Config.Redacted("AUTH_GITHUB_CLIENT_SECRET"),
    };
    const project = yield* Convex.Project("Project", { team, name: "identity-hub" }).pipe(
      adopt(true),
      RemovalPolicy.retain(),
    );
    const deployment = yield* Convex.Deployment("Deployment", {
      project,
      type: "prod",
      source,
      env,
    }).pipe(adopt(true), RemovalPolicy.retain());
    return { url: deployment.siteUrl };
  }),
);
