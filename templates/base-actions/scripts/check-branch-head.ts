// Checks the branch on GitHub before .github/workflows/alchemy.yml deploys or
// destroys, so a stale run does nothing. The script appends `proceed=true` or
// `proceed=false` to GITHUB_OUTPUT, and the deploy or destroy step runs only
// on `proceed=true`.
//
//   node ./scripts/check-branch-head.ts deploy   # the commit is the branch head
//   node ./scripts/check-branch-head.ts destroy  # the branch is still deleted
/// <reference types="node" />
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

type FetchBranch = (url: string, init: RequestInit) => Promise<Response>;

/**
Whether the deploy or destroy step of this run should run. A deploy runs while
the commit of this run is the branch head: a rerun of an older push, or a run
that waited behind a newer push, does not deploy. A destroy runs while the
branch does not exist: a rerun of a delete after the branch was pushed again
keeps the new preview.
*/
export async function shouldProceed(
  mode: "deploy" | "destroy",
  env: NodeJS.ProcessEnv,
  fetchBranch: FetchBranch = fetch,
): Promise<boolean> {
  const branch = env["BRANCH"] ?? "";
  const repository = env["GITHUB_REPOSITORY"] ?? "";
  const token = env["GITHUB_TOKEN"] ?? "";
  const apiUrl = env["GITHUB_API_URL"] ?? "";
  const sha = env["GITHUB_SHA"] ?? "";
  if (branch === "" || repository === "" || token === "" || apiUrl === "" || sha === "") {
    throw new Error(
      "BRANCH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_API_URL, and GITHUB_SHA must be set. GitHub Actions and .github/workflows/alchemy.yml set them.",
    );
  }

  const response = await fetchBranch(
    `${apiUrl}/repos/${repository}/branches/${encodeURIComponent(branch)}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  let head: string | undefined;
  if (response.status !== 404) {
    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} for the branch ${JSON.stringify(branch)}.`,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("commit" in body) ||
      typeof body.commit !== "object" ||
      body.commit === null ||
      !("sha" in body.commit) ||
      typeof body.commit.sha !== "string"
    ) {
      throw new Error(`GitHub returned no head commit for the branch ${JSON.stringify(branch)}.`);
    }
    head = body.commit.sha;
  }

  switch (mode) {
    case "deploy":
      if (head === undefined) {
        console.log(`The branch ${JSON.stringify(branch)} no longer exists. Nothing was deployed.`);
        return false;
      }
      if (head !== sha) {
        console.log(
          `A newer push superseded this run: ${JSON.stringify(branch)} now points to ${head}, and this run is for ${sha}. Nothing was deployed.`,
        );
        return false;
      }
      return true;
    case "destroy":
      if (head !== undefined) {
        console.log(
          `The branch ${JSON.stringify(branch)} exists again at ${head}, so its preview stays. Nothing was destroyed.`,
        );
        return false;
      }
      return true;
    default:
      return mode satisfies never;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const mode = process.argv[2];
  const githubOutput = process.env["GITHUB_OUTPUT"] ?? "";
  if (mode !== "deploy" && mode !== "destroy") {
    throw new Error(`The mode is ${JSON.stringify(mode)}, not deploy or destroy.`);
  }
  if (githubOutput === "") {
    throw new Error("GITHUB_OUTPUT is not set. This script runs in GitHub Actions.");
  }
  appendFileSync(githubOutput, `proceed=${await shouldProceed(mode, process.env)}\n`);
}
