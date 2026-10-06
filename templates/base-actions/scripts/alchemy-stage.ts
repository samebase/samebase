// Samebase source build: v2095
/// <reference types="node" />
// The Alchemy stage of a GitHub Actions run, appended to GITHUB_ENV as STAGE.
//
// A push deploys `prod`. A pull request deploys as its branch name made safe
// for an Alchemy stage and a Worker Preview name: lowercase, every run of
// other characters as one dash, no dash at the ends (`feature/Foo_bar`
// becomes `feature-foo-bar`). alchemy.run.ts reads PREVIEW_BRANCH for the
// branch itself and names the Convex preview deployment after it.
import { appendFileSync } from "node:fs";
import process from "node:process";

const branch = process.env["PREVIEW_BRANCH"] ?? "";
const stage =
  branch === ""
    ? "prod"
    : branch
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
if (branch !== "" && (stage === "" || stage === "prod")) {
  console.error(`The branch ${JSON.stringify(branch)} cannot be a preview stage.`);
  process.exit(1);
}

const githubEnv = process.env["GITHUB_ENV"];
if (!githubEnv) {
  console.error("GITHUB_ENV is not set. This script runs in GitHub Actions.");
  process.exit(1);
}
appendFileSync(githubEnv, `STAGE=${stage}\n`);
console.log(`STAGE=${stage}`);
