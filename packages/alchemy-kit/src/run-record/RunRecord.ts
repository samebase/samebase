// The run record: what the stage output says about the run that wrote it.
// Alchemy state holds no time, author, commit, branch, or run (measured in
// the Samebase research of 2026-10-21), so the layer `withRunRecord` adds this
// record to the output document under the reserved key `samebase.run`. The
// record depends on no store: it comes from the GitHub Actions variables, or
// from git in the checkout that runs the stack and the GitHub API, and holds no secret, and the
// layer goes over any state layer. See
// https://github.com/samebase/samebase/blob/main/packages/alchemy-convex/docs/design/convex-state.md.
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { promisify } from "node:util";
import { State, StateStoreError, type StateService } from "alchemy/State";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { encodePath } from "../github-state/git.ts";

/** The key of the record in the stage output document. */
export const RUN_RECORD_KEY = "samebase.run";

/** The name of the stack file. Alchemy resolves `--config` against the working directory and does not expose it to a state layer, so the record assumes the default name. */
export const STACK_FILE_NAME = "alchemy.run.ts";

/** Version 2 of the record. Version 1 had `repository` (`owner/name`) and no ids. A reader validates `version` first. */
export interface RunRecord {
  readonly version: 2;
  /** The GitHub repository id, digits, which a rename keeps. It says which repository the stage belongs to. */
  readonly repositoryId: string;
  /** The GitHub id of the owner of the repository, user or organization, digits. */
  readonly repositoryOwnerId: string;
  /** GitHub `owner/name` at the time of the run, for display only. */
  readonly repositoryName: string;
  /** Path of the stack file from the repository root, POSIX separators, such as `apps/samebase/alchemy.run.ts`. */
  readonly stackFile: string;
  /** The branch that was deployed: the head branch of a pull request, else the pushed branch. */
  readonly branch: string;
  /** The pull request whose head was deployed, or null for a push and for a checkout. */
  readonly pullRequest: number | null;
  /** The commit that was deployed: the head of the pull request, else GITHUB_SHA, else git HEAD. */
  readonly headCommit: string;
  /** The GitHub Actions run and attempt, or null for a checkout. */
  readonly runUrl: string | null;
  /**
   * Where the record came from: the variables of a GitHub Actions run, or git in a checkout outside
   * GitHub Actions, such as a developer's machine, a sandbox, or another CI. It says nothing of the
   * stage: a checkout can deploy `prod`.
   */
  readonly source: "github-actions" | "checkout";
  /** ISO 8601, when the record was written. */
  readonly recordedAt: string;
}

export class RunRecordError extends Schema.TaggedError<RunRecordError>()("RunRecordError", {
  reason: Schema.String,
}) {
  override get message() {
    return `The run record of the stage output cannot be made: ${this.reason}`;
  }
}

/** Where the run happens: the working directory of the stack and the process environment. */
export interface RunEnvironment {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** The part of the GitHub Actions event payload that the record reads. A push event has no `pull_request`. */
const EventPayload = Schema.Struct({
  pull_request: Schema.optionalKey(
    Schema.Struct({ number: Schema.Number, head: Schema.Struct({ sha: Schema.String }) }),
  ),
});

/** `owner/name` of an https, ssh, or scp-like git URL of github.com. */
const REMOTE_URL =
  /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

const GITHUB_API = "https://api.github.com";

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/** The part of `GET /repos/{owner}/{repo}` that the record reads. */
const ApiRepository = Schema.Struct({
  id: PositiveInt,
  owner: Schema.Struct({ id: PositiveInt }),
  full_name: Schema.String,
});

const execFileAsync = promisify(execFile);

const now = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()));

const git = (cwd: string, args: readonly string[]) =>
  Effect.tryPromise({
    try: async () =>
      (await execFileAsync("git", ["-C", cwd, ...args], { encoding: "utf8" })).stdout.trim(),
    catch: (error) =>
      new RunRecordError({
        reason: `git ${args.join(" ")} failed in ${cwd} (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`,
      }),
  });

/** The stack file from the repository root: the working directory below the git top level, plus {@link STACK_FILE_NAME}. */
const stackFileOf = (cwd: string) =>
  Effect.gen(function* () {
    const top = yield* git(cwd, ["rev-parse", "--show-toplevel"]);
    // git prints the real path, and the working directory can hold a symlink, such as macOS /tmp.
    const [realTop, realCwd] = yield* Effect.tryPromise({
      try: () => Promise.all([realpath(top), realpath(cwd)]),
      catch: () => new RunRecordError({ reason: `${cwd} is gone` }),
    });
    const directory = relative(realTop, realCwd)
      .split(sep)
      .filter((part) => part !== "");
    return [...directory, STACK_FILE_NAME].join("/");
  });

const variable = (env: RunEnvironment["env"], name: string) =>
  Effect.suspend(() => {
    const value = env[name];
    return value === undefined || value === ""
      ? Effect.fail(
          new RunRecordError({ reason: `GITHUB_ACTIONS is true, and ${name} is not set` }),
        )
      : Effect.succeed(value);
  });

const idVariable = (env: RunEnvironment["env"], name: string) =>
  Effect.flatMap(variable(env, name), (value) =>
    /^\d+$/.test(value)
      ? Effect.succeed(value)
      : Effect.fail(new RunRecordError({ reason: `${name} is not a GitHub id: ${value}` })),
  );

const fromGitHubActions = (where: RunEnvironment) =>
  Effect.gen(function* () {
    const { env } = where;
    const repository = yield* variable(env, "GITHUB_REPOSITORY");
    const repositoryId = yield* idVariable(env, "GITHUB_REPOSITORY_ID");
    const repositoryOwnerId = yield* idVariable(env, "GITHUB_REPOSITORY_OWNER_ID");
    const refName = yield* variable(env, "GITHUB_REF_NAME");
    const sha = yield* variable(env, "GITHUB_SHA");
    const serverUrl = yield* variable(env, "GITHUB_SERVER_URL");
    if (serverUrl !== "https://github.com") {
      return yield* new RunRecordError({
        reason: `GITHUB_SERVER_URL is ${serverUrl}, and only https://github.com is supported`,
      });
    }
    const runId = yield* variable(env, "GITHUB_RUN_ID");
    const runAttempt = yield* variable(env, "GITHUB_RUN_ATTEMPT");
    const eventPath = env["GITHUB_EVENT_PATH"];
    const payload =
      eventPath === undefined || eventPath === ""
        ? undefined
        : yield* Effect.tryPromise({
            try: () => readFile(eventPath, "utf8"),
            catch: () =>
              new RunRecordError({ reason: `GITHUB_EVENT_PATH ${eventPath} cannot be read` }),
          }).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(EventPayload))),
            Effect.mapError((error) =>
              error instanceof RunRecordError
                ? error
                : new RunRecordError({
                    reason: `GITHUB_EVENT_PATH ${eventPath} is not an event payload`,
                  }),
            ),
          );
    const pullRequest = payload?.pull_request;
    // GITHUB_SHA is the merge commit on a pull request event; the head of the pull request is what a person sees.
    const headCommit = pullRequest?.head.sha ?? sha;
    const headRef = env["GITHUB_HEAD_REF"];
    const mergeRef = /^refs\/pull\/(\d+)\/merge$/.exec(env["GITHUB_REF"] ?? "");
    const stackFile = yield* stackFileOf(where.cwd);
    const record: RunRecord = {
      version: 2,
      repositoryId,
      repositoryOwnerId,
      repositoryName: repository,
      stackFile,
      branch: headRef === undefined || headRef === "" ? refName : headRef,
      pullRequest: pullRequest?.number ?? (mergeRef === null ? null : Number(mergeRef[1])),
      headCommit,
      runUrl: `${serverUrl}/${repository}/actions/runs/${runId}/attempts/${runAttempt}`,
      source: "github-actions",
      recordedAt: yield* now,
    };
    return record;
  });

/** GITHUB_TOKEN, else GH_TOKEN, else the token of the GitHub CLI login, else none. */
const tokenOf = (env: RunEnvironment["env"]) => {
  const fromEnv = env["GITHUB_TOKEN"] || env["GH_TOKEN"];
  return fromEnv
    ? Effect.succeed(fromEnv)
    : Effect.promise(async () => {
        try {
          const { stdout } = await execFileAsync(
            "gh",
            ["auth", "token", "--hostname", "github.com"],
            { encoding: "utf8", timeout: 5000 },
          );
          return stdout.trim() || undefined;
        } catch {
          return undefined;
        }
      });
};

/** The repository of `owner/name` from the GitHub API, which follows a rename to the current name. */
const lookUpRepository = (env: RunEnvironment["env"], fullName: string) =>
  Effect.gen(function* () {
    const token = yield* tokenOf(env);
    const path = `/repos/${encodePath(fullName)}`;
    const failure = (what: string) => new RunRecordError({ reason: `GitHub GET ${path} ${what}` });
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${GITHUB_API}${path}`, {
          headers: {
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "samebase-alchemy-kit",
            ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
          },
          signal: AbortSignal.timeout(10_000),
        }),
      catch: (error) =>
        failure(`failed (${error instanceof Error ? error.message : String(error)})`),
    });
    if (!response.ok) {
      const hint = [401, 403, 404].includes(response.status)
        ? ": set GITHUB_TOKEN or run `gh auth login` for a private repository"
        : "";
      return yield* failure(`answered ${response.status}${hint}`);
    }
    const body = yield* Effect.tryPromise({
      try: (): Promise<unknown> => response.json(),
      catch: () => failure(`answered ${response.status} with no JSON`),
    });
    return yield* Schema.decodeUnknownEffect(ApiRepository)(body).pipe(
      Effect.mapError(() => failure("gave no repository id, owner id, and full name")),
    );
  });

const fromGit = (where: RunEnvironment) =>
  Effect.gen(function* () {
    const { cwd } = where;
    const origin = yield* git(cwd, ["remote", "get-url", "origin"]);
    const match = REMOTE_URL.exec(origin);
    if (match === null) {
      return yield* new RunRecordError({
        reason: `the origin remote of ${cwd} is not a github.com URL with owner/name: ${origin}`,
      });
    }
    const branch = yield* git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === "HEAD") {
      return yield* new RunRecordError({
        reason: `the checkout at ${cwd} is on no branch (detached HEAD)`,
      });
    }
    const stackFile = yield* stackFileOf(cwd);
    const headCommit = yield* git(cwd, ["rev-parse", "HEAD"]);
    const repository = yield* lookUpRepository(where.env, `${match[1]}/${match[2]}`);
    const record: RunRecord = {
      version: 2,
      repositoryId: String(repository.id),
      repositoryOwnerId: String(repository.owner.id),
      repositoryName: repository.full_name,
      stackFile,
      branch,
      pullRequest: null,
      headCommit,
      runUrl: null,
      source: "checkout",
      recordedAt: yield* now,
    };
    return record;
  });

/**
 * The record of this run: from the GitHub Actions variables and the event
 * payload when GITHUB_ACTIONS is `true`, else from git in `cwd`, which needs
 * a branch and a github.com `origin` remote, and from the GitHub API. Fails
 * when a value is missing; nothing is guessed.
 */
export const runRecord = (where: RunEnvironment): Effect.Effect<RunRecord, RunRecordError> =>
  where.env["GITHUB_ACTIONS"] === "true" ? fromGitHubActions(where) : fromGit(where);

/** A plain object, which a spread keeps whole. A Date, a Duration, or a Redacted value is an object too, and a spread loses it. */
// eslint-disable-next-line samebase/no-hand-written-type-predicate -- This published package depends on no app package; the body checks the prototype.
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * The output document of a stage: the stack's output plus the record under
 * {@link RUN_RECORD_KEY}, or undefined for an output with no place for the
 * key: a string, an array, null, or an object that is not plain, such as a
 * Date. A value that the stack itself put under the key stays.
 */
export const outputWithRunRecord = (output: unknown, record: RunRecord): object | undefined =>
  isPlainObject(output)
    ? RUN_RECORD_KEY in output
      ? output
      : { ...output, [RUN_RECORD_KEY]: record }
    : undefined;

/** The part of another stack's output that the rename check reads. Any other shape, version 1 included, is no record. */
const RecordOfOutput = Schema.Struct({
  [RUN_RECORD_KEY]: Schema.Struct({
    version: Schema.Literal(2),
    repositoryId: Schema.String,
    stackFile: Schema.String,
  }),
});

/**
 * The stack that this run must keep using, such as after a rename of its repository: another stack
 * than `stack` whose `prod` output has a record with the same `repositoryId` and `stackFile` as
 * `run`. Undefined when there is none.
 */
export const renamedStack = (
  stack: string,
  run: Pick<RunRecord, "repositoryId" | "stackFile">,
  others: ReadonlyArray<{ readonly stack: string; readonly prodOutput: unknown }>,
) => {
  for (const other of others) {
    const decoded = Schema.decodeUnknownOption(RecordOfOutput)(other.prodOutput);
    if (Option.isNone(decoded)) continue;
    const record = decoded.value[RUN_RECORD_KEY];
    if (
      other.stack !== stack &&
      record.repositoryId === run.repositoryId &&
      record.stackFile === run.stackFile
    ) {
      return other.stack;
    }
  }
  return undefined;
};

/**
 * The state of `inner`, with the record of this run in each stage output that it writes, under
 * {@link RUN_RECORD_KEY}: `state: withRunRecord(Convex.state())`, or the same over another state
 * layer, such as the Cloudflare state store of Alchemy. Every other call goes to `inner` as it is.
 *
 * The record is derived once, when the first output write or the first check of a new stack needs
 * it, and `recordedAt` is the time of the output write. A checkout that gives no record, such as a
 * tarball without git, a checkout without a github.com `origin`, a detached HEAD, or a failed
 * GitHub API request, still reads, plans, and destroys: its outputs are written without the record,
 * and the log says why. The engine writes the output only after a full successful apply, so the
 * record names the last full successful deploy of the stage.
 *
 * A run with a record stops at the first `list` of a new stack when {@link renamedStack} finds
 * another stack of the same repository and stack file. The stop needs a store whose `listStacks`
 * and `listStages` give full stack names and only real stages, as the Convex store does; over
 * another store it can miss the other stack, and the run goes on.
 */
export const withRunRecord = <E, R>(inner: Layer.Layer<State, E, R>): Layer.Layer<State, E, R> =>
  Layer.effect(
    State,
    Effect.gen(function* () {
      const open = yield* State;
      return yield* Effect.cached(
        Effect.gen(function* () {
          const service = yield* open;
          const run = yield* Effect.cached(
            runRecord({ cwd: process.cwd(), env: { ...process.env } }).pipe(
              Effect.catch((error) =>
                Effect.logWarning(
                  `The stage outputs of this run carry no run record. ${error.message}`,
                ).pipe(Effect.as(undefined)),
              ),
            ),
          );
          const documentOf = (request: { stack: string; stage: string; value: unknown }) =>
            Effect.gen(function* () {
              const record = yield* run;
              if (record === undefined) return request.value;
              const document = outputWithRunRecord(request.value, {
                ...record,
                recordedAt: yield* now,
              });
              if (document !== undefined) return document;
              yield* Effect.logWarning(
                `The output of ${request.stack}/${request.stage} is not a plain object, so it carries no run record.`,
              );
              return request.value;
            });
          const renameCheck = (stack: string) =>
            Effect.gen(function* () {
              if ((yield* service.listStages(stack)).length > 0) return;
              const current = yield* run;
              if (current === undefined) return;
              const stacks = (yield* service.listStacks()).filter((other) => other !== stack);
              const others = yield* Effect.forEach(
                stacks.toSorted(),
                (other) =>
                  service.getOutput({ stack: other, stage: "prod" }).pipe(
                    // An output that cannot be read, such as one sealed with another key, is no record.
                    Effect.catch(() => Effect.succeed(undefined)),
                    Effect.map((prodOutput) => ({ stack: other, prodOutput })),
                  ),
                { concurrency: 8 },
              );
              const found = renamedStack(stack, current, others);
              if (found === undefined) return;
              return yield* Effect.fail(
                new StateStoreError({
                  message: `The stack of this repository for ${current.stackFile} is "${found}". This run would start a new stack "${stack}": write "${found}" as the stack name in ${current.stackFile}.`,
                }),
              );
            });
          const verdicts = new Map<string, Effect.Effect<void, StateStoreError>>();
          // One synchronous step, so parallel lists of a stack share one check.
          const verdictOf = (stack: string, empty: boolean) => {
            const known = verdicts.get(stack);
            if (known !== undefined) return known;
            const verdict = empty ? Effect.runSync(Effect.cached(renameCheck(stack))) : Effect.void;
            verdicts.set(stack, verdict);
            return verdict;
          };
          const wrapped: StateService = {
            ...service,
            // Plan, deploy and destroy list the stack they work on before any provider call; a stack read through a reference uses get and getOutput.
            list: (request) =>
              service
                .list(request)
                .pipe(Effect.tap((fqns) => verdictOf(request.stack, fqns.length === 0))),
            setOutput: (request) =>
              documentOf(request).pipe(
                Effect.flatMap((value) =>
                  service.setOutput({ stack: request.stack, stage: request.stage, value }),
                ),
              ),
          };
          return wrapped;
        }),
      );
    }),
  ).pipe(Layer.provide(inner));
