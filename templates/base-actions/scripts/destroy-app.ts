// Destroys the whole app: the destroy-app job of .github/workflows/alchemy.yml
// runs it after the typed confirmation. It needs the three credentials of the
// deploy.
//
// 1. A destroy reads the removal policy of each resource from the state that
//    the last deploy wrote, and that policy keeps the production Worker and
//    the Convex project. So it first deploys only those two with
//    DESTROY_APP=true, which rewrites their policy (alchemy.run.ts) without a
//    push or an upload.
// 2. `alchemy destroy --stage prod` deletes the Worker with its Previews and
//    the Convex project with all its deployments.
// 3. It deletes the stack's whole state: the rows of the preview stages and
//    every stage output, whose cloud resources went with the Worker and the
//    project, so a later repository with the same name starts clean.
//
// Steps 1 and 2 run only while stage prod has state, so a rerun after a
// destroy never creates the app to delete it again; a rerun with no stack
// changes nothing.
//
// `--backend cloudflare` opens the account's default state store, the one
// that `state: Cloudflare.state()` in alchemy.run.ts configures, without
// loading alchemy.run.ts.
/// <reference types="node" />
import { execFileSync } from "node:child_process";
import process from "node:process";

import { deployNames } from "./deploy-names.ts";

/** The lines of an `alchemy state list`, one per child, as `<path>/`. */
const listState = (path: string[]) =>
  execFileSync("pnpm", ["exec", "alchemy", "state", "list", ...path, "--backend", "cloudflare"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
    .split("\n")
    .map((line) => line.trim());

const alchemy = (args: string[]) =>
  execFileSync("pnpm", ["exec", "alchemy", ...args], {
    env: { ...process.env, DESTROY_APP: "true" },
    stdio: "inherit",
  });

const { stack } = deployNames();
// The other stacks of the account stay out of the log.
if (!listState([]).includes(`${stack}/`)) {
  console.log(`The state store has no stack ${stack}: nothing to destroy.`);
} else {
  if (listState([stack]).includes(`${stack}/prod/`)) {
    alchemy([
      "deploy",
      "--stage",
      "prod",
      "--include",
      "Worker",
      "--include",
      "Project",
      "--yes",
      "--no-input",
    ]);
    alchemy(["destroy", "--stage", "prod", "--yes", "--no-input"]);
  }
  alchemy(["state", "delete", "--recursive", stack, "--backend", "cloudflare"]);
  console.log(`Destroyed the app and deleted the state of the stack ${stack}.`);
}
