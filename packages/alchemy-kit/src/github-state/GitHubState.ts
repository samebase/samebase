import { execFileSync } from "node:child_process";
import { encodeFqn } from "alchemy/FQN";
import { State, type StateService, StateStoreError } from "alchemy/State";
import {
  type BucketObjects,
  makeBucketState,
  type WriteCondition,
} from "alchemy/State/BucketState";
import { makeSealingCodec, StateEncryption } from "alchemy/State/StateEncryption";
import { checkStoreFormat, parseStoreFormat, STORE_FORMAT_FILE } from "alchemy/State/StoreFormat";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import { blobSha, commitMessage, encodePath, LEASE_FILE } from "./git.ts";

/**
 * An Alchemy state store on a branch of a GitHub repository.
 *
 * Built on Alchemy's BucketState, like the S3 and Cloud Storage stores. The "bucket" is one Git
 * branch: a key is a path, an object's version is its blob sha. Writes queue up and one worker
 * turns everything queued into one commit through the Git Data API; the ref update with
 * `force: false` is the compare-and-swap, and a lost race starts the batch again on the new head.
 *
 * The lease (`__lease__.json`) lives on a second branch, `<branch>-lock`, so the state branch holds
 * only state.
 */

export interface GitHubStateOptions {
  /** `owner/name`. @default GITHUB_REPOSITORY, else the `origin` remote */
  readonly repository?: string;
  /** @default "alchemy-state-store" */
  readonly branch?: string;
}

const API = "https://api.github.com";
const MAX_ATTEMPTS = 20;

const STATE_README = `# Alchemy state

This branch holds the Alchemy state of this repository. Alchemy deploys write it; do not edit it
by hand. Each resource is one file, \`{stack}/{stage}/{resource}.json\`.

A file with a secret starts with an \`alchemy:sealed:1:\` line, and each secret in it is
\`{"__sealed__": "..."}\`, sealed by Alchemy's state encryption. Every other value is plain JSON.

The deploy lock of each stage is on the branch of the same name with \`-lock\` at the end.
`;

const LOCK_README = `# Alchemy deploy locks

This branch holds the lock (\`{stack}/{stage}/__lease__.json\`) of each stage while a deploy runs.
The state itself is on the branch without \`-lock\`.
`;

// GitHub responses, validated.
const RefResponse = Schema.Struct({ object: Schema.Struct({ sha: Schema.String }) });
const TreeResponse = Schema.Struct({
  sha: Schema.String,
  truncated: Schema.Boolean,
  tree: Schema.Array(
    Schema.Struct({ path: Schema.String, type: Schema.String, sha: Schema.String }),
  ),
});
const ShaResponse = Schema.Struct({ sha: Schema.String });
const BlobResponse = Schema.Struct({ encoding: Schema.String, content: Schema.String });

class Retryable extends Data.TaggedError("Retryable")<{ readonly message: string }> {}

interface Response {
  readonly status: number;
  readonly json: unknown;
}

/** A branch head: its commit, its tree, and every file's blob sha. */
interface Head {
  readonly commit: string;
  readonly tree: string;
  readonly files: ReadonlyMap<string, string>;
}

/** A queued write (`body`) or delete (`body` undefined). */
interface Pending {
  readonly key: string;
  readonly body: string | undefined;
  readonly condition: WriteCondition | undefined;
  readonly done: Deferred.Deferred<string | undefined, StateStoreError>;
}

/**
 * The batch applied in order to the files of `base`: the files after it, the new blob sha of each
 * write (`undefined` for a delete or a condition that did not hold), and the paths whose content
 * changes.
 */
const applyBatch = (base: Head | undefined, batch: ReadonlyArray<Pending>) => {
  const files = new Map(base?.files ?? []);
  const results: Array<string | undefined> = [];
  const changed = new Map<string, { body: string | undefined; lock: string }>();
  let conditionFailed = false;
  for (const pending of batch) {
    const current = files.get(pending.key);
    const condition = pending.condition;
    if (pending.body === undefined) {
      // A delete of a missing file, or of one at another version, does nothing.
      if (
        current !== undefined &&
        (condition === undefined || ("ifVersion" in condition && condition.ifVersion === current))
      ) {
        files.delete(pending.key);
        changed.set(pending.key, { body: undefined, lock: "release lock" });
      } else if (condition !== undefined) conditionFailed = true;
      results.push(undefined);
      continue;
    }
    if (condition !== undefined) {
      const holds =
        "ifAbsent" in condition ? current === undefined : current === condition.ifVersion;
      if (!holds) {
        conditionFailed = true;
        results.push(undefined);
        continue;
      }
    }
    const sha = blobSha(pending.body);
    files.set(pending.key, sha);
    changed.set(pending.key, {
      body: pending.body,
      lock: condition === undefined ? "" : "ifAbsent" in condition ? "take lock" : "renew lock",
    });
    results.push(sha);
  }
  const effective = Array.from(changed).filter(([path, change]) =>
    change.body === undefined
      ? base?.files.has(path) === true
      : base?.files.get(path) !== blobSha(change.body),
  );
  return { files, results, effective, conditionFailed };
};

const fail = (message: string) => new StateStoreError({ message });

/**
 * A secret that @samebase/alchemy-kit 0.3 or older sealed: `{"__redacted__": {"__sealed__": "v1..."}}`.
 * Alchemy's codec would read the inner object as the secret's value.
 */
const KIT_SECRET = /"__redacted__"\s*:\s*\{\s*"__sealed__"/;

const errorMessage = (json: unknown) =>
  typeof json === "object" && json !== null && "message" in json && typeof json.message === "string"
    ? json.message
    : "";

/** `owner/name` from the option, GITHUB_REPOSITORY, or the `origin` remote. */
const resolveRepository = (explicit: string | undefined) =>
  Effect.try({
    try: () => {
      const fromEnv = explicit ?? process.env["GITHUB_REPOSITORY"];
      if (fromEnv) return fromEnv;
      const url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" }).trim();
      const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
      if (!match?.[1]) throw new Error(`origin is not a GitHub remote: ${url}`);
      return match[1];
    },
    catch: (cause) =>
      fail(
        `GitHub state store: no repository. Set GITHUB_REPOSITORY or pass { repository }. ${cause instanceof Error ? cause.message : ""}`,
      ),
  });

/** The BucketObjects of one branch (plus its `-lock` branch), bound to the ambient scope. */
export const makeGitHubObjects = (options: GitHubStateOptions = {}) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const token = process.env["GITHUB_TOKEN"] || process.env["GH_TOKEN"];
    if (!token) return yield* fail("GitHub state store: set GITHUB_TOKEN or GH_TOKEN");
    const repository = yield* resolveRepository(options.repository);
    const stateBranch = options.branch ?? "alchemy-state-store";
    const repoPath = `/repos/${encodePath(repository)}`;

    const call = (method: "GET" | "POST" | "PATCH", path: string, body?: unknown) =>
      Effect.gen(function* () {
        const base = HttpClientRequest.make(method)(`${API}${repoPath}${path}`, {
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "samebase-alchemy-kit",
          },
        });
        const request = body === undefined ? base : HttpClientRequest.bodyJsonUnsafe(base, body);
        // A call with no answer would hold its callers for good: they wait uninterruptibly.
        const [response, text] = yield* client.execute(request).pipe(
          Effect.flatMap((answer) => Effect.map(answer.text, (body) => [answer, body] as const)),
          Effect.mapError((cause) => new Retryable({ message: cause.message })),
          Effect.timeoutOrElse({
            duration: "60 seconds",
            orElse: () =>
              Effect.fail(new Retryable({ message: `${method} ${path}: no answer in 60 seconds` })),
          }),
        );
        const json: unknown = yield* Effect.try({
          try: (): unknown => (text === "" ? undefined : JSON.parse(text)),
          catch: () =>
            new Retryable({ message: `${method} ${path}: not JSON (${response.status})` }),
        });
        const status = response.status;
        const retryAfter = response.headers["retry-after"];
        const limited =
          (status === 403 || status === 429) &&
          (retryAfter !== undefined ||
            response.headers["x-ratelimit-remaining"] === "0" ||
            /rate limit/i.test(errorMessage(json)));
        if (limited) {
          // `retry-after` can also be a date; only a count of at most 120 seconds is waited for.
          const seconds = Number(retryAfter ?? "60");
          if (!(seconds >= 0 && seconds <= 120)) {
            return yield* fail(
              `GitHub rate limit on ${method} ${path}: retry after ${retryAfter} (${errorMessage(json)})`,
            );
          }
          yield* Effect.sleep(`${seconds} seconds`);
          return yield* new Retryable({ message: `${method} ${path}: rate limited (${status})` });
        }
        if (status >= 500) {
          return yield* new Retryable({
            message: `${method} ${path}: ${status} ${errorMessage(json)}`,
          });
        }
        const result: Response = { status, json };
        return result;
      }).pipe(
        Effect.retry({
          while: (error) => error._tag === "Retryable",
          schedule: Schedule.exponential("500 millis"),
          times: 5,
        }),
        Effect.mapError((error) =>
          error._tag === "Retryable" ? fail(`GitHub state store: ${error.message}`) : error,
        ),
      );

    const decode =
      <S extends Schema.Codec<unknown, unknown>>(schema: S, what: string) =>
      (json: unknown) =>
        Schema.decodeUnknownEffect(schema)(json).pipe(
          Effect.mapError((cause) =>
            fail(`GitHub state store: unexpected ${what}: ${cause.message}`),
          ),
        );

    const unexpected = (what: string, response: Response) =>
      fail(
        `GitHub state store: ${what} answered ${response.status} ${errorMessage(response.json)}`,
      );

    /** The reads of one branch, and the worker that turns every queued write into one commit. */
    const makeBranch = (branch: string, readme: string) =>
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<Pending>();
        // The newest head this process knows, each head it saw since its last commit, the heads
        // that are behind one of its commits, and the text of each blob it wrote or read.
        let known: Head | undefined;
        const seen = new Set<string>();
        const replaced = new Set<string>();
        const blobs = new Map<string, string>();

        /**
         * The branch as GitHub has it now; `undefined` when it does not exist. GitHub can answer
         * with the head from before a write of this process (seen live: 1 read of 40 right after a
         * write). The branch only moves forward, so a head that is behind a commit of this process
         * is an old answer, and the question is asked again.
         */
        const current = Effect.gen(function* () {
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const ref = yield* call("GET", `/git/ref/heads/${encodePath(branch)}`);
            if (ref.status !== 200 && ref.status !== 404) {
              return yield* unexpected(`GET ref ${branch}`, ref);
            }
            const commit =
              ref.status === 404
                ? undefined
                : (yield* decode(RefResponse, "ref")(ref.json)).object.sha;
            if (commit === undefined ? known !== undefined : replaced.has(commit)) {
              yield* Effect.sleep("250 millis");
              continue;
            }
            if (commit === undefined) return undefined;
            seen.add(commit);
            if (known?.commit === commit) return known;
            const treeResponse = yield* call("GET", `/git/trees/${commit}?recursive=1`);
            if (treeResponse.status !== 200) {
              return yield* unexpected(`GET tree ${branch}`, treeResponse);
            }
            const tree = yield* decode(TreeResponse, "tree")(treeResponse.json);
            if (tree.truncated) {
              return yield* fail(
                `GitHub state store: the tree of ${branch} is too large (truncated)`,
              );
            }
            const files = new Map<string, string>();
            for (const entry of tree.tree) {
              if (entry.type === "blob") files.set(entry.path, entry.sha);
            }
            const head: Head = { commit, tree: tree.sha, files };
            // A commit of this process can land while the tree loads.
            if (!replaced.has(commit)) known = head;
            return head;
          }
          return yield* fail(
            `GitHub state store: ${branch} kept answering with a head from before this run's last write`,
          );
        });

        const read = (path: string) =>
          Effect.gen(function* () {
            const version = (yield* current)?.files.get(path);
            if (version === undefined) return undefined;
            const held = blobs.get(version);
            if (held !== undefined) return { text: held, version };
            const response = yield* call("GET", `/git/blobs/${version}`);
            if (response.status !== 200) return yield* unexpected(`GET blob ${path}`, response);
            const blob = yield* decode(BlobResponse, "blob")(response.json);
            if (blob.encoding !== "base64") {
              return yield* fail(`GitHub state store: ${path} has encoding ${blob.encoding}`);
            }
            const text = Buffer.from(blob.content, "base64").toString("utf8");
            blobs.set(version, text);
            return { text, version };
          });

        const commitBatch = (batch: ReadonlyArray<Pending>) =>
          Effect.gen(function* () {
            // The first attempt builds on the known head without a question to GitHub: the ref
            // update fails if another writer moved the branch since.
            let trusted = known !== undefined;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
              const base = trusted ? known : yield* current;
              const { files, results, effective, conditionFailed } = applyBatch(base, batch);
              // A failed condition or "nothing to write" against the known head may be out of
              // date: check against the branch as it is now.
              if (trusted && (conditionFailed || effective.length === 0)) {
                trusted = false;
                continue;
              }
              if (effective.length === 0) return results;
              const isLock = branch !== stateBranch;
              const message = commitMessage(
                effective.map(([key, change]) => ({
                  key,
                  deleted: change.body === undefined,
                  lock: isLock ? change.lock : "",
                })),
              );
              const entries = effective.map(([path, change]) =>
                change.body === undefined
                  ? { path, mode: "100644", type: "blob", sha: null }
                  : { path, mode: "100644", type: "blob", content: change.body },
              );
              const treeResponse = yield* call(
                "POST",
                "/git/trees",
                base === undefined
                  ? {
                      tree: [
                        { path: "README.md", mode: "100644", type: "blob", content: readme },
                        ...entries.filter((entry) => !("sha" in entry)),
                      ],
                    }
                  : { base_tree: base.tree, tree: entries },
              );
              if (treeResponse.status !== 201) {
                return yield* unexpected(`POST tree ${branch}`, treeResponse);
              }
              const tree = (yield* decode(ShaResponse, "tree")(treeResponse.json)).sha;
              const commitResponse = yield* call("POST", "/git/commits", {
                message,
                tree,
                parents: base === undefined ? [] : [base.commit],
              });
              if (commitResponse.status !== 201) {
                return yield* unexpected(`POST commit ${branch}`, commitResponse);
              }
              const commit = (yield* decode(ShaResponse, "commit")(commitResponse.json)).sha;
              const refResponse =
                base === undefined
                  ? yield* call("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: commit })
                  : yield* call("PATCH", `/git/refs/heads/${encodePath(branch)}`, {
                      sha: commit,
                      force: false,
                    });
              // 422: another writer moved (or created) the branch. Start again on its head.
              if (refResponse.status === 422) {
                trusted = false;
                continue;
              }
              if (refResponse.status !== 200 && refResponse.status !== 201) {
                return yield* unexpected(`update ref ${branch}`, refResponse);
              }
              // Each head seen so far was the head at some time before this commit landed, so it
              // is behind this commit: the base, and also an earlier head of this process when
              // another writer's commit came between.
              for (const head of seen) replaced.add(head);
              seen.clear();
              seen.add(commit);
              known = { commit, tree, files };
              for (const [, change] of effective) {
                if (change.body !== undefined) blobs.set(blobSha(change.body), change.body);
              }
              return results;
            }
            return yield* fail(
              `GitHub state store: ${branch} kept moving; gave up after ${MAX_ATTEMPTS} attempts`,
            );
          });

        yield* Queue.takeAll(queue).pipe(
          Effect.flatMap((batch) =>
            commitBatch(batch).pipe(
              Effect.flatMap((results) =>
                Effect.forEach(batch, (pending, i) => Deferred.succeed(pending.done, results[i]), {
                  discard: true,
                }),
              ),
              // Also a defect goes to the callers: a worker that stops would leave them waiting.
              Effect.catchCause((cause) =>
                Effect.forEach(batch, (pending) => Deferred.failCause(pending.done, cause), {
                  discard: true,
                }),
              ),
            ),
          ),
          Effect.forever,
          Effect.forkScoped,
        );

        return {
          read,
          /** Every file path on the branch, with one call when the head is the known one. */
          paths: current.pipe(Effect.map((head) => Array.from(head?.files.keys() ?? []))),
          /** Queue a write or delete; the deferred resolves once its commit is on the branch. */
          enqueue: (key: string, body: string | undefined, condition: WriteCondition | undefined) =>
            Effect.gen(function* () {
              const done = yield* Deferred.make<string | undefined, StateStoreError>();
              yield* Queue.offer(queue, { key, body, condition, done });
              return done;
            }),
        };
      });

    const store = yield* makeBranch(stateBranch, STATE_README);
    const lock = yield* makeBranch(`${stateBranch}-lock`, LOCK_README);
    const branchOf = (key: string) =>
      key === LEASE_FILE || key.endsWith(`/${LEASE_FILE}`) ? lock : store;
    const enqueue = (
      key: string,
      body: string | undefined,
      condition: WriteCondition | undefined,
    ) => branchOf(key).enqueue(key, body, condition);
    // A queued write lands even when its caller is interrupted, so the caller waits for it.
    // BucketState interrupts a lease renewal before it releases the lease; with an interruptible
    // wait the renewal could land after the release read the lease, and the release then deleted
    // nothing.
    const submit = (key: string, body: string | undefined, condition: WriteCondition | undefined) =>
      enqueue(key, body, condition).pipe(Effect.flatMap(Deferred.await), Effect.uninterruptible);

    const objects: BucketObjects = {
      listKeys: (prefix) =>
        store.paths.pipe(Effect.map((paths) => paths.filter((path) => path.startsWith(prefix)))),
      listChildren: (prefix) =>
        store.paths.pipe(
          Effect.map((paths) => {
            const children = new Set<string>();
            for (const path of paths) {
              if (!path.startsWith(prefix)) continue;
              const rest = path.slice(prefix.length);
              const slash = rest.indexOf("/");
              if (slash > 0) children.add(rest.slice(0, slash));
            }
            return Array.from(children);
          }),
        ),
      read: (key) => branchOf(key).read(key),
      write: (key, body, condition) => submit(key, body, condition),
      delete: (key, ifVersion) =>
        submit(key, undefined, ifVersion === undefined ? undefined : { ifVersion }).pipe(
          Effect.asVoid,
        ),
      // Queue every delete before waiting, so they land in one commit.
      deleteMany: (keys) =>
        Effect.forEach(keys, (key) => enqueue(key, undefined, undefined)).pipe(
          Effect.flatMap((pending) => Effect.forEach(pending, Deferred.await, { discard: true })),
          Effect.uninterruptible,
        ),
    };

    return objects;
  });

/**
 * The State layer. It builds the store on the first state operation, bound to this layer's scope.
 * It needs a StateEncryption, such as `passphraseEncryption()`, which seals each secret: a store on
 * a Git branch keeps no secret in plaintext.
 *
 * A `get` or `getOutput` of a stage that the run has not locked takes no lock. So a preview that
 * reads a resource of `prod` runs beside a deploy of `prod`; with the lock, one of them failed.
 * Every other call takes the lock of its stage, as BucketState does. A run gives the first answer
 * of such a read again, and when it later locks that stage, it fails if those files changed.
 */
export const state = (
  options: GitHubStateOptions = {},
): Layer.Layer<State, never, HttpClient.HttpClient | SecureRandom.SecureRandom | StateEncryption> =>
  Layer.effect(
    State,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      // An Alchemy stack provides the first two: BucketState makes its lease tokens with
      // SecureRandom.
      const context = yield* Effect.context<
        HttpClient.HttpClient | SecureRandom.SecureRandom | StateEncryption
      >();
      const make = Effect.gen(function* () {
        // One codec for BucketState and the point reads, so a stage mints one data key.
        const codec = makeSealingCodec(yield* StateEncryption);
        const objects = yield* makeGitHubObjects(options);
        const opened: BucketObjects = {
          ...objects,
          read: (objectKey) =>
            objects.read(objectKey).pipe(
              Effect.filterOrFail(
                (object) => object === undefined || !KIT_SECRET.test(object.text),
                () =>
                  fail(
                    `GitHub state store: ${objectKey} holds secrets that @samebase/alchemy-kit 0.3 or older sealed. Destroy the stage with that version, then deploy again.`,
                  ),
              ),
            ),
        };
        const bucket = yield* makeBucketState({
          id: "github",
          label: "GitHub",
          objects: Effect.succeed(opened),
          codec,
        });
        // A point read skips BucketState, so it checks the store's format itself.
        const checkFormat = objects
          .read(STORE_FORMAT_FILE)
          .pipe(
            Effect.flatMap((record) =>
              checkStoreFormat(
                "GitHub state store",
                record === undefined ? undefined : parseStoreFormat(record.text)?.format,
              ),
            ),
          );
        // A state file is `{stack}/{stage}/{file}.json`, and a stack name can hold `/`, such as
        // `owner/name` beside `owner/name/web`. BucketState lists the first folder below a path,
        // which gives `owner` as a stack and `web` as a stage of `owner/name`. So both lists come
        // from the file paths. The call to BucketState stays for its check of the held leases.
        const stages = objects.listKeys("").pipe(
          Effect.map((keys) =>
            keys.flatMap((key) => {
              const [file, stage, ...stack] = key.split("/").reverse();
              return stage === undefined || stack.length === 0 || !file?.endsWith(".json")
                ? []
                : [{ stack: stack.reverse().join("/"), stage }];
            }),
          ),
        );
        type Stage = { readonly stack: string; readonly stage: string };
        // A stage's key is `{stack}/{stage}`, as BucketState keys its lease.
        const keyOf = ({ stack, stage }: Stage) => `${stack}/${stage}`;
        // Each file that this run read without the lease, by path, with the first answer.
        const reads = new Map<
          string,
          Stage & { readonly object: { text: string; version: string } | undefined }
        >();
        // The check of each stage that this run locked, and each stack that it deleted whole.
        const checks = new Map<string, Deferred.Deferred<void, StateStoreError>>();
        const deletedStacks = new Set<string>();
        const isLocked = (key: string) =>
          checks.has(key) || [...deletedStacks].some((prefix) => key.startsWith(prefix));
        // At the first lock of a stage that this run read from, the lease is taken and each read
        // file must still be at the version that the run saw. Each operation on the stage waits
        // for this one check, and a failed check fails each of them. It is uninterruptible, so
        // the operations that wait for it always get its result.
        const checkOf = (stage: Stage) =>
          Effect.suspend(() => {
            const key = keyOf(stage);
            const started = checks.get(key);
            if (started !== undefined) return Deferred.await(started);
            const done = Deferred.makeUnsafe<void, StateStoreError>();
            checks.set(key, done);
            const read = [...reads].filter(([, kept]) => keyOf(kept) === key);
            const check =
              read.length === 0
                ? Effect.void
                : bucket.list(stage).pipe(
                    Effect.andThen(
                      Effect.forEach(read, ([path, kept]) =>
                        objects
                          .read(path)
                          .pipe(Effect.map((now) => now?.version === kept.object?.version)),
                      ),
                    ),
                    Effect.flatMap((same) =>
                      same.every(Boolean)
                        ? Effect.void
                        : Effect.fail(
                            fail(
                              `GitHub state store: another deploy changed '${key}' after this run read it. Run the deploy again.`,
                            ),
                          ),
                    ),
                  );
            return check.pipe(
              Deferred.into(done),
              Effect.uninterruptible,
              Effect.andThen(Deferred.await(done)),
            );
          });
        const locking = <A>(stage: Stage, operation: Effect.Effect<A, StateStoreError>) =>
          checkOf(stage).pipe(Effect.andThen(operation));
        // On a stage that this run has not locked, read the one file with BucketState's key and
        // decoding, and give the first answer again to each later read of that file. The value
        // has the type that `viaLease` gives for the same file.
        const pointRead = <A>(
          request: Stage,
          file: string,
          viaLease: Effect.Effect<A, StateStoreError>,
        ) =>
          Effect.suspend(() => {
            const key = keyOf(request);
            const path = `${key}/${file}`;
            const lease = locking(request, viaLease);
            if (file === LEASE_FILE || isLocked(key)) return lease;
            const kept = reads.get(path);
            return (
              kept === undefined
                ? checkFormat.pipe(Effect.andThen(opened.read(path)))
                : Effect.succeed(kept.object)
            ).pipe(
              Effect.flatMap((object) => {
                // The stage can become locked while the file loads: then the lease answers.
                if (isLocked(key)) return lease;
                const { stack, stage } = request;
                const first = reads.get(path) ?? { stack, stage, object };
                reads.set(path, first);
                const text = first.object?.text;
                // Decoded only: a stale record is sealed again by the run that locks its stage.
                return text === undefined
                  ? Effect.undefined
                  : codec.decode<A>(request, text, `state object '${path}'`);
              }),
            );
          });
        // A deploy locks its stage at its first `list`, before it plans. A preview reads one row of
        // `prod`; with the lease, that read collided with each deploy of `prod` at the same time.
        const service: StateService = {
          ...bucket,
          list: (r) => locking(r, bucket.list(r)),
          getReplacedResources: (r) => locking(r, bucket.getReplacedResources(r)),
          set: (r) => locking(r, bucket.set(r)),
          delete: (r) => locking(r, bucket.delete(r)),
          setOutput: (r) => locking(r, bucket.setOutput(r)),
          // Without a stage, BucketState takes the lease of each stage of the stack. Each stage
          // below it that this run read from is checked first.
          deleteStack: ({ stack, stage }) =>
            stage === undefined
              ? Effect.suspend(() => {
                  deletedStacks.add(`${stack}/`);
                  const read = [...reads.values()].filter((kept) => isLocked(keyOf(kept)));
                  return Effect.forEach(read, checkOf, { discard: true });
                }).pipe(Effect.andThen(bucket.deleteStack({ stack })))
              : locking({ stack, stage }, bucket.deleteStack({ stack, stage })),
          get: (r) => pointRead(r, `${encodeFqn(r.fqn)}.json`, bucket.get(r)),
          getOutput: (r) => pointRead(r, "__stack_output__.json", bucket.getOutput(r)),
          listStacks: () =>
            bucket.listStacks().pipe(
              Effect.andThen(stages),
              Effect.map((found) => [...new Set(found.map(({ stack }) => stack))].sort()),
            ),
          listStages: (stack: string) =>
            bucket.listStages(stack).pipe(
              Effect.andThen(stages),
              Effect.map((found) =>
                [
                  ...new Set(
                    found.flatMap((entry) => (entry.stack === stack ? [entry.stage] : [])),
                  ),
                ].sort(),
              ),
            ),
        };
        return service;
      });
      return yield* Effect.cached(
        Scope.provide(make, scope).pipe(Effect.orDie, Effect.provideContext(context)),
      );
    }),
  );
