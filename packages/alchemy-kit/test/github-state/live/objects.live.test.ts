// A live test of the BucketObjects contract on a throwaway branch, `alchemy-state-test-<random>`, of
// the repository in ALCHEMY_GITHUB_TEST_REPOSITORY (`owner/name`). It needs GITHUB_TOKEN with
// contents write on that repository, and deletes the branch and its -lock branch at the end.
// `pnpm run test:live` runs it; CI does not.
import { randomBytes } from "node:crypto";
import type { BucketObjects } from "alchemy/State/BucketState";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Schema from "effect/Schema";
import { afterAll, describe, expect, test } from "vitest";
import { makeGitHubObjects } from "../../../src/github-state/GitHubState.ts";

const repository = process.env["ALCHEMY_GITHUB_TEST_REPOSITORY"];
if (!repository) throw new Error("Set ALCHEMY_GITHUB_TEST_REPOSITORY to owner/name.");
const branch = `alchemy-state-test-${randomBytes(4).toString("hex")}`;
const options = { repository, branch };

const run = <A, E>(use: (objects: BucketObjects) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    makeGitHubObjects(options).pipe(
      Effect.flatMap(use),
      Effect.scoped,
      Effect.provide(FetchHttpClient.layer),
    ),
  );

/** Two independent stores (own queue, own cached head), as two processes would be. */
const runTwo = <A, E>(use: (a: BucketObjects, b: BucketObjects) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.all([makeGitHubObjects(options), makeGitHubObjects(options)]).pipe(
      Effect.flatMap(([a, b]) => use(a, b)),
      Effect.scoped,
      Effect.provide(FetchHttpClient.layer),
    ),
  );

const github = (method: "GET" | "DELETE", path: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.make(method)(`https://api.github.com/repos/${repository}${path}`, {
        headers: {
          authorization: `Bearer ${process.env["GITHUB_TOKEN"] ?? ""}`,
          accept: "application/vnd.github+json",
          "user-agent": "samebase-alchemy-kit-test",
        },
      }),
    );
    return { status: response.status, json: method === "GET" ? yield* response.json : undefined };
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.runPromise);

const commitCount = async (name: string) => {
  const { json } = await github("GET", `/commits?sha=${name}&per_page=100`);
  return Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(json).length;
};

const paths = async (name: string) => {
  const { json } = await github("GET", `/git/trees/${name}?recursive=1`);
  const tree = Schema.decodeUnknownSync(
    Schema.Struct({ tree: Schema.Array(Schema.Struct({ path: Schema.String })) }),
  )(json);
  return tree.tree.map((entry) => entry.path);
};

afterAll(async () => {
  for (const name of [branch, `${branch}-lock`]) {
    const { status } = await github("DELETE", `/git/refs/heads/${name}`);
    console.log(`deleted ${name}: ${status}`);
  }
}, 60_000);

describe(`GitHub BucketObjects on ${branch}`, { timeout: 120_000 }, () => {
  test("ifAbsent creates the branch with a README, then refuses", async () => {
    const [first, second, read] = await run((o) =>
      Effect.all([
        o.write("a/x.json", "1", { ifAbsent: true }),
        o.write("a/x.json", "2", { ifAbsent: true }),
        o.read("a/x.json"),
      ]),
    );
    expect(first).toBeTypeOf("string");
    expect(second).toBeUndefined();
    expect(read).toEqual({ text: "1", version: first });
    expect(await paths(branch)).toEqual(["README.md", "a", "a/x.json"]);
  });

  test("a read right after a write sees it (10 tries)", async () => {
    const stale = await run((o) =>
      Effect.gen(function* () {
        let misses = 0;
        for (let i = 0; i < 10; i++) {
          const version = yield* o.write("a/r.json", `{"n":${i}}`);
          const read = yield* o.read("a/r.json");
          if (read?.version !== version) misses++;
        }
        return misses;
      }),
    );
    expect(stale).toBe(0);
  });

  test("ifVersion: a stale version loses, the current one wins", async () => {
    const result = await run((o) =>
      Effect.gen(function* () {
        const v1 = yield* o.write("a/v.json", "one");
        const v2 = yield* o.write("a/v.json", "two");
        const stale = yield* o.write("a/v.json", "three", { ifVersion: v1 ?? "" });
        const current = yield* o.write("a/v.json", "four", { ifVersion: v2 ?? "" });
        return { stale, current, text: (yield* o.read("a/v.json"))?.text };
      }),
    );
    expect(result.stale).toBeUndefined();
    expect(result.current).toBeTypeOf("string");
    expect(result.text).toBe("four");
  });

  test("conditional delete: wrong version keeps, right version deletes, missing is fine", async () => {
    const result = await run((o) =>
      Effect.gen(function* () {
        const version = yield* o.write("a/d.json", "doomed");
        yield* o.delete("a/d.json", "0000000000000000000000000000000000000000");
        const kept = yield* o.read("a/d.json");
        yield* o.delete("a/d.json", version);
        const gone = yield* o.read("a/d.json");
        yield* o.delete("a/never.json");
        return { kept: kept?.text, gone };
      }),
    );
    expect(result).toEqual({ kept: "doomed", gone: undefined });
  });

  test("listKeys and listChildren", async () => {
    const result = await run((o) =>
      Effect.gen(function* () {
        yield* Effect.all(
          ["s1/p/a.json", "s1/p/b.json", "s1/q/c.json", "s2/d.json"].map((key) =>
            o.write(key, key),
          ),
          { concurrency: "unbounded" },
        );
        return {
          keys: [...(yield* o.listKeys("s1/"))].sort(),
          root: [...(yield* o.listChildren(""))].sort(),
          s1: [...(yield* o.listChildren("s1/"))].sort(),
        };
      }),
    );
    expect(result).toEqual({
      keys: ["s1/p/a.json", "s1/p/b.json", "s1/q/c.json"],
      root: ["a", "s1", "s2"],
      s1: ["p", "q"],
    });
  });

  test("10 concurrent writes become fewer commits", async () => {
    const before = await commitCount(branch);
    await run((o) =>
      Effect.all(
        Array.from({ length: 10 }, (_, i) => o.write(`b/${i}.json`, `${i}`)),
        { concurrency: "unbounded" },
      ),
    );
    expect((await commitCount(branch)) - before).toBeLessThan(10);
  });

  test("deleteMany is one commit", async () => {
    const before = await commitCount(branch);
    await run((o) => o.deleteMany(["b/0.json", "b/1.json", "b/2.json", "b/missing.json"]));
    expect((await commitCount(branch)) - before).toBe(1);
  });

  test("rival writers: exactly one ifAbsent wins", async () => {
    const results = await runTwo((a, b) =>
      Effect.all(
        [
          a.write("r/once.json", "a", { ifAbsent: true }),
          b.write("r/once.json", "b", { ifAbsent: true }),
        ],
        { concurrency: "unbounded" },
      ),
    );
    expect(results.filter((r) => r !== undefined)).toHaveLength(1);
  });

  test("rival writers: exactly one ifVersion from the same base wins", async () => {
    const results = await runTwo((a, b) =>
      Effect.gen(function* () {
        const base = (yield* a.write("r/cas.json", "base")) ?? "";
        return yield* Effect.all(
          [
            a.write("r/cas.json", "a", { ifVersion: base }),
            b.write("r/cas.json", "b", { ifVersion: base }),
          ],
          { concurrency: "unbounded" },
        );
      }),
    );
    expect(results.filter((r) => r !== undefined)).toHaveLength(1);
  });

  test("a lease goes to the -lock branch only", async () => {
    const read = await run((o) =>
      o
        .write("st/sg/__lease__.json", '{"token":"t","expiresAt":0}', { ifAbsent: true })
        .pipe(Effect.andThen(o.read("st/sg/__lease__.json"))),
    );
    expect(read?.text).toBe('{"token":"t","expiresAt":0}');
    expect(await paths(`${branch}-lock`)).toContain("st/sg/__lease__.json");
    expect(await paths(branch)).not.toContain("st/sg/__lease__.json");
  });
});
