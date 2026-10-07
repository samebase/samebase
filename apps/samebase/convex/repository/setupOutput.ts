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
  SETUP_OUTPUT_ARTIFACT_NAME,
  SETUP_OUTPUT_MAX_BYTES,
  SETUP_OUTPUT_RUN_CONCLUSIONS,
  vSetupOutputApplyResult,
  vSetupStatus,
  zGitHubArtifactPage,
  zGitHubWorkflowRun,
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
it: reading the artifact and its run, verifying Cloudflare, verifying Convex, or the apply.
*/

const { id } = v;

/** GitHub returns at most 1,000 results for a filtered list: ten pages of 100. */
const GITHUB_PAGE_SIZE = 100;
const GITHUB_MAX_PAGES = 10;

/**
The artifacts the reader checks, newest first. Past this many whose run cannot publish a setup output
(a pull request run, a cancelled run, a run that has not finished), the reader reports no output
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

type SetupOutputRead =
  | { state: "no_output" }
  | { state: "invalid_output"; latestRun: SetupRun; source: SetupOutputSource; reason: string }
  | { state: "output"; latestRun: SetupRun; source: SetupOutputSource; output: SetupOutput };

/**
The newest setup output: every live artifact named samebase-setup-output, newest first, each with
its run read by id, until one belongs to a finished run on the live default branch
(readSetupOutputSource); then that one archive, whose state must match how its run ended.
*/
async function readLatestSetupOutput(
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

  const artifacts: GitHubArtifact[] = [];
  for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
    const response = await octokit.request("GET /repos/{owner}/{repo}/actions/artifacts", {
      owner,
      repo,
      name: SETUP_OUTPUT_ARTIFACT_NAME,
      per_page: GITHUB_PAGE_SIZE,
      page,
    });
    const parsed = zGitHubArtifactPage.parse(response.data);
    artifacts.push(...parsed.artifacts);
    if (parsed.artifacts.length < GITHUB_PAGE_SIZE || artifacts.length >= parsed.total_count) {
      break;
    }
  }
  const repository = {
    githubRepositoryDatabaseId: context.githubRepositoryDatabaseId,
    defaultBranch,
  };
  let selected: { artifact: GitHubArtifact; source: SetupOutputSource; run: SetupRun } | null =
    null;
  for (const { artifact, runId } of orderSetupOutputArtifacts(artifacts).slice(
    0,
    MAX_ARTIFACT_CANDIDATES,
  )) {
    const run = await readWorkflowRun(octokit, { owner, repo, runId });
    const read = run ? readSetupOutputSource({ artifact, run, repository }) : null;
    if (read) {
      selected = { artifact, ...read };
      break;
    }
  }
  if (!selected) {
    return { state: "no_output" };
  }
  const { source, run: latestRun } = selected;
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
  if (!parsed.ok) {
    return { state: "invalid_output", latestRun, source, reason: parsed.reason };
  }
  const { state } = parsed.output;
  const conclusion = SETUP_OUTPUT_RUN_CONCLUSIONS[state];
  return latestRun.conclusion === conclusion
    ? { state: "output", latestRun, source, output: parsed.output }
    : {
        state: "invalid_output",
        latestRun,
        source,
        reason: `The setup output of run ${source.runId} says ${state}, but the run ended with ${latestRun.conclusion}. Samebase reads ${state} only from a run that ended with ${conclusion}.`,
      };
}

/**
The newest setup output with every claim checked, ready to apply, or where it stopped. Nothing is
written.
*/
type PreparedSetupOutput =
  | { state: "no_output" }
  | { state: "invalid_output"; latestRun: SetupRun; source: SetupOutputSource; reason: string }
  | { state: "unchanged"; latestRun: SetupRun; source: SetupOutputSource }
  | { state: "setup_failed"; latestRun: SetupRun; source: SetupOutputSource }
  | {
      state: "refused";
      latestRun: SetupRun;
      source: SetupOutputSource;
      step: "verify_cloudflare" | "verify_convex";
      claim: string | null;
      reason: string;
    }
  | {
      state: "ready";
      latestRun: SetupRun;
      source: SetupOutputSource;
      verified: VerifiedSetupOutput;
      pending: Extract<SetupStatus["pending"], { state: "deployed" | "destroyed" }>;
    };

/**
`applied` is the checkpoint that an apply compares with, and `applyFailure` the last automatic apply
that failed.
*/
async function prepareLatestSetupOutput(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<{
  applied: RepositoryActionsSetupOutput | null;
  applyFailure: SetupStatus["applyFailure"];
  prepared: PreparedSetupOutput;
}> {
  const [read, context] = await Promise.all([
    readLatestSetupOutput(ctx, args),
    ctx.runQuery(internal.repository.setupOutputMutations.readApplyContext, {
      userId: args.userId,
      repositoryId: args.repositoryId,
    }),
  ]);
  const { setupOutput: applied, setupOutputApplyFailure: applyFailure } = context;
  switch (read.state) {
    case "no_output":
    case "invalid_output":
      return { applied, applyFailure, prepared: read };
    case "output":
      break;
    default:
      read satisfies never;
      throw new Error("Unknown setup output read.");
  }
  const { latestRun, source, output } = read;
  if (!isNewerSetupOutput(source, applied)) {
    return { applied, applyFailure, prepared: { state: "unchanged", latestRun, source } };
  }

  switch (output.state) {
    case "destroyed":
      return {
        applied,
        applyFailure,
        prepared: {
          state: "ready",
          latestRun,
          source,
          verified: { state: "destroyed" },
          pending: { state: "destroyed", source },
        },
      };
    case "failed":
      return { applied, applyFailure, prepared: { state: "setup_failed", latestRun, source } };
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
    return { applied, applyFailure, prepared: { state: "refused", latestRun, source, ...refusal } };
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
    return { applied, applyFailure, prepared: { state: "refused", latestRun, source, ...refusal } };
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
    return { applied, applyFailure, prepared: { state: "unchanged", latestRun, source } };
  }
  return {
    applied,
    applyFailure,
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
The setup status: the run of the newest setup output, the applied output, the newest output that is
not applied yet with its checks, and the last automatic apply that failed. It writes nothing, so a
status read never attaches a resource.
*/
export async function readSetupStatus(
  ctx: ActionCtx,
  args: { userId: Id<"users">; repositoryId: Id<"repositories"> },
): Promise<SetupStatus> {
  const { applied, applyFailure, prepared } = await prepareLatestSetupOutput(ctx, args);
  switch (prepared.state) {
    case "no_output":
      return { latestRun: null, applied, pending: { state: "none" }, applyFailure };
    case "unchanged":
      return { latestRun: prepared.latestRun, applied, pending: { state: "none" }, applyFailure };
    case "setup_failed":
      return {
        latestRun: prepared.latestRun,
        applied,
        pending: { state: "failed", source: prepared.source },
        applyFailure,
      };
    case "invalid_output":
      return {
        latestRun: prepared.latestRun,
        applied,
        pending: { state: "invalid_output", source: prepared.source, reason: prepared.reason },
        applyFailure,
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
        applyFailure,
      };
    case "ready":
      return { latestRun: prepared.latestRun, applied, pending: prepared.pending, applyFailure };
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
created the app. A failed call becomes a result, so the workflow can wait and read again. An apply
that the apply transaction refused, such as on the organization connection quota, is recorded on
the plan, because nobody sees this result: the setup status shows it until an apply succeeds.
*/
export const applyFirstForCreator = internalAction({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: vSetupOutputApplyResult,
  handler: async (ctx, args): Promise<SetupOutputApplyResult> => {
    try {
      const result = await applyLatestSetupOutput(ctx, {
        userId: args.userId,
        repositoryId: args.repositoryId,
        authority: { kind: "first_apply" },
      });
      if (result.state === "refused" && result.step === "apply") {
        await ctx.runMutation(internal.repository.setupOutputMutations.recordApplyFailure, {
          repositoryId: args.repositoryId,
          reason: result.reason,
        });
      }
      return result;
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
