#!/usr/bin/env node
// The command of the package:
//
//   alchemy-convex stack-comment
//
// stack-comment runs as a step of a pull request workflow after the deploys, and keeps one comment
// with the stacks of the repository: see src/StackComment.ts. It needs GITHUB_TOKEN, and reads the
// store of the team of CONVEX_ACCESS_TOKEN or of the Convex CLI login.
import { parseArgs } from "node:util";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { updateStackComment } from "./StackComment.ts";
import { state } from "./State.ts";

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const USAGE = `Usage:
  alchemy-convex stack-comment`;

const stackComment = updateStackComment.pipe(
  Effect.tap((url) => Effect.sync(() => console.log(url))),
  Effect.provide(state().pipe(Layer.provide(NodeServices.layer))),
);

if (positionals.join(" ") !== "stack-comment") {
  console.error(USAGE);
  process.exit(1);
}

await Effect.runPromise(stackComment).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
