"use node";

import { RequestError } from "@octokit/request-error";
import type { Octokit } from "@octokit/rest";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { action } from "../functions";
import { resolveGitHubAppAccess } from "../githubAppAccess";
import { fetchGitHubRepoIdentity } from "../githubRepoApi";
import { toErrorMessage } from "../jsonUtils";
import { getConvexCodeLocationPath } from "../../shared/convexCodeLocation";
import { verifySetupStackWorkers } from "./cloudflare";
import { applySetupOutputContract } from "./contracts/applySetupOutput";
import { verifySetupStackProjects } from "./convex";
import type { RepositoryActionsSetupOutput } from "./provisioningModel";
import type { VerifiedSetupOutput } from "./setupOutputMutations";
import {
  decideFirstSetupOutputApply,
  namesOnlyAttachedSetupStack,
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
  vSetupStatus,
  zGitHubArtifactPage,
  zGitHubWorkflowRun,
  zGitHubWorkflowRunPage,
  type GitHubArtifact,
  type GitHubWorkflowRun,
  type SetupOutput,
  type SetupOutputApplyResult,
  type SetupOutputSource,
  type SetupRun,
  type SetupStatus,
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
under this name; past this many whose run cannot carry the setup output, the reader reports no output
instead of reading more runs.
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

/** `latestRun` is null when no setup run remains but a Destroy app run published a receipt. */
type SetupOutputRead =
  | { state: "no_setup_run" }
  | { state: "no_output"; latestRun: SetupRun }
  | {
      state: "invalid_output";
      latestRun: SetupRun | null;
      source: SetupOutputSource;
      reason: string;
    }
  | { state: "output"; latestRun: SetupRun | null; source: SetupOutputSource; output: SetupOutput };

/**
The newest run of the setup workflow on the live default branch, and the newest setup output: every
retained run, every live artifact named samebase-setup-output, then the one archive. A destroy
receipt comes from a run of the `Destroy app` workflow, which the artifact names and the reader
reads by id.
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
  // The newest artifact whose run is a successful setup run or Destroy app run. A run outside the
  // listed pages (a Destroy app run, more than 1,000 retained runs, a rerun of an old run) is read
  // by id.
  const repository = {
    githubRepositoryDatabaseId: context.githubRepositoryDatabaseId,
    defaultBranch,
  };
  const listedRuns = new Map(runs.map((run) => [run.id, run]));
  let selected: {
    artifact: GitHubArtifact;
    source: SetupOutputSource;
    run: GitHubWorkflowRun;
  } | null = null;
  for (const { artifact, runId } of orderSetupOutputArtifacts(artifacts).slice(
    0,
    MAX_ARTIFACT_CANDIDATES,
  )) {
    const run = listedRuns.get(runId) ?? (await readWorkflowRun(octokit, { owner, repo, runId }));
    const source = run ? readSetupOutputSource({ artifact, run, repository }) : null;
    if (run && source) {
      selected = { artifact, source, run };
      break;
    }
  }
  // The newest setup run in any state. A setup run read by id can be newer than every listed run: a
  // rerun of an old run starts again. A Destroy app run is not a setup run: it shows only through
  // its receipt, which can outlive every setup run.
  const newestRun = selectSetupRuns(selected ? [selected.run, ...runs] : runs, repository).at(0);
  const latestRun = newestRun ? toSetupRun(newestRun) : null;
  if (!selected) {
    return latestRun ? { state: "no_output", latestRun } : { state: "no_setup_run" };
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
The newest setup output with every claim checked, ready to apply, or where it stopped. Nothing is
written. `applied` is the checkpoint that an apply compares with.
*/
type PreparedSetupOutput =
  | { state: "no_setup_run" }
  | { state: "no_output"; latestRun: SetupRun }
  | {
      state: "invalid_output";
      latestRun: SetupRun | null;
      source: SetupOutputSource;
      reason: string;
    }
  | { state: "unchanged"; latestRun: SetupRun | null; source: SetupOutputSource }
  | {
      state: "refused";
      latestRun: SetupRun | null;
      source: SetupOutputSource;
      step: "verify_cloudflare" | "verify_convex";
      claim: string | null;
      reason: string;
    }
  | {
      state: "ready";
      latestRun: SetupRun | null;
      source: SetupOutputSource;
      verified: VerifiedSetupOutput;
      pending: Extract<SetupStatus["pending"], { state: "deployed" | "destroyed" }>;
    };

async function prepareLatestSetupOutput(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<{ applied: RepositoryActionsSetupOutput | null; prepared: PreparedSetupOutput }> {
  const [read, context] = await Promise.all([
    readLatestSetupOutput(ctx, args),
    ctx.runQuery(internal.repository.setupOutputMutations.readApplyContext, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    }),
  ]);
  const applied = context.setupOutput;
  switch (read.state) {
    case "no_setup_run":
    case "no_output":
    case "invalid_output":
      return { applied, prepared: read };
    case "output":
      break;
    default:
      read satisfies never;
      throw new Error("Unknown setup output read.");
  }
  const { latestRun, source, output } = read;
  if (!isNewerSetupOutput(source, applied)) {
    return { applied, prepared: { state: "unchanged", latestRun, source } };
  }

  switch (output.state) {
    case "destroyed":
      return {
        applied,
        prepared: {
          state: "ready",
          latestRun,
          source,
          verified: { state: "destroyed" },
          pending: { state: "destroyed", source },
        },
      };
    case "deployed":
      break;
    default:
      output satisfies never;
      throw new Error("Unknown setup output state.");
  }

  // A provider read that fails stops at its step with the error, so the status names it.
  const workers = await verifySetupStackWorkers(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    cloudflare: output.cloudflare,
    attachedWorkers: context.attachedWorkers,
  }).catch((error: unknown) => ({
    ok: false as const,
    claim: null,
    reason: `Samebase could not read the Workers from Cloudflare: ${toErrorMessage(error)}`,
  }));
  if (!workers.ok) {
    const refusal = {
      step: "verify_cloudflare" as const,
      claim: workers.claim,
      reason: workers.reason,
    };
    return { applied, prepared: { state: "refused", latestRun, source, ...refusal } };
  }
  const projects = await verifySetupStackProjects(ctx, {
    userId: args.userId,
    repositoryId: args.repositoryId,
    convex: output.convex,
  }).catch((error: unknown) => ({
    ok: false as const,
    claim: null,
    reason: `Samebase could not read the Convex projects: ${toErrorMessage(error)}`,
  }));
  if (!projects.ok) {
    const refusal = {
      step: "verify_convex" as const,
      claim: projects.claim,
      reason: projects.reason,
    };
    return { applied, prepared: { state: "refused", latestRun, source, ...refusal } };
  }
  if (
    workers.replacedWorkerIds.length === 0 &&
    namesOnlyAttachedSetupStack({
      workerTags: workers.workers.map((worker) => worker.workerTag),
      projectIds: projects.projects.map((project) => project.projectId),
      attachedWorkers: context.attachedWorkers,
      attachedProjects: context.attachedProjects,
    })
  ) {
    return { applied, prepared: { state: "unchanged", latestRun, source } };
  }
  return {
    applied,
    prepared: {
      state: "ready",
      latestRun,
      source,
      verified: {
        state: "deployed",
        outputVersion: output.version,
        accountId: output.cloudflare.accountId,
        workers: workers.workers.map((worker) => ({
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          rootDirectory: worker.rootDirectory,
        })),
        replacedWorkerIds: workers.replacedWorkerIds,
        teamId: output.convex.teamId,
        projects: projects.projects.map((project) => ({
          projectId: project.projectId,
          codeLocation: project.codeLocation,
        })),
      },
      pending: {
        state: "deployed",
        source,
        workers: workers.workers.map((worker) => ({
          workerName: worker.workerName,
          rootDirectory: worker.rootDirectory,
        })),
        projects: projects.projects.map((project) => ({
          projectName: project.projectName,
          projectSlug: project.projectSlug,
          codeLocationPath: getConvexCodeLocationPath(project.codeLocation),
        })),
        firstApply: decideFirstSetupOutputApply({
          reservedNames: context.reservedNames,
          appCreatedAt: context.appCreatedAt,
          workers: workers.workers,
          projects: projects.projects,
        }),
      },
    },
  };
}

/**
The setup status: the newest setup run, the applied output, and the newest output that is not
applied yet with its checks. It writes nothing, so a status read never attaches a resource.
*/
export async function readSetupStatus(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<SetupStatus> {
  const { applied, prepared } = await prepareLatestSetupOutput(ctx, args);
  switch (prepared.state) {
    case "no_setup_run":
      return { latestRun: null, applied, pending: { state: "none" } };
    case "no_output":
      return {
        latestRun: prepared.latestRun,
        applied,
        pending:
          applied === null && prepared.latestRun.conclusion === "success"
            ? { state: "no_output" }
            : { state: "none" },
      };
    case "unchanged":
      return { latestRun: prepared.latestRun, applied, pending: { state: "none" } };
    case "invalid_output":
      return {
        latestRun: prepared.latestRun,
        applied,
        pending: { state: "invalid_output", source: prepared.source, reason: prepared.reason },
      };
    case "refused":
      return {
        latestRun: prepared.latestRun,
        applied,
        pending: {
          state: "refused",
          source: prepared.source,
          step: prepared.step,
          claim: prepared.claim,
          reason: prepared.reason,
        },
      };
    case "ready":
      return { latestRun: prepared.latestRun, applied, pending: prepared.pending };
    default:
      prepared satisfies never;
      throw new Error("Unknown setup output state.");
  }
}

/**
Reads, verifies, and applies the newest setup output in one transaction, on behalf of `userId`.

member = a member reviewed the output with this artifact id and asked for its apply; a newer output
stops the apply, so the member never applies an output that they did not see

first_apply = the app's creation is the authority: only the first output, and only when
decideFirstSetupOutputApply allows it; anything else waits for a member (needs_member)
*/
export async function applyLatestSetupOutput(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
    authority: { kind: "member"; artifactId: number } | { kind: "first_apply" };
  },
): Promise<SetupOutputApplyResult> {
  const { applied, prepared } = await prepareLatestSetupOutput(ctx, args);
  if (prepared.state !== "ready") {
    return prepared;
  }
  const { latestRun, source } = prepared;
  const { authority } = args;
  switch (authority.kind) {
    case "member":
      if (source.artifactId !== authority.artifactId) {
        return {
          state: "refused",
          latestRun,
          source,
          step: "apply",
          claim: null,
          reason: `Run ${source.runId} published a newer setup output than the one you reviewed, so nothing changed. Review the newest one and apply it.`,
        };
      }
      break;
    case "first_apply":
      if (applied) {
        return {
          state: "needs_member",
          latestRun,
          source,
          reason: "Samebase applied an earlier setup output, so a member applies each later one.",
        };
      }
      if (prepared.pending.state === "deployed" && !prepared.pending.firstApply.automatic) {
        return {
          state: "needs_member",
          latestRun,
          source,
          reason: prepared.pending.firstApply.reason,
        };
      }
      break;
    default:
      authority satisfies never;
      throw new Error("Unknown setup output authority.");
  }

  try {
    await ctx.runMutation(internal.repository.setupOutputMutations.apply, {
      userId: args.userId,
      repositoryId: args.repositoryId,
      expectedArtifactId: applied?.artifactId ?? null,
      source: {
        runId: source.runId,
        runAttempt: source.runAttempt,
        artifactId: source.artifactId,
        artifactCreatedAt: source.artifactCreatedAt,
      },
      output: prepared.verified,
    });
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
  return prepared.verified.state === "deployed"
    ? {
        state: "applied",
        latestRun,
        source,
        workerCount: prepared.verified.workers.length,
        projectCount: prepared.verified.projects.length,
      }
    : { state: "destroy_reported", latestRun, source };
}

/**
One step of setupOutputWorkflow.observeFirstSetupOutput: the first apply on behalf of the member who
created the app. A failed call becomes a result, so the workflow can wait and read again.
*/
export const applyFirstForCreator = internalAction({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: vSetupOutputApplyResult,
  handler: async (ctx, args): Promise<SetupOutputApplyResult> => {
    try {
      return await applyLatestSetupOutput(ctx, {
        userId: args.userId,
        repositoryId: args.repositoryId,
        authority: { kind: "first_apply" },
      });
    } catch (error) {
      return { state: "failed", reason: toErrorMessage(error) };
    }
  },
});

/** The setup status of a repository_actions repository, for the dashboard and repository_getStatus. */
export const readStatus = action({
  access: "access_dashboard",
  args: { repositoryId: id("repositories") },
  returns: vSetupStatus,
  handler: async (ctx, args): Promise<SetupStatus> =>
    await readSetupStatus(ctx, { userId: ctx.viewer.userId, repositoryId: args.repositoryId }),
});

/** A member's explicit apply of the newest setup output, from the dashboard or the MCP tool. */
export const apply = action({
  access: applySetupOutputContract.access,
  args: applySetupOutputContract.args,
  returns: applySetupOutputContract.returns,
  mcp: applySetupOutputContract.mcp,
  handler: async (ctx, args): Promise<SetupOutputApplyResult> =>
    await applyLatestSetupOutput(ctx, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
      authority: { kind: "member", artifactId: args.artifactId },
    }),
});
