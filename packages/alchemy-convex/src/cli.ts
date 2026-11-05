#!/usr/bin/env node
// The commands of the package:
//
//   alchemy-convex hub-client --team <team> --app <app> --callback-path <path> [--env-prefix HUB]
//   alchemy-convex hub-client --shared --stack <owner/name> --app <app> --callback-path <path>
//     [--env-prefix HUB] [--team <team>]
//   alchemy-convex stack-comment [--team <team>]
//
// hub-client runs in the directory of a Convex app at each dev start, and renews the client of the
// identity hub of the team that the development deployment of that directory has, or gives it a new
// one: see registerDevelopmentClient. With --shared, the client is on the central identity hub, and
// the initial access token of the stack's production client is the proof: see
// registerSharedDevelopmentClient. It never stops a dev start. stack-comment runs as a step of a pull
// request workflow after the deploys, and keeps one comment with the stacks of the repository: see
// src/StackComment.ts. It needs GITHUB_TOKEN and, with a team access token, no --team. All use
// CONVEX_ACCESS_TOKEN or the Convex CLI login.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { fromConfig } from "./Credentials.ts";
import { registerDevelopmentClient } from "./HubClient.ts";
import { ManagementApiLive } from "./ManagementApi.ts";
import { installedCli } from "./Push.ts";
import { registerSharedDevelopmentClient } from "./SharedHubClient.ts";
import { updateStackComment } from "./StackComment.ts";
import { state } from "./State.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    team: { type: "string" },
    app: { type: "string" },
    "callback-path": { type: "string" },
    "env-prefix": { type: "string" },
    shared: { type: "boolean" },
    stack: { type: "string" },
  },
});
const { team, app, "callback-path": callbackPath, "env-prefix": envPrefix, shared, stack } = values;
const USAGE = `Usage:
  alchemy-convex hub-client --team <team> --app <app> --callback-path <path> [--env-prefix HUB]
  alchemy-convex hub-client --shared --stack <owner/name> --app <app> --callback-path <path> [--env-prefix HUB] [--team <team>]
  alchemy-convex stack-comment [--team <team>]`;

/** The installed Convex CLI on the deployment of this directory. Secrets go on standard input. */
const convexOfThisDirectory = installedCli(process.cwd()).pipe(
  Effect.map(
    ([command, ...prefix]) =>
      (args: readonly string[], input?: string) =>
        execFileSync(command, [...prefix, ...args], {
          encoding: "utf8",
          input,
          stdio: ["pipe", "pipe", "inherit"],
        }).trim(),
  ),
);

const managementApi = ManagementApiLive().pipe(Layer.provide(fromConfig()));

const hubClient = (hub: { team: string; app: string; callbackPath: string; envPrefix?: string }) =>
  Effect.gen(function* () {
    const callbackUrl = yield* registerDevelopmentClient({
      ...hub,
      convex: yield* convexOfThisDirectory,
    });
    console.log(
      callbackUrl === undefined
        ? "Hub client renewed."
        : `Hub client registered for ${callbackUrl}.`,
    );
  }).pipe(Effect.provide(managementApi));

const sharedHubClient = (hub: {
  stack: string;
  app: string;
  callbackPath: string;
  envPrefix?: string;
  team?: string;
}) =>
  convexOfThisDirectory.pipe(
    Effect.flatMap((convex) =>
      registerSharedDevelopmentClient({ ...hub, cwd: process.cwd(), convex }),
    ),
    // Without the Convex CLI, the dev start goes on too.
    Effect.catchTag("ConvexCliNotFound", (error) => Effect.succeed(error.message)),
    Effect.tap((line) => Effect.sync(() => console.log(line))),
    Effect.provide(managementApi),
  );

const stackComment = (options: { team?: string }) =>
  updateStackComment.pipe(
    Effect.tap((url) => Effect.sync(() => console.log(url))),
    Effect.provide(state(options).pipe(Layer.provide(NodeServices.layer))),
  );

const prefix = envPrefix === undefined ? {} : { envPrefix };
const subcommand = positionals.join(" ");
const program: Effect.Effect<unknown, unknown> | undefined =
  subcommand === "stack-comment"
    ? stackComment(team === undefined ? {} : { team })
    : subcommand !== "hub-client" || app === undefined || callbackPath === undefined
      ? undefined
      : shared === true
        ? stack === undefined
          ? undefined
          : sharedHubClient({
              stack,
              app,
              callbackPath,
              ...prefix,
              ...(team === undefined ? {} : { team }),
            })
        : team === undefined
          ? undefined
          : hubClient({ team, app, callbackPath, ...prefix });
if (program === undefined) {
  console.error(USAGE);
  process.exit(1);
}

await Effect.runPromise(program).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
