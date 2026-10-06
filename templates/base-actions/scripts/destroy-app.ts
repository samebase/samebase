// Destroys the whole app: the destroy-app job of .github/workflows/alchemy.yml
// runs it after the typed confirmation. It needs the three credentials of the
// deploy.
//
// 1. A dry run of the deploy below opens the state store with --yes, which
//    upgrades an out-of-date store; the `alchemy state` commands cannot. A
//    stack without state ends the run here: there is nothing to destroy.
//    That includes a stack that a destroy without DESTROY_APP removed: the
//    Worker and the Convex project it kept stay in the accounts, to delete in
//    their dashboards.
// 2. A destroy reads the removal policy of each resource from the state that
//    the last deploy wrote, and that policy keeps the production Worker and
//    the Convex project. So it deploys only those two with DESTROY_APP=true,
//    which rewrites their policy (alchemy.run.ts) and changes nothing else.
// 3. `alchemy destroy --stage prod` deletes the Workers Builds link, the two
//    Convex deploy keys, the Worker with its Previews, and the Convex project
//    with all its deployments, the preview deployments of the branches too.
// 4. It deletes what is left of the stack's state, so a later repository with
//    the same name starts clean.
//
// `--backend cloudflare` opens the account's default state store, the one
// that `state: Cloudflare.state()` in alchemy.run.ts configures, without
// loading alchemy.run.ts.
/// <reference types="node" />
import { execFileSync } from "node:child_process";
import process from "node:process";

import { deployNames } from "./deploy-names.ts";

const alchemy = (args: string[]) =>
  execFileSync("pnpm", ["exec", "alchemy", ...args], {
    env: { ...process.env, DESTROY_APP: "true" },
    stdio: "inherit",
  });

const { stack } = deployNames();
/** Whether the state store has the stack. The other stacks of the account stay out of the log. */
const hasStack = () =>
  execFileSync("pnpm", ["exec", "alchemy", "state", "list", "--backend", "cloudflare"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  })
    .split("\n")
    .map((line) => line.trim())
    .includes(`${stack}/`);

const deployWorkerAndProject = [
  "deploy",
  "--stage",
  "prod",
  "--include",
  "Worker",
  "--include",
  "Project",
  "--yes",
  "--no-input",
];
alchemy([...deployWorkerAndProject, "--dry-run"]);
if (!hasStack()) {
  console.log(`The state store has no stack ${stack}: nothing to destroy.`);
} else {
  alchemy(deployWorkerAndProject);
  alchemy(["destroy", "--stage", "prod", "--yes", "--no-input"]);
  if (hasStack()) {
    alchemy(["state", "delete", "--recursive", stack, "--backend", "cloudflare"]);
  }
  console.log(`Destroyed the app and deleted the state of the stack ${stack}.`);
}
