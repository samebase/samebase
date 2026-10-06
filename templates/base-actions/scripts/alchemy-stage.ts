// The Alchemy stage of a run of .github/workflows/alchemy.yml. The script
// appends STAGE and PREVIEW_BRANCH to GITHUB_ENV for the later steps.
//
// The default branch deploys the stage `prod`, and PREVIEW_BRANCH is empty.
// Every other branch is a preview: the stage is the branch made safe by
// `alchemyStage`, and PREVIEW_BRANCH is the branch itself, which
// alchemy.run.ts gives to the Convex preview deployment. The destroy of a
// deleted branch computes the same stage.
/// <reference types="node" />
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/**
The stage of a branch. The default branch is `prod`. Any other branch is
lowercased, every run of characters outside `a-z` and `0-9` becomes one dash,
and the dashes at both ends go. When that safe form differs from the branch, a
dash and the first 6 hex characters of the SHA-256 of the branch (UTF-8)
follow, so two branches that differ only in case or punctuation never share a
stage. The result always matches the Alchemy stage pattern
`^[a-z0-9]+([-_a-z0-9]+)*$`.
*/
export function alchemyStage(args: { branch: string; defaultBranch: string }): string {
  if (args.branch === args.defaultBranch) {
    return "prod";
  }
  const safe = args.branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (safe === "") {
    throw new Error(
      `The branch ${JSON.stringify(args.branch)} has no letter or digit, so it has no preview stage. Rename the branch.`,
    );
  }
  const stage =
    safe === args.branch
      ? safe
      : `${safe}-${createHash("sha256").update(args.branch).digest("hex").slice(0, 6)}`;
  if (stage === "prod") {
    throw new Error(
      `The branch ${JSON.stringify(args.branch)} would deploy a preview as the stage prod. Rename the branch.`,
    );
  }
  return stage;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const branch = process.env["BRANCH"] ?? "";
  const defaultBranch = process.env["DEFAULT_BRANCH"] ?? "";
  const githubEnv = process.env["GITHUB_ENV"] ?? "";
  if (branch === "" || defaultBranch === "" || githubEnv === "") {
    throw new Error(
      "BRANCH, DEFAULT_BRANCH, and GITHUB_ENV must be set. .github/workflows/alchemy.yml sets them.",
    );
  }
  const stage = alchemyStage({ branch, defaultBranch });
  // Git ref names have no control characters, so a branch fits on one line.
  appendFileSync(githubEnv, `STAGE=${stage}\nPREVIEW_BRANCH=${stage === "prod" ? "" : branch}\n`);
  console.log(`The branch ${JSON.stringify(branch)} has the stage ${stage}.`);
}
