import { execFileSync } from "node:child_process";
import { State, StateStoreError } from "alchemy/State";
import {
  type BucketObjects,
  makeBucketState,
  type WriteCondition,
} from "alchemy/State/BucketState";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import { blobSha, commitMessage, encodePath, LEASE_FILE } from "./git.ts";
import { KEY_VARIABLE, openRecord, parseKey, sealRecord } from "./sealing.ts";

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
  /** Base64 of 32 bytes that seals each secret. @default ALCHEMY_GITHUB_STATE_KEY */
  readonly key?: Redacted.Redacted<string>;
}

const API = "https://api.github.com";
const MAX_ATTEMPTS = 20;

const STATE_README = `# Alchemy state

This branch holds the Alchemy state of this repository. Alchemy deploys write it; do not edit it
by hand. Each resource is one file, \`{stack}/{stage}/{resource}.json\`.

Each secret value is \`{"__redacted__": {"__sealed__": "v1.<iv>.<ciphertext>"}}\`, sealed with
AES-256-GCM under the key in ${KEY_VARIABLE}. Every other value is plain JSON.

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
 * The State layer. It reads the key and builds the store on the first state operation, bound to
 * this layer's scope, so a missing key fails the run before any read or write.
 */
export const state = (
  options: GitHubStateOptions = {},
): Layer.Layer<State, never, HttpClient.HttpClient> =>
  Layer.effect(
    State,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const context = yield* Effect.context<HttpClient.HttpClient>();
      const make = Effect.gen(function* () {
        const key = yield* parseKey(
          options.key === undefined ? process.env[KEY_VARIABLE] : Redacted.value(options.key),
        );
        const objects = yield* makeGitHubObjects(options);
        const sealed: BucketObjects = {
          ...objects,
          read: (objectKey) =>
            objects
              .read(objectKey)
              .pipe(
                Effect.flatMap((object) =>
                  object === undefined
                    ? Effect.undefined
                    : openRecord(key, objectKey, object.text).pipe(
                        Effect.map((text) => ({ text, version: object.version })),
                      ),
                ),
              ),
          write: (objectKey, body, condition) =>
            sealRecord(key, objectKey, body).pipe(
              Effect.flatMap((text) => objects.write(objectKey, text, condition)),
            ),
        };
        return yield* makeBucketState({
          id: "github",
          label: "GitHub",
          objects: Effect.succeed(sealed),
        });
      });
      return yield* Effect.cached(
        Scope.provide(make, scope).pipe(Effect.orDie, Effect.provideContext(context)),
      );
    }),
  );
