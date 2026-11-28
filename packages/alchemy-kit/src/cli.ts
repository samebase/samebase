#!/usr/bin/env node
// The command of the package:
//
//   alchemy-kit stack-comment
//
// stack-comment runs as a step of a pull request workflow after the deploys, and keeps one comment
// with the stacks of the repository: see src/stack-comment/StackComment.ts. It needs GITHUB_TOKEN,
// and reads the state store that the repository's alchemy.run.ts configures, for the stage of the
// pull request.
import { parseArgs } from "node:util";
import * as Alchemist from "alchemy/Alchemist";
import * as Effect from "effect/Effect";
import { runRecord } from "./run-record/RunRecord.ts";
import { StackCommentError, updateStackComment } from "./stack-comment/StackComment.ts";

const { positionals } = parseArgs({ allowPositionals: true, options: {} });
const USAGE = `Usage:
  alchemy-kit stack-comment`;

const stackComment = Effect.gen(function* () {
  const { pullRequest } = yield* runRecord({ cwd: process.cwd(), env: process.env });
  if (pullRequest === null) {
    return yield* new StackCommentError({ reason: "this run has no pull request" });
  }
  const store = Alchemist.State.layer({ type: "configured", stage: `pr-${pullRequest}` });
  return yield* updateStackComment.pipe(Effect.provide(store));
}).pipe(
  Effect.tap((url) => Effect.sync(() => console.log(url))),
  Effect.provide(Alchemist.layer()),
  Effect.scoped,
);

if (positionals.join(" ") !== "stack-comment") {
  console.error(USAGE);
  process.exit(1);
}

await Effect.runPromise(stackComment).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
