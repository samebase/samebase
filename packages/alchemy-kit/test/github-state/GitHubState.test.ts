// The store against an in-memory GitHub that can answer a ref read with the head before the last.
import { createHash } from "node:crypto";
import {
  encodeState,
  type PersistedState,
  State,
  type StateService,
  StateStoreError,
} from "alchemy/State";
import type { BucketObjects } from "alchemy/State/BucketState";
import { passphraseEncryption } from "alchemy/State/PassphraseEncryption";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vitest";
import { blobSha } from "../../src/github-state/git.ts";
import { makeGitHubObjects, state } from "../../src/github-state/GitHubState.ts";
import { KIT_0_2_2_KEY, KIT_0_2_2_PATH, KIT_0_2_2_RECORD } from "./kit-0.2.2-record.ts";

const passphrase = (text: string) => passphraseEncryption({ passphrase: Redacted.make(text) });
const ENCRYPTION = passphrase("test-passphrase");

const TreeBody = Schema.Struct({
  base_tree: Schema.optional(Schema.String),
  tree: Schema.Array(
    Schema.Struct({ path: Schema.String, content: Schema.optional(Schema.String) }),
  ),
});
const CommitBody = Schema.Struct({ tree: Schema.String, parents: Schema.Array(Schema.String) });
const RefBody = Schema.Struct({ ref: Schema.optional(Schema.String), sha: Schema.String });

/** The Git Data API of one repository, `o/r`. */
const fakeGitHub = () => {
  const blobs = new Map<string, string>();
  const trees = new Map<string, ReadonlyMap<string, string>>();
  const commits = new Map<string, { readonly tree: string; readonly parent: string | undefined }>();
  const heads = new Map<string, ReadonlyArray<string>>();
  const sha = (value: unknown) => createHash("sha1").update(JSON.stringify(value)).digest("hex");
  /** How many of the next ref reads answer with the head before the last. */
  let oldAnswers = 0;
  /** How many heads back those answers go. */
  let headsBack = 1;
  /** An answer for the next request in place of the real one. */
  let next: readonly [number, unknown, Record<string, string>] | undefined;

  const get = (route: string): readonly [number, unknown] => {
    if (route.startsWith("ref/heads/")) {
      const history = heads.get(route.slice("ref/heads/".length)) ?? [];
      const back = oldAnswers > 0 ? headsBack : 0;
      oldAnswers = Math.max(0, oldAnswers - 1);
      const commit = history[history.length - 1 - back];
      return commit === undefined ? [404, {}] : [200, { object: { sha: commit } }];
    }
    if (route.startsWith("trees/")) {
      const tree = commits.get(route.slice("trees/".length))?.tree ?? "";
      const entries = Array.from(trees.get(tree) ?? [], ([file, blob]) => ({
        path: file,
        type: "blob",
        sha: blob,
      }));
      return [200, { sha: tree, truncated: false, tree: entries }];
    }
    const text = blobs.get(route.slice("blobs/".length));
    return text === undefined
      ? [404, {}]
      : [200, { encoding: "base64", content: Buffer.from(text).toString("base64") }];
  };

  const change = (method: string, route: string, body: unknown): readonly [number, unknown] => {
    if (route === "trees") {
      const { base_tree, tree } = Schema.decodeUnknownSync(TreeBody)(body);
      const files = new Map(trees.get(base_tree ?? "") ?? []);
      for (const entry of tree) {
        if (entry.content === undefined) files.delete(entry.path);
        else {
          blobs.set(blobSha(entry.content), entry.content);
          files.set(entry.path, blobSha(entry.content));
        }
      }
      const id = sha(["tree", trees.size]);
      trees.set(id, files);
      return [201, { sha: id }];
    }
    if (route === "commits") {
      const { tree, parents } = Schema.decodeUnknownSync(CommitBody)(body);
      const id = sha(["commit", commits.size]);
      commits.set(id, { tree, parent: parents[0] });
      return [201, { sha: id }];
    }
    // `POST refs` makes a branch; `PATCH refs/heads/<branch>` moves it, forward only.
    const { ref, sha: commit } = Schema.decodeUnknownSync(RefBody)(body);
    const branch = (ref ?? route).replace("refs/heads/", "");
    const before = heads.get(branch) ?? [];
    if (commits.get(commit)?.parent !== before.at(-1)) return [422, {}];
    heads.set(branch, [...before, commit]);
    return [method === "POST" ? 201 : 200, {}];
  };

  const answer = (method: string, path: string, body: unknown) => {
    const route = path.replace("/repos/o/r/git/", "");
    return method === "GET" ? get(route) : change(method, route, body);
  };

  return {
    /** The number of commits on `branch`. */
    commits: (branch: string) => heads.get(branch)?.length ?? 0,
    /** The text of `path` at the head of `branch`. */
    file: (branch: string, path: string) => {
      const tree = commits.get(heads.get(branch)?.at(-1) ?? "")?.tree ?? "";
      return blobs.get(trees.get(tree)?.get(path) ?? "");
    },
    answerOld: (count: number, back = 1) => {
      oldAnswers = count;
      headsBack = back;
    },
    answerNext: (status: number, json: unknown, headers: Record<string, string>) => {
      next = [status, json, headers];
    },
    // With SecureRandom, as an Alchemy stack provides it to the State layer.
    layer: Layer.mergeAll(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request, url) =>
          Effect.sync(() => {
            const body: unknown =
              request.body._tag === "Uint8Array"
                ? JSON.parse(new TextDecoder().decode(request.body.body))
                : undefined;
            const [status, json, headers] = next ?? answer(request.method, url.pathname, body);
            next = undefined;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(json, headers === undefined ? { status } : { status, headers }),
            );
          }),
        ),
      ),
      SecureRandom.layerWebCrypto,
    ),
  };
};

vi.stubEnv("GITHUB_TOKEN", "not-a-token");

/** Two stores on one repository, as two processes would be. */
const run = <A, E>(
  github: ReturnType<typeof fakeGitHub>,
  use: (a: BucketObjects, b: BucketObjects) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.all([
      makeGitHubObjects({ repository: "o/r" }),
      makeGitHubObjects({ repository: "o/r" }),
    ]).pipe(
      Effect.flatMap(([a, b]) => use(a, b)),
      Effect.scoped,
      Effect.provide(github.layer),
    ),
  );

describe("makeGitHubObjects", () => {
  it("reads its own last write when GitHub first answers with the head before it", async () => {
    const github = fakeGitHub();
    const result = await run(github, (store) =>
      Effect.gen(function* () {
        yield* store.write("app/prod/A.json", "one");
        const version = yield* store.write("app/prod/A.json", "two");
        github.answerOld(2);
        const read = yield* store.read("app/prod/A.json");
        yield* store.delete("app/prod/A.json", version);
        github.answerOld(2);
        const afterDelete = yield* store.read("app/prod/A.json");
        github.answerOld(1);
        return { version, read, afterDelete, keys: yield* store.listKeys("app/") };
      }),
    );
    expect(result.read).toEqual({ text: "two", version: result.version });
    expect(result.afterDelete).toBeUndefined();
    expect(result.keys).toEqual([]);
  });

  it("takes no earlier head of its own for the branch, also from before another store's commit", async () => {
    const github = fakeGitHub();
    const result = await run(github, (a, b) =>
      Effect.gen(function* () {
        yield* a.write("app/prod/A.json", "one");
        yield* b.write("app/prod/Other.json", "other");
        yield* a.write("app/prod/A.json", "two");
        // Two heads back is the head that `a` made first.
        github.answerOld(2, 2);
        const read = yield* a.read("app/prod/A.json");
        github.answerOld(2, 2);
        return { read, keys: yield* a.listKeys("app/prod/") };
      }),
    );
    expect(result.read?.text).toBe("two");
    expect([...result.keys].sort()).toEqual(["app/prod/A.json", "app/prod/Other.json"]);
  });

  it("lists a stack whose name has a slash, and its stages", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const objects = yield* makeGitHubObjects({ repository: "o/r" });
        for (const key of [
          "owner/name/prod/Deployment.json",
          "owner/name/pr-4/__stack_output__.json",
          "owner/name/web/prod/Worker.json",
          "spike/demo/Label.json",
          "README.md",
          "owner/notes.json",
        ]) {
          yield* objects.write(key, "{}");
        }
        const store = yield* yield* State;
        return {
          stacks: yield* store.listStacks(),
          stages: yield* store.listStages("owner/name"),
          none: yield* store.listStages("owner"),
        };
      }).pipe(
        Effect.provide(state({ repository: "o/r" }).pipe(Layer.provide(ENCRYPTION))),
        Effect.scoped,
        Effect.provide(github.layer),
      ),
    );
    expect(result).toEqual({
      stacks: ["owner/name", "owner/name/web", "spike"],
      stages: ["pr-4", "prod"],
      none: [],
    });
  });

  it("fails a call whose rate limit answer gives a date to wait for", async () => {
    const github = fakeGitHub();
    github.answerNext(
      429,
      { message: "rate limit" },
      { "retry-after": "Wed, 18 Nov 2026 07:28:00 GMT" },
    );
    const error = await run(github, (store) => Effect.flip(store.read("app/prod/A.json")));
    expect(error.message).toContain("retry after Wed, 18 Nov 2026 07:28:00 GMT");
  });

  it("gives a version to one of two stores only", async () => {
    const github = fakeGitHub();
    const result = await run(github, (a, b) =>
      Effect.gen(function* () {
        const base = (yield* a.write("app/prod/A.json", "base")) ?? "";
        const seen = yield* b.read("app/prod/A.json");
        const absent = yield* b.write("app/prod/A.json", "b", { ifAbsent: true });
        const won = yield* b.write("app/prod/A.json", "b", { ifVersion: base });
        const lost = yield* a.write("app/prod/A.json", "a", { ifVersion: base });
        return { seen, absent, won, lost, text: (yield* a.read("app/prod/A.json"))?.text };
      }),
    );
    expect(result.seen?.text).toBe("base");
    expect(result.absent).toBeUndefined();
    expect(result.won).toBe(blobSha("b"));
    expect(result.lost).toBeUndefined();
    expect(result.text).toBe("b");
  });
});

const STATE = "alchemy-state-store";
const LOCK = "alchemy-state-store-lock";
const PROD = { stack: "owner/name", stage: "prod" };
const ROW = {
  kind: "resource",
  resourceType: "Convex.Project",
  namespace: undefined,
  fqn: "Convex/Project",
  logicalId: "Project",
  instanceId: "instance-1",
  providerVersion: 1,
  status: "created",
  downstream: [],
  bindings: [],
  props: { name: "app", nested: { list: [1, { deep: true }] } },
  attr: { deployKey: Redacted.make("the-deploy-key"), urls: { cloud: "https://example.test" } },
} satisfies PersistedState;
const OUTPUT = { url: "https://example.test", secret: Redacted.make("output-secret"), n: [1, 2] };

/** One process: a State service on `o/r` whose scope, and so its leases, closes after `use`. */
const inProcess = <A, E, R>(
  use: (service: StateService) => Effect.Effect<A, E, R>,
  encryption = ENCRYPTION,
) =>
  Effect.gen(function* () {
    return yield* use(yield* yield* State);
  }).pipe(
    Effect.provide(state({ repository: "o/r" }).pipe(Layer.provide(encryption))),
    Effect.scoped,
  );

/** Two processes on one repository. A's scope stays open while B runs. */
const twoProcesses = <A, E>(
  github: ReturnType<typeof fakeGitHub>,
  use: (a: StateService, b: StateService) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    inProcess((a) => inProcess((b) => use(a, b))).pipe(Effect.provide(github.layer)),
  );

const PREVIEW = { stack: "owner/name", stage: "pr-1" };
const ROW_FILE = "owner/name/pr-1/Convex__Project.json";
const CHANGED = "another deploy changed 'owner/name/pr-1' after this run read it";
/** Writes ROW to `stage` in a process that then closes. */
const writeRow = (stage: typeof PROD, value: PersistedState = ROW) =>
  inProcess((other) => other.set({ ...stage, fqn: ROW.fqn, value }));

describe("state", () => {
  it("reads a row and an output of a stage that another process holds, and takes no lock", async () => {
    const github = fakeGitHub();
    const result = await twoProcesses(github, (a, b) =>
      Effect.gen(function* () {
        yield* a.list(PROD);
        yield* a.set({ ...PROD, fqn: ROW.fqn, value: ROW });
        yield* a.setOutput({ ...PROD, value: OUTPUT });
        const lease = github.file(LOCK, "owner/name/prod/__lease__.json");
        const lockCommits = github.commits(LOCK);
        return {
          lease,
          lockCommits,
          a: { row: yield* a.get({ ...PROD, fqn: ROW.fqn }), output: yield* a.getOutput(PROD) },
          b: { row: yield* b.get({ ...PROD, fqn: ROW.fqn }), output: yield* b.getOutput(PROD) },
          leaseAfter: github.file(LOCK, "owner/name/prod/__lease__.json"),
          lockCommitsAfter: github.commits(LOCK),
        };
      }),
    );
    expect(result.b).toEqual(result.a);
    // encodeState opens each Redacted value, so the secrets themselves are compared too.
    expect(encodeState(result.b.row)).toEqual(encodeState(ROW));
    expect(encodeState(result.b.output)).toEqual(encodeState(OUTPUT));
    expect(result.lease).toBeDefined();
    expect(result.leaseAfter).toBe(result.lease);
    expect(result.lockCommitsAfter).toBe(result.lockCommits);
  });

  it("fails a list of a stage that another process holds", async () => {
    const github = fakeGitHub();
    const error = await twoProcesses(github, (a, b) =>
      a.list(PROD).pipe(Effect.andThen(Effect.flip(b.list(PROD)))),
    );
    expect(error.message).toContain("another deploy holds");
  });

  it("gives undefined for a row or an output that does not exist", async () => {
    const github = fakeGitHub();
    const result = await twoProcesses(github, (a, b) =>
      Effect.gen(function* () {
        yield* a.list(PROD);
        yield* a.set({ ...PROD, fqn: ROW.fqn, value: ROW });
        return {
          row: yield* b.get({ ...PROD, fqn: "Missing" }),
          output: yield* b.getOutput(PROD),
        };
      }),
    );
    expect(result).toEqual({ row: undefined, output: undefined });
  });

  it("fails a list of a stage whose row changed after a point read, and each later call on it", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PREVIEW);
        return yield* inProcess((b) =>
          Effect.gen(function* () {
            yield* b.get({ ...PREVIEW, fqn: ROW.fqn });
            yield* writeRow(PREVIEW, { ...ROW, instanceId: "instance-2" });
            const before = github.file(STATE, ROW_FILE);
            const list = yield* Effect.flip(b.list(PREVIEW));
            const set = yield* Effect.flip(b.set({ ...PREVIEW, fqn: ROW.fqn, value: ROW }));
            return { before, list, set, after: github.file(STATE, ROW_FILE) };
          }),
        );
      }).pipe(Effect.provide(github.layer)),
    );
    expect(result.list).toBeInstanceOf(StateStoreError);
    expect(result.list.message).toContain(CHANGED);
    expect(result.set.message).toContain(CHANGED);
    expect(result.before).toBeDefined();
    expect(result.after).toBe(result.before);
  });

  it("lists and reads a stage whose row and output did not change after a point read", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PREVIEW);
        yield* inProcess((other) => other.setOutput({ ...PREVIEW, value: OUTPUT }));
        return yield* inProcess((b) =>
          Effect.gen(function* () {
            yield* b.get({ ...PREVIEW, fqn: ROW.fqn });
            yield* b.getOutput(PREVIEW);
            const list = yield* b.list(PREVIEW);
            return { list, row: yield* b.get({ ...PREVIEW, fqn: ROW.fqn }) };
          }),
        );
      }).pipe(Effect.provide(github.layer)),
    );
    expect(result.list).toEqual([ROW.fqn]);
    expect(encodeState(result.row)).toEqual(encodeState(ROW));
  });

  it("fails a list of a stage where a row appeared after a point read found none", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      inProcess((b) =>
        Effect.gen(function* () {
          const row = yield* b.get({ ...PREVIEW, fqn: ROW.fqn });
          yield* writeRow(PREVIEW);
          return { row, list: yield* Effect.flip(b.list(PREVIEW)) };
        }),
      ).pipe(Effect.provide(github.layer)),
    );
    expect(result.row).toBeUndefined();
    expect(result.list).toBeInstanceOf(StateStoreError);
    expect(result.list.message).toContain(CHANGED);
  });

  it("gives the first answer again to a second point read of a row", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PROD);
        return yield* inProcess((b) =>
          Effect.gen(function* () {
            const first = yield* b.get({ ...PROD, fqn: ROW.fqn });
            yield* writeRow(PROD, { ...ROW, instanceId: "instance-2" });
            return { first, second: yield* b.get({ ...PROD, fqn: ROW.fqn }) };
          }),
        );
      }).pipe(Effect.provide(github.layer)),
    );
    expect(encodeState(result.first)).toEqual(encodeState(ROW));
    expect(encodeState(result.second)).toEqual(encodeState(ROW));
    expect(result.second).not.toBe(result.first);
  });

  it("seals a secret in Alchemy's sealed format, and a point read opens it", async () => {
    const github = fakeGitHub();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PROD);
        const row = yield* inProcess((b) => b.get({ ...PROD, fqn: ROW.fqn }));
        return { row, file: github.file(STATE, KIT_0_2_2_PATH) ?? "" };
      }).pipe(Effect.provide(github.layer)),
    );
    expect(result.file.startsWith("alchemy:sealed:1:passphrase:")).toBe(true);
    expect(result.file).not.toContain("the-deploy-key");
    expect(result.file).toMatch(/"deployKey": \{\n\s+"__sealed__": "[A-Za-z0-9+/=]+"/);
    expect(result.file).toContain('"cloud": "https://example.test"');
    expect(github.file(STATE, "__alchemy_store__.json")).toBe('{"format":1}');
    expect(encodeState(result.row)).toEqual(encodeState(ROW));
  });

  it("fails a read with a wrong passphrase, with and without the lease", async () => {
    const github = fakeGitHub();
    const wrong = passphrase("not-the-passphrase");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PROD);
        const point = yield* inProcess((b) => Effect.flip(b.get({ ...PROD, fqn: ROW.fqn })), wrong);
        const locked = yield* inProcess(
          (b) => b.list(PROD).pipe(Effect.andThen(Effect.flip(b.get({ ...PROD, fqn: ROW.fqn })))),
          wrong,
        );
        return { point: point.message, locked: locked.message };
      }).pipe(Effect.provide(github.layer)),
    );
    expect(result.point).toContain("wrong passphrase");
    expect(result.locked).toContain("wrong passphrase");
  });

  it("reads a record that kit 0.2.2 sealed only with its old key, and a locked read seals it again", async () => {
    const github = fakeGitHub();
    const putFixture = makeGitHubObjects({ repository: "o/r" }).pipe(
      Effect.flatMap((objects) => objects.write(KIT_0_2_2_PATH, KIT_0_2_2_RECORD)),
      Effect.scoped,
    );
    const get = (b: StateService) => b.get({ ...PROD, fqn: ROW.fqn });
    const locked = (b: StateService) => b.list(PROD).pipe(Effect.andThen(get(b)));
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* putFixture;
        vi.stubEnv("ALCHEMY_GITHUB_STATE_KEY", "");
        const noKey = {
          point: (yield* inProcess((b) => Effect.flip(get(b)))).message,
          locked: (yield* inProcess((b) => Effect.flip(locked(b)))).message,
        };
        vi.stubEnv("ALCHEMY_GITHUB_STATE_KEY", Buffer.alloc(32, 1).toString("base64"));
        const wrongKey = (yield* inProcess((b) => Effect.flip(get(b)))).message;
        vi.stubEnv("ALCHEMY_GITHUB_STATE_KEY", KIT_0_2_2_KEY);
        const point = yield* inProcess(get);
        const afterPoint = github.file(STATE, KIT_0_2_2_PATH);
        const viaLease = yield* inProcess(locked);
        const afterLock = github.file(STATE, KIT_0_2_2_PATH) ?? "";
        vi.stubEnv("ALCHEMY_GITHUB_STATE_KEY", "");
        const later = yield* inProcess(get);
        return { noKey, wrongKey, point, afterPoint, viaLease, afterLock, later };
      }).pipe(Effect.provide(github.layer)),
    );
    expect(result.noKey.point).toContain("secrets that @samebase/alchemy-kit 0.2 sealed");
    expect(result.noKey.locked).toContain("secrets that @samebase/alchemy-kit 0.2 sealed");
    expect(result.wrongKey).toContain(`a secret in ${KIT_0_2_2_PATH} does not open`);
    expect(encodeState(result.point)).toEqual(encodeState(ROW));
    // A point read takes no lease, so it writes nothing.
    expect(result.afterPoint).toBe(KIT_0_2_2_RECORD);
    expect(encodeState(result.viaLease)).toEqual(encodeState(ROW));
    expect(result.afterLock.startsWith("alchemy:sealed:1:passphrase:")).toBe(true);
    expect(result.afterLock).not.toContain("the-deploy-key");
    expect(encodeState(result.later)).toEqual(encodeState(ROW));
  });

  it("refuses a point read of a store in a newer format", async () => {
    const github = fakeGitHub();
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        yield* writeRow(PROD);
        yield* makeGitHubObjects({ repository: "o/r" }).pipe(
          Effect.flatMap((objects) => objects.write("__alchemy_store__.json", '{"format":2}')),
          Effect.scoped,
        );
        return yield* inProcess((b) => Effect.flip(b.get({ ...PROD, fqn: ROW.fqn })));
      }).pipe(Effect.provide(github.layer)),
    );
    expect(error.message).toContain("holds state in format 2");
  });

  it("reads the lease file of a stage through the lease", async () => {
    const github = fakeGitHub();
    const error = await twoProcesses(github, (a, b) =>
      a.list(PROD).pipe(Effect.andThen(Effect.flip(b.get({ ...PROD, fqn: "__lease__" })))),
    );
    expect(error.message).toContain("another deploy holds");
  });
});
