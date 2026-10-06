import { v, type Infer } from "convex/values";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";

/*
The setup output of a repository_actions repository: what its Alchemy setup stack tells Samebase
about the resources it owns. templates/base-actions/scripts/setup-output.ts defines it; the deploy
job of the template's `alchemy` workflow uploads it as an artifact after each deploy, and the
destroy-app job uploads a destroy receipt under the same name. This module holds the pure parts of
reading it: the GitHub response shapes the reader uses, the choice of run and artifact, the archive,
and one validator per output version.
*/

export const SETUP_WORKFLOW_FILE_NAME = "alchemy.yml";
const SETUP_WORKFLOW_PATH = `.github/workflows/${SETUP_WORKFLOW_FILE_NAME}`;
export const SETUP_OUTPUT_ARTIFACT_NAME = "samebase-setup-output";
const SETUP_OUTPUT_FILE_NAME = "samebase-setup-output.json";
/** The bound for the artifact and for the file in it. A version 1 output is a few hundred bytes. */
export const SETUP_OUTPUT_MAX_BYTES = 64 * 1024;

const zGitHubWorkflowRun = z.object({
  id: z.number().int().positive(),
  path: z.string(),
  event: z.string(),
  head_branch: z.string().nullable(),
  head_sha: z.string(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  run_attempt: z.number().int().positive(),
  run_started_at: z.string(),
  html_url: z.string(),
  repository: z.object({ id: z.number().int() }),
  head_repository: z.object({ id: z.number().int() }),
});
type GitHubWorkflowRun = z.infer<typeof zGitHubWorkflowRun>;

/** GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs, the fields the reader uses. */
export const zGitHubWorkflowRunPage = z.object({
  total_count: z.number().int(),
  workflow_runs: z.array(zGitHubWorkflowRun),
});

const zGitHubArtifact = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  size_in_bytes: z.number().int(),
  expired: z.boolean(),
  created_at: z.string(),
  workflow_run: z
    .object({
      id: z.number().int(),
      repository_id: z.number().int(),
      head_repository_id: z.number().int(),
      head_sha: z.string(),
    })
    .nullable(),
});
type GitHubArtifact = z.infer<typeof zGitHubArtifact>;

/** GET /repos/{owner}/{repo}/actions/artifacts?name=..., the fields the reader uses. */
export const zGitHubArtifactPage = z.object({
  total_count: z.number().int(),
  artifacts: z.array(zGitHubArtifact),
});

const { literal, number, object, string, union } = v;

/** One run of the setup workflow, as the setup status shows it. */
export const vSetupRun = object({
  runId: number(),
  runAttempt: number(),
  event: string(),
  status: union(string(), v.null()),
  conclusion: union(string(), v.null()),
  headSha: string(),
  startedAt: string(),
  url: string(),
});
export type SetupRun = Infer<typeof vSetupRun>;

export function toSetupRun(run: GitHubWorkflowRun): SetupRun {
  return {
    runId: run.id,
    runAttempt: run.run_attempt,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    headSha: run.head_sha,
    startedAt: run.run_started_at,
    url: run.html_url,
  };
}

/**
The runs that can carry the setup output: the template's workflow file, a push or a run of the
workflow on the live default branch, in this repository and not a fork. Newest first by start time,
which a rerun moves, then by id.
*/
export function selectSetupRuns(
  runs: readonly GitHubWorkflowRun[],
  repository: { githubRepositoryDatabaseId: string; defaultBranch: string },
): GitHubWorkflowRun[] {
  return runs
    .filter(
      (run) =>
        run.path === SETUP_WORKFLOW_PATH &&
        (run.event === "push" || run.event === "workflow_dispatch") &&
        run.head_branch === repository.defaultBranch &&
        String(run.repository.id) === repository.githubRepositoryDatabaseId &&
        String(run.head_repository.id) === repository.githubRepositoryDatabaseId,
    )
    .sort(
      (left, right) =>
        right.run_started_at.localeCompare(left.run_started_at) || right.id - left.id,
    );
}

/** Which artifact the output came from. `artifactId` is the change key: a rerun uploads a new one. */
export const vSetupOutputSource = object({
  runId: number(),
  runAttempt: number(),
  artifactId: number(),
});
export type SetupOutputSource = Infer<typeof vSetupOutputSource>;

/**
The newest live setup output artifact of a successful setup run, by the artifact's own creation
time, then id: a rerun of an older run uploads the newest artifact on an old run. The artifact must
name its run, repository, and commit the way the run does.
*/
export function selectSetupOutputArtifact(args: {
  runs: readonly GitHubWorkflowRun[];
  artifacts: readonly GitHubArtifact[];
}): { artifact: GitHubArtifact; source: SetupOutputSource } | null {
  const successfulRuns = new Map(
    args.runs.filter((run) => run.conclusion === "success").map((run) => [run.id, run]),
  );
  const candidates = args.artifacts.flatMap((artifact) => {
    const origin = artifact.workflow_run;
    const run = origin ? successfulRuns.get(origin.id) : undefined;
    if (
      artifact.name !== SETUP_OUTPUT_ARTIFACT_NAME ||
      artifact.expired ||
      !origin ||
      !run ||
      origin.repository_id !== run.repository.id ||
      origin.head_repository_id !== run.head_repository.id ||
      origin.head_sha !== run.head_sha
    ) {
      return [];
    }
    return [{ artifact, run }];
  });
  const newest = candidates
    .sort(
      (left, right) =>
        right.artifact.created_at.localeCompare(left.artifact.created_at) ||
        right.artifact.id - left.artifact.id,
    )
    .at(0);
  return newest
    ? {
        artifact: newest.artifact,
        source: {
          runId: newest.run.id,
          runAttempt: newest.run.run_attempt,
          artifactId: newest.artifact.id,
        },
      }
    : null;
}

const zNonEmptyString = z.string().min(1);
/** Convex returns int64 ids; the setup output and Samebase keep them as decimal strings. */
const zDecimalId = z.string().regex(/^[0-9]+$/);

/**
Version 1. One section per provider, each with its destination and one list per kind of resource.
Every object is strict: a section, list, or field that version 1 does not define is a new version,
so an unknown kind fails closed here as it does in the template.
*/
const zSetupOutputVersion1 = z.discriminatedUnion("state", [
  z.strictObject({
    version: z.literal(1),
    state: z.literal("deployed"),
    cloudflare: z.strictObject({
      accountId: zNonEmptyString,
      workers: z
        .array(
          z.strictObject({
            tag: zNonEmptyString,
            name: zNonEmptyString,
            rootDirectory: zNonEmptyString,
          }),
        )
        .min(1),
    }),
    convex: z.strictObject({
      teamId: zDecimalId,
      projects: z
        .array(
          z.union([
            z.strictObject({ projectId: zDecimalId, convexConfigPath: zNonEmptyString }),
            z.strictObject({ projectId: zDecimalId, convexDirectoryPath: zNonEmptyString }),
          ]),
        )
        .min(1),
    }),
  }),
  z.strictObject({ version: z.literal(1), state: z.literal("destroyed") }),
]);
export type SetupOutput = z.infer<typeof zSetupOutputVersion1>;
export type DeployedSetupOutput = Extract<SetupOutput, { state: "deployed" }>;

type SetupOutputParse = { ok: true; output: SetupOutput } | { ok: false; reason: string };

/**
A claim of a deployed setup output that the providers did not confirm. `claim` is its path in the
output, such as `cloudflare.workers[1].tag`, so the first failed apply says which entry failed.
*/
export type SetupOutputRefusal = { ok: false; claim: string; reason: string };

function findDuplicate(values: readonly string[]): string | undefined {
  return values.find((value, index) => values.indexOf(value) !== index);
}

/** One validator per version that Samebase has met; any other version fails closed. */
export function parseSetupOutput(value: unknown): SetupOutputParse {
  const versioned = z.object({ version: z.unknown() }).safeParse(value);
  if (!versioned.success) {
    return { ok: false, reason: "The setup output is not a JSON object with a version." };
  }
  const { version } = versioned.data;
  if (version !== 1) {
    return {
      ok: false,
      reason: `The setup output has version ${JSON.stringify(version)}, which Samebase cannot read. Samebase reads version 1.`,
    };
  }
  const parsed = zSetupOutputVersion1.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `The setup output does not match version 1: ${z.prettifyError(parsed.error)}`,
    };
  }
  const output = parsed.data;
  if (output.state === "deployed") {
    const duplicate =
      findDuplicate(output.cloudflare.workers.map((worker) => worker.tag)) ??
      findDuplicate(output.cloudflare.workers.map((worker) => worker.name)) ??
      findDuplicate(output.convex.projects.map((project) => project.projectId));
    if (duplicate !== undefined) {
      return { ok: false, reason: `The setup output lists ${duplicate} more than once.` };
    }
  }
  return { ok: true, output };
}

/** The setup output from the artifact's zip archive, which must hold exactly its one JSON file. */
export function readSetupOutputArchive(archive: Uint8Array): SetupOutputParse {
  const entries: Array<{ name: string; originalSize: number }> = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archive, {
      filter: (file) => {
        entries.push({ name: file.name, originalSize: file.originalSize });
        return file.originalSize <= SETUP_OUTPUT_MAX_BYTES;
      },
    });
  } catch (error) {
    return {
      ok: false,
      reason: `The artifact is not a readable zip archive: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (entries.length !== 1 || entries[0].name !== SETUP_OUTPUT_FILE_NAME) {
    return {
      ok: false,
      reason: `The artifact must hold exactly ${SETUP_OUTPUT_FILE_NAME}; it holds ${entries.map((file) => file.name).join(", ") || "nothing"}.`,
    };
  }
  // The filter above leaves out a file whose declared size is over the bound, and the inflated
  // size is checked again.
  if (
    !Object.prototype.hasOwnProperty.call(files, SETUP_OUTPUT_FILE_NAME) ||
    files[SETUP_OUTPUT_FILE_NAME].length > SETUP_OUTPUT_MAX_BYTES
  ) {
    return {
      ok: false,
      reason: `${SETUP_OUTPUT_FILE_NAME} is larger than ${SETUP_OUTPUT_MAX_BYTES} bytes.`,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(strFromU8(files[SETUP_OUTPUT_FILE_NAME]));
  } catch {
    return { ok: false, reason: `${SETUP_OUTPUT_FILE_NAME} is not one JSON document.` };
  }
  return parseSetupOutput(value);
}

/**
What one read and apply of the newest setup output did, so the first failure names its step and its
reason.

no_setup_run = the repository has no run of its alchemy workflow on the default branch

no_output = no successful run has a live setup output artifact; latestRun says what ran last

invalid_output = the newest artifact is not a setup output that Samebase can read

refused = a provider did not confirm a claim (verify_cloudflare, verify_convex), or the apply
transaction refused the change (apply): a conflict, the connection quota, another operation

unchanged = the newest artifact is the applied one

applied = the Workers and Convex projects of a deployed output are attached

destroy_reported = the app's confirmed destroy reported itself
*/
export const vSetupOutputApplyResult = union(
  object({ state: literal("no_setup_run") }),
  object({ state: literal("no_output"), latestRun: vSetupRun }),
  object({
    state: literal("invalid_output"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
    reason: string(),
  }),
  object({
    state: literal("refused"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
    step: union(literal("verify_cloudflare"), literal("verify_convex"), literal("apply")),
    claim: union(string(), v.null()),
    reason: string(),
  }),
  object({ state: literal("unchanged"), latestRun: vSetupRun, source: vSetupOutputSource }),
  object({
    state: literal("applied"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
    workerCount: number(),
    projectCount: number(),
  }),
  object({ state: literal("destroy_reported"), latestRun: vSetupRun, source: vSetupOutputSource }),
);
export type SetupOutputApplyResult = Infer<typeof vSetupOutputApplyResult>;
