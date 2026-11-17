// The store against an in-memory GitHub that can answer a ref read with the head before the last.
import { createHash } from "node:crypto";
import type { BucketObjects } from "alchemy/State/BucketState";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vitest";
import { blobSha } from "../src/git.ts";
import { makeGitHubObjects } from "../src/GitHubState.ts";

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
    answerOld: (count: number, back = 1) => {
      oldAnswers = count;
      headsBack = back;
    },
    answerNext: (status: number, json: unknown, headers: Record<string, string>) => {
      next = [status, json, headers];
    },
    layer: Layer.succeed(
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
