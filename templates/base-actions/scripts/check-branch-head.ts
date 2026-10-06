// Keeps a stale run of .github/workflows/alchemy.yml from deploying. A rerun
// of an older push, or a run that waited behind a newer push to the same
// branch, has a commit that is no longer the head of the branch. The script
// appends `current=true` or `current=false` to GITHUB_OUTPUT, and the deploy
// step runs only on `current=true`.
/// <reference types="node" />
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

type FetchBranch = (url: string, init: RequestInit) => Promise<Response>;

/** Whether the commit of this run is still the head of its branch. */
export async function isBranchHead(
  env: NodeJS.ProcessEnv,
  fetchBranch: FetchBranch = fetch,
): Promise<boolean> {
  const branch = env["BRANCH"] ?? "";
  const sha = env["GITHUB_SHA"] ?? "";
  const repository = env["GITHUB_REPOSITORY"] ?? "";
  const token = env["GITHUB_TOKEN"] ?? "";
  const apiUrl = env["GITHUB_API_URL"] ?? "";
  if (branch === "" || sha === "" || repository === "" || token === "" || apiUrl === "") {
    throw new Error(
      "BRANCH, GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN, and GITHUB_API_URL must be set. GitHub Actions and .github/workflows/alchemy.yml set them.",
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
  if (response.status === 404) {
    console.log(`The branch ${JSON.stringify(branch)} no longer exists. Nothing was deployed.`);
    return false;
  }
  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} for the branch ${JSON.stringify(branch)}. Nothing was deployed.`,
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

  if (body.commit.sha !== sha) {
    console.log(
      `A newer push superseded this run: ${JSON.stringify(branch)} now points to ${body.commit.sha}, and this run is for ${sha}. Nothing was deployed.`,
    );
    return false;
  }
  return true;
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const githubOutput = process.env["GITHUB_OUTPUT"] ?? "";
  if (githubOutput === "") {
    throw new Error("GITHUB_OUTPUT is not set. This script runs in GitHub Actions.");
  }
  appendFileSync(githubOutput, `current=${await isBranchHead(process.env)}\n`);
}
