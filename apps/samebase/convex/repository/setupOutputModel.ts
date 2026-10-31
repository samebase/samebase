import { v, type Infer } from "convex/values";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";

import type { RepositoryProviderResourceOrigin } from "./model";
import {
  vRepositoryActionsSetupOutput,
  vRepositoryActionsSetupOutputApplyFailure,
} from "./provisioningModel";

/*
The setup output of a repository_actions repository: what its Alchemy setup stack tells Samebase
about the resources it owns. scripts/setup-output.ts of samebase/base-actions defines it; the
template's deploy job uploads it as an artifact after each deploy, or the failed output after a
failed deploy, and its confirmed destroy uploads a destroy receipt under the same name. The reader
takes the artifact from any workflow run on the default branch: workflow file names are not part
of the contract. This module holds the pure parts of reading it: the GitHub response shapes the
reader uses, the choice of artifact, the archive, and one validator per output version.
*/

export const SETUP_OUTPUT_ARTIFACT_NAME = "samebase-setup-output";
const SETUP_OUTPUT_FILE_NAME = "samebase-setup-output.json";
/** The bound for the artifact and for the file in it. A version 1 output is a few hundred bytes. */
export const SETUP_OUTPUT_MAX_BYTES = 64 * 1024;

/** A workflow run as GitHub returns it from GET .../actions/runs/{run_id}. */
export const zGitHubWorkflowRun = z.object({
  id: z.number().int().positive(),
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
export type GitHubWorkflowRun = z.infer<typeof zGitHubWorkflowRun>;

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
export type GitHubArtifact = z.infer<typeof zGitHubArtifact>;

/** GET /repos/{owner}/{repo}/actions/artifacts?name=..., the fields the reader uses. */
export const zGitHubArtifactPage = z.object({
  total_count: z.number().int(),
  artifacts: z.array(zGitHubArtifact),
});

const { array, literal, number, object, string, union } = v;

/**
The run of the newest setup output, as the setup status shows it. The reader accepts only a
completed run that succeeded or failed, so its conclusion is one of the two.
*/
export const vSetupRun = object({
  runId: number(),
  runAttempt: number(),
  conclusion: union(literal("success"), literal("failure")),
  startedAt: string(),
  url: string(),
});
export type SetupRun = Infer<typeof vSetupRun>;
/** The run of the newest setup output, or null while the repository has none. */
const vLatestSetupRun = union(vSetupRun, v.null());

type SetupRepository = { githubRepositoryDatabaseId: string; defaultBranch: string };

/**
Which artifact the output came from. `artifactId` is the change key: a rerun uploads a new one.
`artifactCreatedAt` orders outputs, because a rerun of an older run uploads the newest artifact on
an old run.
*/
export const vSetupOutputSource = object({
  runId: number(),
  runAttempt: number(),
  artifactId: number(),
  artifactCreatedAt: string(),
});
export type SetupOutputSource = Infer<typeof vSetupOutputSource>;

/** The live artifacts named samebase-setup-output with their run, newest first by creation time, then id. */
export function orderSetupOutputArtifacts(
  artifacts: readonly GitHubArtifact[],
): Array<{ artifact: GitHubArtifact; runId: number }> {
  return artifacts
    .flatMap((artifact) =>
      artifact.name === SETUP_OUTPUT_ARTIFACT_NAME && !artifact.expired && artifact.workflow_run
        ? [{ artifact, runId: artifact.workflow_run.id }]
        : [],
    )
    .sort(
      (left, right) =>
        right.artifact.created_at.localeCompare(left.artifact.created_at) ||
        right.artifact.id - left.artifact.id,
    );
}

/**
The artifact's source and its run when the run of any workflow is on the live default branch, in
this repository and not a fork, completed with success or failure, and is the run and commit that
the artifact names; null otherwise. A cancelled run or one that has not finished never publishes a
setup output, even when it uploaded one.
*/
export function readSetupOutputSource(args: {
  artifact: GitHubArtifact;
  run: GitHubWorkflowRun;
  repository: SetupRepository;
}): { source: SetupOutputSource; run: SetupRun } | null {
  const { artifact, run, repository } = args;
  const origin = artifact.workflow_run;
  const { conclusion } = run;
  return origin &&
    run.head_branch === repository.defaultBranch &&
    String(run.repository.id) === repository.githubRepositoryDatabaseId &&
    String(run.head_repository.id) === repository.githubRepositoryDatabaseId &&
    run.status === "completed" &&
    (conclusion === "success" || conclusion === "failure") &&
    origin.id === run.id &&
    origin.repository_id === run.repository.id &&
    origin.head_repository_id === run.head_repository.id &&
    origin.head_sha === run.head_sha
    ? {
        source: {
          runId: run.id,
          runAttempt: run.run_attempt,
          artifactId: artifact.id,
          artifactCreatedAt: artifact.created_at,
        },
        run: {
          runId: run.id,
          runAttempt: run.run_attempt,
          conclusion,
          startedAt: run.run_started_at,
          url: run.html_url,
        },
      }
    : null;
}

/**
The run conclusion that each state needs: a deploy or a destroy reports only a run that succeeded,
and the failed output only a run that failed. Any other pair is an invalid output.
*/
export const SETUP_OUTPUT_RUN_CONCLUSIONS = {
  deployed: "success",
  destroyed: "success",
  failed: "failure",
} as const satisfies Record<SetupOutput["state"], SetupRun["conclusion"]>;

/**
Whether a setup output was published after the applied one. An older one is never applied: while a
rerun of the applied run is still running, the newest readable artifact can be an older one.
*/
export function isNewerSetupOutput(
  source: SetupOutputSource,
  applied: { artifactId: number; artifactCreatedAt: string } | null,
): boolean {
  if (!applied) {
    return true;
  }
  const order = source.artifactCreatedAt.localeCompare(applied.artifactCreatedAt);
  return order > 0 || (order === 0 && source.artifactId > applied.artifactId);
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
  z.strictObject({ version: z.literal(1), state: z.literal("failed") }),
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

/** Whether the first setup output may be applied without a member, and why not. */
export const vFirstSetupOutputApply = union(
  object({ automatic: literal(true) }),
  object({ automatic: literal(false), reason: string() }),
);
export type FirstSetupOutputApply = Infer<typeof vFirstSetupOutputApply>;

/**
Whether the first setup output after the app's creation may be applied without a member. Creating
the app was a member's request for one Worker and one Convex project with the names Samebase checked
and reserved then, created after it. Anything else waits for a member's explicit apply: another
name, a second resource, a project name that another project of the team shares, a resource older
than the app (such as an older project renamed to the reserved name). Both providers always give a
creation time: a Cloudflare Worker read without a valid `created_on` fails before this rule.
*/
export function decideFirstSetupOutputApply(args: {
  reservedNames: { workerName: string; convexProjectName: string };
  appCreatedAt: number;
  workers: ReadonlyArray<{ workerName: string; createdAt: number }>;
  projects: ReadonlyArray<{ projectName: string; createdAt: number; nameIsUniqueInTeam: boolean }>;
}): FirstSetupOutputApply {
  if (args.workers.length !== 1 || args.projects.length !== 1) {
    return {
      automatic: false,
      reason: `The setup output lists ${args.workers.length} Workers and ${args.projects.length} Convex projects; Samebase reserved one of each when it created the app.`,
    };
  }
  const [worker] = args.workers;
  const [project] = args.projects;
  if (worker.workerName !== args.reservedNames.workerName) {
    return {
      automatic: false,
      reason: `The Worker is named ${worker.workerName}, not ${args.reservedNames.workerName}, the name Samebase reserved when it created the app.`,
    };
  }
  if (project.projectName !== args.reservedNames.convexProjectName) {
    return {
      automatic: false,
      reason: `The Convex project is named ${project.projectName}, not ${args.reservedNames.convexProjectName}, the name Samebase reserved when it created the app.`,
    };
  }
  if (!project.nameIsUniqueInTeam) {
    return {
      automatic: false,
      reason: `Another Convex project of the team is also named ${project.projectName}.`,
    };
  }
  if (worker.createdAt < args.appCreatedAt) {
    return {
      automatic: false,
      reason: `The Worker ${worker.workerName} existed before Samebase created the app.`,
    };
  }
  if (project.createdAt < args.appCreatedAt) {
    return {
      automatic: false,
      reason: `The Convex project ${project.projectName} existed before Samebase created the app.`,
    };
  }
  return { automatic: true };
}

/**
Whether a verified output names exactly the Workers and Convex projects that the setup stack already
has attached: the same Worker tags and project ids, and no setup_stack row that it no longer lists.
A rerun or a stack change that keeps its resources publishes such an output; applying it would only
move the checkpoint, so there is nothing to apply.
*/
export function namesOnlyAttachedSetupStack(args: {
  workerTags: readonly string[];
  projectIds: readonly string[];
  attachedWorkers: ReadonlyArray<{ workerTag: string; origin: RepositoryProviderResourceOrigin }>;
  attachedProjects: ReadonlyArray<{ projectId: string; origin: RepositoryProviderResourceOrigin }>;
}): boolean {
  const sameValues = (left: readonly string[], right: readonly string[]) => {
    const sortedRight = [...right].sort((a, b) => a.localeCompare(b));
    return (
      left.length === right.length &&
      [...left]
        .sort((a, b) => a.localeCompare(b))
        .every((value, index) => value === sortedRight[index])
    );
  };
  return (
    sameValues(
      args.workerTags,
      args.attachedWorkers.flatMap((worker) =>
        worker.origin === "setup_stack" ? [worker.workerTag] : [],
      ),
    ) &&
    sameValues(
      args.projectIds,
      args.attachedProjects.flatMap((project) =>
        project.origin === "setup_stack" ? [project.projectId] : [],
      ),
    )
  );
}

const vSetupOutputRefusalStep = union(
  literal("verify_cloudflare"),
  literal("verify_convex"),
  literal("apply"),
);

/**
The newest setup output that is not applied yet, as a status read sees it. It is never applied by
the read.

none = nothing to apply: the repository has no setup output yet, no setup output is newer than the
applied one, or the newer one names exactly the attached setup_stack resources
(namesOnlyAttachedSetupStack)

invalid_output = the newest artifact is not a setup output that Samebase can read, or its state
does not match how its run ended (SETUP_OUTPUT_RUN_CONCLUSIONS)

refused = a provider did not confirm a claim; `claim` is its path in the output, or null when the
provider could not be read

deployed = every claim checked out; an apply attaches these Workers and Convex projects, each
project named by its slug too, which is unique in the team where its name may not be; firstApply
says whether the first apply could happen without a member

destroyed = the app's confirmed destroy reported itself after the applied output

failed = the newest setup output is the failed output of a failed run; nothing waits to be applied
until a later run succeeds
*/
const vSetupOutputPending = union(
  object({ state: literal("none") }),
  object({ state: literal("invalid_output"), source: vSetupOutputSource, reason: string() }),
  object({
    state: literal("refused"),
    source: vSetupOutputSource,
    step: vSetupOutputRefusalStep,
    claim: union(string(), v.null()),
    reason: string(),
  }),
  object({
    state: literal("deployed"),
    source: vSetupOutputSource,
    workers: array(object({ workerName: string(), rootDirectory: string() })),
    projects: array(
      object({ projectName: string(), projectSlug: string(), codeLocationPath: string() }),
    ),
    firstApply: vFirstSetupOutputApply,
  }),
  object({ state: literal("destroyed"), source: vSetupOutputSource }),
  object({ state: literal("failed"), source: vSetupOutputSource }),
);

/**
The status of the setup output of a repository whose setup stack publishes one: the run of the
newest setup output, the setup output that Samebase applied, the newest one that it did not apply
yet, and the last automatic apply that failed. A destroy receipt reports the run; the provider
observations show what is left.
*/
export const vSetupStatus = object({
  latestRun: vLatestSetupRun,
  applied: union(vRepositoryActionsSetupOutput, v.null()),
  pending: vSetupOutputPending,
  applyFailure: union(vRepositoryActionsSetupOutputApplyFailure, v.null()),
});
export type SetupStatus = Infer<typeof vSetupStatus>;

/**
What one read and apply of the newest setup output did, so the first failure names its step and its
reason.

no_output = no run on the default branch has published a live setup output yet

invalid_output = the newest artifact is not a setup output that Samebase can read, or its state
does not match how its run ended

refused = a provider did not confirm a claim or could not be read (verify_cloudflare,
verify_convex; `claim` is null for a failed read), or the apply transaction refused the change
(apply): a conflict, the connection quota, another operation

needs_member = the first apply waits for a member, for `reason`

failed = GitHub or Samebase's own records could not be read before Samebase could decide; `reason`
is its error

unchanged = nothing to apply: no setup output is newer than the applied one, or the newer one
names exactly the attached setup_stack resources

applied = the Workers and Convex projects of a deployed output are attached

destroy_reported = the app's confirmed destroy reported itself

setup_failed = the newest setup output is the failed output of a failed run: nothing to apply until
a later run succeeds
*/
export const vSetupOutputApplyResult = union(
  object({ state: literal("no_output") }),
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
    step: vSetupOutputRefusalStep,
    claim: union(string(), v.null()),
    reason: string(),
  }),
  object({
    state: literal("needs_member"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
    reason: string(),
  }),
  object({ state: literal("failed"), reason: string() }),
  object({ state: literal("unchanged"), latestRun: vSetupRun, source: vSetupOutputSource }),
  object({
    state: literal("applied"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
    workerCount: number(),
    projectCount: number(),
  }),
  object({
    state: literal("destroy_reported"),
    latestRun: vSetupRun,
    source: vSetupOutputSource,
  }),
  object({ state: literal("setup_failed"), latestRun: vSetupRun, source: vSetupOutputSource }),
);
export type SetupOutputApplyResult = Infer<typeof vSetupOutputApplyResult>;
