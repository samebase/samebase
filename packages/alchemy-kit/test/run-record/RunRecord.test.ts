// The run record from recorded environments: a pull_request event, a push,
// and a checkout made with the real git.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { inMemoryState, State, StateStoreError } from "alchemy/State";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  outputWithRunRecord,
  RUN_RECORD_KEY,
  renamedStack,
  type RunRecord,
  runRecord,
  withRunRecord,
} from "../../src/run-record/RunRecord.ts";

const PULL_REQUEST_EVENT = fileURLToPath(
  new URL("./fixtures/pull_request_event.json", import.meta.url),
);
/** The head of pull request 19 in the recorded payload. */
const HEAD_SHA = "8af3c5b7932c528939cbc7aa0597b1fc36c8dc83";
const MERGE_SHA = "0f3d5e5a9c1b2d4e6f7a8b9c0d1e2f3a4b5c6d7e";

let dir = "";
/** A checkout with one commit and an origin remote, in its real path. */
let checkout = "";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "alchemy-kit-run-record-")));
  checkout = join(dir, "checkout");
  mkdirSync(join(checkout, "apps", "site"), { recursive: true });
  git(checkout, "init", "--quiet", "--initial-branch=main");
  git(checkout, "config", "user.email", "test@example.com");
  git(checkout, "config", "user.name", "Test");
  git(checkout, "config", "commit.gpgsign", "false");
  writeFileSync(join(checkout, "apps", "site", "alchemy.run.ts"), "export default 1;\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "--quiet", "--message", "stack");
  git(checkout, "remote", "add", "origin", "git@github.com:octo-org/shop.git");
  stubGitHub(200, { id: 4242, owner: { id: 9100 }, full_name: "octo-org/store" });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** The GitHub API answers every request with `status` and `body`. GitHub redirects a renamed repository, so the name in the body can differ. */
const stubGitHub = (status: number, body: unknown) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

/** A checkout with a token, so the GitHub CLI is not asked for one. */
const laptop = { GITHUB_TOKEN: "test-token" };

const actions = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "samebase/tmp-run-record",
  GITHUB_REPOSITORY_ID: "700100200",
  GITHUB_REPOSITORY_OWNER_ID: "9100200",
  GITHUB_REF_NAME: "main",
  GITHUB_SHA: MERGE_SHA,
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_RUN_ID: "12345678901",
  GITHUB_RUN_ATTEMPT: "2",
};

/** The record at 2026-10-21T10:00:00Z of the test clock. */
const at = (cwd: string, env: Record<string, string | undefined>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-10-21T10:00:00Z"));
    return yield* runRecord({ cwd, env });
  }).pipe(Effect.provide(TestClock.layer()), Effect.runPromise);

/** The rendered failure of the derivation, or "" when it succeeds. */
const failureOf = async (cwd: string, env: Record<string, string | undefined>) => {
  const exit = await Effect.runPromiseExit(runRecord({ cwd, env }));
  return Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "";
};

describe("runRecord", () => {
  it("records a pull_request event from the variables and the event payload", async () => {
    const record = await at(join(checkout, "apps", "site"), {
      ...actions,
      GITHUB_REF: "refs/pull/19/merge",
      GITHUB_REF_NAME: "19/merge",
      GITHUB_HEAD_REF: "team-token",
      GITHUB_EVENT_PATH: PULL_REQUEST_EVENT,
    });
    expect(record).toEqual({
      version: 2,
      repositoryId: "700100200",
      repositoryOwnerId: "9100200",
      repositoryName: "samebase/tmp-run-record",
      stackFile: "apps/site/alchemy.run.ts",
      branch: "team-token",
      pullRequest: 19,
      headCommit: HEAD_SHA,
      runUrl: "https://github.com/samebase/tmp-run-record/actions/runs/12345678901/attempts/2",
      source: "github-actions",
      recordedAt: "2026-10-21T10:00:00.000Z",
    } satisfies RunRecord);
  });

  it("records a push event: the pushed branch, GITHUB_SHA, and no pull request", async () => {
    const payload = join(dir, "push.json");
    writeFileSync(payload, JSON.stringify({ ref: "refs/heads/main", after: MERGE_SHA }));
    const record = await at(checkout, {
      ...actions,
      GITHUB_REF: "refs/heads/main",
      GITHUB_HEAD_REF: "",
      GITHUB_EVENT_PATH: payload,
    });
    expect(record).toMatchObject({
      repositoryName: "samebase/tmp-run-record",
      stackFile: "alchemy.run.ts",
      branch: "main",
      pullRequest: null,
      headCommit: MERGE_SHA,
      source: "github-actions",
    });
  });

  it("takes the pull request number from GITHUB_REF when the payload has none", async () => {
    const payload = join(dir, "other.json");
    writeFileSync(payload, JSON.stringify({ ref: "refs/pull/7/merge" }));
    const record = await at(checkout, {
      ...actions,
      GITHUB_REF: "refs/pull/7/merge",
      GITHUB_REF_NAME: "7/merge",
      GITHUB_HEAD_REF: "feature",
      GITHUB_EVENT_PATH: payload,
    });
    expect(record).toMatchObject({ branch: "feature", pullRequest: 7, headCommit: MERGE_SHA });
  });

  it("fails on GitHub Actions without a variable, with an id that is not digits, or off github.com", async () => {
    const { GITHUB_RUN_ID: _unset, ...rest } = actions;
    expect(await failureOf(checkout, rest)).toContain("GITHUB_RUN_ID is not set");
    const { GITHUB_REPOSITORY_ID: _noId, ...noId } = actions;
    expect(await failureOf(checkout, noId)).toContain("GITHUB_REPOSITORY_ID is not set");
    expect(
      await failureOf(checkout, { ...actions, GITHUB_REPOSITORY_OWNER_ID: "octo-org" }),
    ).toContain("GITHUB_REPOSITORY_OWNER_ID is not a GitHub id");
    expect(
      await failureOf(checkout, { ...actions, GITHUB_SERVER_URL: "https://ghe.example.com" }),
    ).toContain("only https://github.com is supported");
    expect(
      await failureOf(checkout, { ...actions, GITHUB_EVENT_PATH: join(dir, "absent") }),
    ).toContain("cannot be read");
  });

  it("records a checkout from git and the current name and ids from the GitHub API", async () => {
    const fetch = stubGitHub(200, { id: 4242, owner: { id: 9100 }, full_name: "octo-org/store" });
    const record = await at(join(checkout, "apps", "site"), laptop);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/octo-org/shop",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-token" }),
      }),
    );
    expect(record).toEqual({
      version: 2,
      repositoryId: "4242",
      repositoryOwnerId: "9100",
      repositoryName: "octo-org/store",
      stackFile: "apps/site/alchemy.run.ts",
      branch: "main",
      pullRequest: null,
      headCommit: git(checkout, "rev-parse", "HEAD"),
      runUrl: null,
      source: "checkout",
      recordedAt: "2026-10-21T10:00:00.000Z",
    } satisfies RunRecord);
  });

  it("reads the https, ssh, and scp forms of a github.com origin URL", async () => {
    const fetch = stubGitHub(200, { id: 4242, owner: { id: 9100 }, full_name: "octo-org/shop" });
    for (const url of [
      "https://github.com/octo-org/shop.git",
      "https://github.com/octo-org/shop",
      "ssh://git@github.com/octo-org/shop.git",
      "git@github.com:octo-org/shop.git",
    ]) {
      git(checkout, "remote", "set-url", "origin", url);
      await at(checkout, laptop);
      expect(fetch).toHaveBeenLastCalledWith(
        "https://api.github.com/repos/octo-org/shop",
        expect.anything(),
      );
    }
  });

  it("fails outside a checkout, without a github.com origin, or on no branch", async () => {
    expect(await failureOf(dir, laptop)).toContain("git remote get-url origin failed");
    git(checkout, "remote", "remove", "origin");
    expect(await failureOf(checkout, laptop)).toContain("git remote get-url origin failed");
    git(checkout, "remote", "add", "origin", "/srv/git/shop.git");
    expect(await failureOf(checkout, laptop)).toContain("is not a github.com URL");
    git(checkout, "remote", "set-url", "origin", "git@gitlab.com:octo-org/shop.git");
    expect(await failureOf(checkout, laptop)).toContain("is not a github.com URL");
    git(checkout, "remote", "set-url", "origin", "git@github.com:octo-org/shop.git");
    git(checkout, "checkout", "--quiet", "--detach");
    expect(await failureOf(checkout, laptop)).toContain("detached HEAD");
  });

  it("fails when the GitHub API does not give the repository, and keeps the token out of the reason", async () => {
    stubGitHub(404, { message: "Not Found" });
    const failure = await failureOf(checkout, laptop);
    expect(failure).toContain("GitHub GET /repos/octo-org/shop answered 404");
    expect(failure).toContain("gh auth login");
    expect(failure).not.toContain("test-token");
  });
});

describe("outputWithRunRecord", () => {
  const record: RunRecord = {
    version: 2,
    repositoryId: "4242",
    repositoryOwnerId: "9100",
    repositoryName: "octo-org/store",
    stackFile: "alchemy.run.ts",
    branch: "main",
    pullRequest: null,
    headCommit: HEAD_SHA,
    runUrl: null,
    source: "checkout",
    recordedAt: "2026-10-21T10:00:00.000Z",
  };

  it("adds the record to an object output and keeps the stack's own keys", () => {
    expect(outputWithRunRecord({ url: "https://app.convex.site" }, record)).toEqual({
      url: "https://app.convex.site",
      [RUN_RECORD_KEY]: record,
    });
  });

  it("keeps a value that the stack put under the key", () => {
    const own = { url: "u", [RUN_RECORD_KEY]: { mine: true } };
    expect(outputWithRunRecord(own, record)).toBe(own);
  });

  it("has no document for an output that is not a plain object", () => {
    expect(outputWithRunRecord("https://app.convex.site", record)).toBeUndefined();
    expect(outputWithRunRecord(["a"], record)).toBeUndefined();
    expect(outputWithRunRecord(null, record)).toBeUndefined();
    // A spread would keep only the enumerable own keys of these.
    expect(outputWithRunRecord(new Date(0), record)).toBeUndefined();
    expect(outputWithRunRecord(Redacted.make("secret"), record)).toBeUndefined();
    expect(outputWithRunRecord(Object.create(null), record)).toEqual({ [RUN_RECORD_KEY]: record });
  });
});

describe("renamedStack", () => {
  const run = { repositoryId: "4242", stackFile: "alchemy.run.ts" };

  it("names the other stack only for a version 2 record of the same id and stack file", () => {
    const records = {
      "same id": { version: 2, repositoryId: "4242", repositoryName: "octo-org/shop" },
      "another id": { version: 2, repositoryId: "5151", repositoryName: "octo-org/store" },
      "version 1": { version: 1, repository: "octo-org/shop", repositoryId: "4242" },
      "no record": undefined,
    };
    const blocking = [];
    for (const [kind, record] of Object.entries(records)) {
      for (const stackFile of ["alchemy.run.ts", "apps/site/alchemy.run.ts"]) {
        const prodOutput =
          record === undefined
            ? { url: "u" }
            : { url: "u", [RUN_RECORD_KEY]: { ...record, stackFile } };
        const found = renamedStack("octo-org/store", run, [{ stack: "octo-org/shop", prodOutput }]);
        if (found !== undefined) blocking.push({ kind, stackFile, found });
      }
    }
    expect(blocking).toEqual([
      { kind: "same id", stackFile: "alchemy.run.ts", found: "octo-org/shop" },
    ]);
  });
});

describe("withRunRecord", () => {
  /**
   * The state of `withRunRecord` over an in-memory state with `stacks` and `outputs`, first used in
   * `cwd` with `env`, by default outside GitHub Actions.
   */
  const open = async (
    cwd: string,
    env: Record<string, string> = {},
    stacks: Parameters<typeof inMemoryState>[0] = {},
    outputs: Parameters<typeof inMemoryState>[1] = {},
  ) => {
    // CI sets GITHUB_ACTIONS.
    vi.stubEnv("GITHUB_ACTIONS", "");
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const before = process.cwd();
    process.chdir(cwd);
    try {
      return await Effect.gen(function* () {
        return yield* yield* State;
      }).pipe(Effect.provide(withRunRecord(inMemoryState(stacks, outputs))), Effect.runPromise);
    } finally {
      process.chdir(before);
      vi.unstubAllEnvs();
    }
  };
  const stage = { stack: "samebase/tmp-run-record/apps/site", stage: "main" };

  it("adds the record of the run to each output, and passes every other call to the state", async () => {
    const fetch = stubGitHub(200, { id: 4242, owner: { id: 9100 }, full_name: "octo-org/store" });
    const state = await open(join(checkout, "apps", "site"), laptop);
    expect(state.id).toBe("inmemory");
    // The GitHub API is asked once, at the first output write.
    expect(fetch).not.toHaveBeenCalled();
    const stored = await Effect.runPromise(state.setOutput({ ...stage, value: { url: "u" } }));
    expect(stored).toEqual({
      url: "u",
      [RUN_RECORD_KEY]: {
        version: 2,
        repositoryId: "4242",
        repositoryOwnerId: "9100",
        repositoryName: "octo-org/store",
        stackFile: "apps/site/alchemy.run.ts",
        branch: "main",
        pullRequest: null,
        headCommit: git(checkout, "rev-parse", "HEAD"),
        runUrl: null,
        source: "checkout",
        recordedAt: expect.stringMatching(/^2\d{3}-\d\d-\d\dT.*Z$/),
      },
    });
    expect(await Effect.runPromise(state.getOutput(stage))).toEqual(stored);
    // An output with no place for the key is stored as it is.
    expect(await Effect.runPromise(state.setOutput({ ...stage, value: "u" }))).toBe("u");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe("after a rename of the repository", () => {
    const renamedRun = {
      ...actions,
      GITHUB_REPOSITORY: "octo-org/store",
      GITHUB_REPOSITORY_ID: "4242",
      GITHUB_REF: "refs/heads/main",
      GITHUB_HEAD_REF: "",
      GITHUB_EVENT_PATH: "",
    };
    const oldProd = () => ({
      "octo-org/shop": {
        prod: {
          url: "u",
          [RUN_RECORD_KEY]: {
            version: 2,
            repositoryId: "4242",
            repositoryName: "octo-org/shop",
            stackFile: "apps/site/alchemy.run.ts",
          },
        },
      },
    });

    it("stops the first deploy of a stack under the new name", async () => {
      const state = await open(
        join(checkout, "apps", "site"),
        renamedRun,
        { "octo-org/shop": { prod: {} } },
        oldProd(),
      );
      const exit = await Effect.runPromiseExit(
        state.list({ stack: "octo-org/store", stage: "prod" }),
      );
      expect(exit).toEqual(
        Exit.fail(
          new StateStoreError({
            message:
              'The stack of this repository for apps/site/alchemy.run.ts is "octo-org/shop". This run would start a new stack "octo-org/store": write "octo-org/shop" as the stack name in apps/site/alchemy.run.ts.',
          }),
        ),
      );
    });

    it("passes a stack that has a stage, and a run without a record", async () => {
      const withStage = await open(
        join(checkout, "apps", "site"),
        renamedRun,
        { "octo-org/shop": { prod: {} }, "octo-org/store": { prod: {} } },
        oldProd(),
      );
      expect(
        await Effect.runPromise(withStage.list({ stack: "octo-org/store", stage: "pr-1" })),
      ).toEqual([]);
      const { GITHUB_REPOSITORY_ID: _unset, ...withoutId } = renamedRun;
      const noId = await open(
        join(checkout, "apps", "site"),
        withoutId,
        { "octo-org/shop": { prod: {} } },
        oldProd(),
      );
      expect(
        await Effect.runPromise(noId.list({ stack: "octo-org/store", stage: "prod" })),
      ).toEqual([]);
    });
  });

  it("writes the outputs without a record when the checkout gives none", async () => {
    const state = await open(dir);
    expect(await Effect.runPromise(state.setOutput({ ...stage, value: { url: "u" } }))).toEqual({
      url: "u",
    });
  });
});
