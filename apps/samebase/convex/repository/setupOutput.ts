"use node";

import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import { toErrorMessage } from "../jsonUtils";
import { verifySetupStackWorkers } from "./cloudflare";
import { verifySetupStackProjects } from "./convex";
import type { VerifiedSetupOutput } from "./setupOutputMutations";
import {
  isNewerSetupOutput,
  orderSetupOutputArtifacts,
  readSetupOutputArchive,
  readSetupOutputSource,
  selectSetupRuns,
  SETUP_OUTPUT_ARTIFACT_NAME,
  SETUP_OUTPUT_MAX_BYTES,
  SETUP_WORKFLOW_FILE_NAME,
  toSetupRun,
  vSetupOutputApplyResult,
  zGitHubArtifactPage,
  zGitHubWorkflowRun,
  zGitHubWorkflowRunPage,
  type GitHubArtifact,
  type GitHubWorkflowRun,
  type SetupOutput,
  type SetupOutputApplyResult,
  type SetupOutputSource,
  type SetupRun,
} from "./setupOutputModel";

/*
The reader of a repository_actions repository's setup output. It reads GitHub with the Samebase
GitHub App's installation token (Actions: read) and verifies the claims with the organization's
provider connections; it never reads Alchemy's state store. The result names the step that stopped
it: reading the runs and the artifact, verifying Cloudflare, verifying Convex, or the apply.
*/

const { id } = v;

/** GitHub returns at most 1,000 results for a filtered list: ten pages of 100. */
const GITHUB_PAGE_SIZE = 100;
const GITHUB_MAX_PAGES = 10;

async function listAllPages<Item>(
  readPage: (page: number) => Promise<{ totalCount: number; items: Item[] }>,
): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
    const result = await readPage(page);
    items.push(...result.items);
    if (result.items.length < GITHUB_PAGE_SIZE || items.length >= result.totalCount) {
      break;
    }
  }
  return items;
}

/**
The artifacts the reader checks, newest first. Any workflow of the repository can upload an artifact
under this name; past this many whose run is not a successful setup run, the reader reports no
output instead of reading more runs.
*/
const MAX_ARTIFACT_CANDIDATES = 10;

async function readWorkflowRun(
  octokit: Octokit,
  args: { owner: string; repo: string; runId: number },
): Promise<GitHubWorkflowRun | null> {
  try {
    const response = await octokit.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}", {
      owner: args.owner,
      repo: args.repo,
      run_id: args.runId,
    });
    return zGitHubWorkflowRun.parse(response.data);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

type SetupOutputRead =
  | { state: "no_setup_run" }
  | { state: "no_output"; latestRun: SetupRun }
  | { state: "invalid_output"; latestRun: SetupRun; source: SetupOutputSource; reason: string }
  | { state: "output"; latestRun: SetupRun; source: SetupOutputSource; output: SetupOutput };

/**
The newest run of the setup workflow on the live default branch, and the newest setup output: every
retained run, every live artifact named samebase-setup-output, then the one archive.
*/
export async function readLatestSetupOutput(
  ctx: Pick<ActionCtx, "runQuery">,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<SetupOutputRead> {
  const [context, githubAccess] = await Promise.all([
    ctx.runQuery(
      internal.repository.providerObservationQueries.readProviderAttachmentRepositoryContext,
      { repositoryId: args.repositoryId, userId: args.userId },
    ),
    resolveGitHubAppAccess(ctx, {
      userId: args.userId,
      target: { kind: "repository", repositoryId: args.repositoryId },
    }),
  ]);
  const octokit: Octokit = githubAccess.octokit;
  const owner = context.githubOwnerLogin;
  const repo = context.githubRepositoryName;
  const { defaultBranch } = await fetchGitHubRepoIdentity({
    octokit,
    owner,
    repo,
    expectedRepoId: context.githubRepositoryDatabaseId,
  });

  const runs = selectSetupRuns(
    await listAllPages(async (page) => {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
        {
          owner,
          repo,
          workflow_id: SETUP_WORKFLOW_FILE_NAME,
          branch: defaultBranch,
          per_page: GITHUB_PAGE_SIZE,
          page,
        },
      );
      const parsed = zGitHubWorkflowRunPage.parse(response.data);
      return { totalCount: parsed.total_count, items: parsed.workflow_runs };
    }),
    { githubRepositoryDatabaseId: context.githubRepositoryDatabaseId, defaultBranch },
  );
  const newestRun = runs.at(0);
  if (!newestRun) {
    return { state: "no_setup_run" };
  }
  const latestRun = toSetupRun(newestRun);

  const artifacts = await listAllPages(async (page) => {
    const response = await octokit.request("GET /repos/{owner}/{repo}/actions/artifacts", {
      owner,
      repo,
      name: SETUP_OUTPUT_ARTIFACT_NAME,
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const parsed = zGitHubArtifactPage.parse(response.data);
    return { totalCount: parsed.total_count, items: parsed.artifacts };
  });
  // The newest artifact whose run is a successful setup run. A run outside the listed pages (more
  // than 1,000 retained runs, a rerun of an old run) is read by id.
  const repository = {
    githubRepositoryDatabaseId: context.githubRepositoryDatabaseId,
    defaultBranch,
  };
  const listedRuns = new Map(runs.map((run) => [run.id, run]));
  let selected: { artifact: GitHubArtifact; source: SetupOutputSource } | null = null;
  for (const { artifact, runId } of orderSetupOutputArtifacts(artifacts).slice(
    0,
    MAX_ARTIFACT_CANDIDATES,
  )) {
    const run = listedRuns.get(runId) ?? (await readWorkflowRun(octokit, { owner, repo, runId }));
    const source = run ? readSetupOutputSource({ artifact, run, repository }) : null;
    if (source) {
      selected = { artifact, source };
      break;
    }
  }
  if (!selected) {
    return { state: "no_output", latestRun };
  }
  const { source } = selected;
  if (selected.artifact.size_in_bytes > SETUP_OUTPUT_MAX_BYTES) {
    return {
      state: "invalid_output",
      latestRun,
      source,
      reason: `The artifact has ${selected.artifact.size_in_bytes} bytes, more than ${SETUP_OUTPUT_MAX_BYTES}.`,
    };
  }

  // GitHub redirects to a download URL that is valid for one minute; the client follows it.
  const download = await octokit.request(
    "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}",
    { owner, repo, artifact_id: source.artifactId, archive_format: "zip" },
  );
  const archive: unknown = download.data;
  if (!(archive instanceof ArrayBuffer)) {
    return {
      state: "invalid_output",
      latestRun,
      source,
      reason: "GitHub did not return the artifact as a zip archive.",
    };
  }
  const parsed = readSetupOutputArchive(new Uint8Array(archive));
  return parsed.ok
    ? { state: "output", latestRun, source, output: parsed.output }
    : { state: "invalid_output", latestRun, source, reason: parsed.reason };
}

/**
Reads the newest setup output, verifies every claim, and applies it in one transaction. It applies
on behalf of `userId`: the caller decides whether that member's request, or the creation of the
app, covers this output.
*/
export async function applyLatestSetupOutput(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<SetupOutputApplyResult> {
  const [read, context] = await Promise.all([
    readLatestSetupOutput(ctx, args),
    ctx.runQuery(internal.repository.setupOutputMutations.readApplyContext, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    }),
  ]);
  switch (read.state) {
    case "no_setup_run":
    case "no_output":
    case "invalid_output":
      return read;
    case "output":
      break;
    default:
      read satisfies never;
      throw new Error("Unknown setup output read.");
  }
  const { latestRun, source, output } = read;
  const applied = context.setupOutput;
  if (!isNewerSetupOutput(source, applied)) {
    return { state: "unchanged", latestRun, source };
  }
  const expectedArtifactId = applied?.artifactId ?? null;

  /** Null when the transaction committed; the refusal when it threw. */
  const apply = async (verified: VerifiedSetupOutput): Promise<SetupOutputApplyResult | null> => {
    try {
      await ctx.runMutation(internal.repository.setupOutputMutations.apply, {
        userId: args.userId,
        repositoryId: args.repositoryId,
        expectedArtifactId,
        source: {
          runId: source.runId,
          runAttempt: source.runAttempt,
          artifactId: source.artifactId,
          artifactCreatedAt: source.artifactCreatedAt,
        },
        output: verified,
      });
      return null;
    } catch (error) {
      return {
        state: "refused",
        latestRun,
        source,
        step: "apply",
        claim: null,
        reason: toErrorMessage(error),
      };
    }
  };

  switch (output.state) {
    case "destroyed":
      return (
        (await apply({ state: "destroyed" })) ?? { state: "destroy_reported", latestRun, source }
      );
    case "deployed":
      break;
    default:
      output satisfies never;
      throw new Error("Unknown setup output state.");
  }

  const workers = await verifySetupStackWorkers(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    cloudflare: output.cloudflare,
    attachedWorkers: context.attachedWorkers,
  });
  if (!workers.ok) {
    return {
      state: "refused",
      latestRun,
      source,
      step: "verify_cloudflare",
      claim: workers.claim,
      reason: workers.reason,
    };
  }
  const projects = await verifySetupStackProjects(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    convex: output.convex,
  });
  if (!projects.ok) {
    return {
      state: "refused",
      latestRun,
      source,
      step: "verify_convex",
      claim: projects.claim,
      reason: projects.reason,
    };
  }
  return (
    (await apply({
      state: "deployed",
      outputVersion: output.version,
      accountId: output.cloudflare.accountId,
      workers: workers.workers,
      replacedWorkerIds: workers.replacedWorkerIds,
      teamId: output.convex.teamId,
      projects: projects.projects,
    })) ?? {
      state: "applied",
      latestRun,
      source,
      workerCount: workers.workers.length,
      projectCount: projects.projects.length,
    }
  );
}

/** Applies the newest setup output on behalf of `userId`; see applyLatestSetupOutput. */
export const applyLatestForUser = internalAction({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: vSetupOutputApplyResult,
  handler: async (ctx, args): Promise<SetupOutputApplyResult> =>
    await applyLatestSetupOutput(ctx, { userId: args.userId, repositoryId: args.repositoryId }),
});
