// Deletes the whole state of this app's stack from the Alchemy state store,
// after the destroy-app job of .github/workflows/alchemy.yml destroyed stage
// prod: the rows of the preview stages and every stage output. Their cloud
// resources went with the Worker and the Convex project, so a later
// repository with the same name starts with an empty stack. A rerun finds no
// stack and changes nothing. It needs the Cloudflare credentials of the
// destroy step.
//
// `--backend cloudflare` opens the account's default state store, the one
// that `state: Cloudflare.state()` in alchemy.run.ts configures, without
// loading alchemy.run.ts.
/// <reference types="node" />
import { execFileSync } from "node:child_process";

import { deployNames } from "./deploy-names.ts";

const runStateCommand = (args: string[]) =>
  execFileSync("pnpm", ["exec", "alchemy", "state", ...args, "--backend", "cloudflare"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const { stack } = deployNames();
// One line per stack of the account, as `<stack>/`. The other stacks of the
// account stay out of the log.
const stacks = runStateCommand(["list"])
  .split("\n")
  .map((line) => line.trim());
if (stacks.includes(`${stack}/`)) {
  runStateCommand(["delete", "--recursive", stack]);
  console.log(`Deleted the state of the stack ${stack}.`);
} else {
  console.log(`The state store has no stack ${stack}.`);
}
