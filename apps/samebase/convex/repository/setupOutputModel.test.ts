import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";

import {
  observedSetupOutput,
  observedSetupOutputArchiveBase64,
  observedSetupOutputArtifactPage,
  observedSetupOutputRepository,
  observedSetupWorkflowRunPage,
  observedSpikeArchiveBase64,
  observedSpikeArtifact,
} from "./fixtures/observedSetupOutput";
import {
  isNewerSetupOutput,
  orderSetupOutputArtifacts,
  parseSetupOutput,
  readSetupOutputArchive,
  readSetupOutputSource,
  selectSetupRuns,
  SETUP_OUTPUT_MAX_BYTES,
  zGitHubArtifactPage,
  zGitHubWorkflowRunPage,
} from "./setupOutputModel";

/*
State axes of the reader, each tested below:
- run: kept or filtered out by workflow path, event, branch, repository, or fork; order by start
  time, which a rerun moves
- artifact: newest of a successful setup run, or skipped for its name, expiry, a run that did not
  succeed or is not a setup run, or provenance that differs from the run; order by the artifact's
  creation time
- applied checkpoint: none, the same artifact, or a newer one, which an older output never replaces
- archive: exactly the one JSON file, or more files, another name, a corrupt or oversized archive,
  or a file that is not one JSON document
- output: version 1 deployed or destroyed, with one or several entries per list; any other
  version, section, kind of resource, or field fails closed
*/

const runs = zGitHubWorkflowRunPage.parse(observedSetupWorkflowRunPage).workflow_runs;
const artifacts = zGitHubArtifactPage.parse(observedSetupOutputArtifactPage).artifacts;
const newestRun = runs.at(0);
const firstRun = runs.at(2);
const observedArtifact = artifacts.at(0);
const observedOrigin = observedArtifact?.workflow_run;
if (!newestRun || !firstRun || !observedArtifact || !observedOrigin) {
  throw new Error("The recorded pages hold three runs and one artifact of a run.");
}
const archiveOf = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

describe("selectSetupRuns", () => {
  it("keeps the template's workflow runs on the default branch, newest start first", () => {
    expect(selectSetupRuns(runs, observedSetupOutputRepository).map((run) => run.id)).toEqual([
      37545425944, 37531835607, 37528068073,
    ]);
  });

  it("drops runs of another workflow, event, branch, repository, or a fork", () => {
    const filtered = [
      { ...newestRun, id: 1, path: ".github/workflows/ci.yml" },
      { ...newestRun, id: 2, event: "pull_request" },
      { ...newestRun, id: 3, head_branch: "feature" },
      { ...newestRun, id: 4, repository: { id: 1 } },
      { ...newestRun, id: 5, head_repository: { id: 1 } },
    ];
    expect(selectSetupRuns(filtered, observedSetupOutputRepository)).toEqual([]);
  });

  it("orders a rerun of an older run by its new start time", () => {
    const rerunOfFirst = { ...firstRun, run_attempt: 2, run_started_at: "2026-10-07T08:00:00Z" };
    expect(
      selectSetupRuns([newestRun, rerunOfFirst], observedSetupOutputRepository).map(
        (run) => run.id,
      ),
    ).toEqual([37528068073, 37545425944]);
  });
});

describe("orderSetupOutputArtifacts and readSetupOutputSource", () => {
  const source = (artifact: typeof observedArtifact, run: typeof newestRun) =>
    readSetupOutputSource({ artifact, run, repository: observedSetupOutputRepository });

  it("reads the recorded artifact of the recorded run with its attempt and creation time", () => {
    expect(orderSetupOutputArtifacts(artifacts)).toEqual([
      { artifact: observedArtifact, runId: 37545425944 },
    ]);
    expect(source(observedArtifact, newestRun)).toEqual({
      runId: 37545425944,
      runAttempt: 2,
      artifactId: 11450791196,
      artifactCreatedAt: "2026-10-06T23:17:16Z",
    });
  });

  it("drops another name, an expired artifact, and an artifact without a run", () => {
    const spike = zGitHubArtifactPage.parse({
      total_count: 1,
      artifacts: [observedSpikeArtifact],
    }).artifacts;
    expect(
      orderSetupOutputArtifacts([
        ...spike,
        { ...observedArtifact, expired: true },
        { ...observedArtifact, workflow_run: null },
      ]),
    ).toEqual([]);
  });

  it("refuses a run that did not succeed, is not a setup run, or differs from the artifact", () => {
    expect(source(observedArtifact, { ...newestRun, conclusion: null })).toBeNull();
    expect(source(observedArtifact, { ...newestRun, conclusion: "failure" })).toBeNull();
    expect(source(observedArtifact, { ...newestRun, head_branch: "feature" })).toBeNull();
    expect(
      source(
        { ...observedArtifact, workflow_run: { ...observedOrigin, head_sha: "0".repeat(40) } },
        newestRun,
      ),
    ).toBeNull();
    expect(
      source(
        { ...observedArtifact, workflow_run: { ...observedOrigin, repository_id: 1 } },
        newestRun,
      ),
    ).toBeNull();
    expect(source(observedArtifact, firstRun)).toBeNull();
  });

  it("orders by the artifact's creation time, which a rerun of an older run makes newest", () => {
    const fromFirstRun = {
      ...observedArtifact,
      id: 11450791000,
      created_at: "2026-10-07T08:01:00Z",
      workflow_run: { ...observedOrigin, id: firstRun.id, head_sha: firstRun.head_sha },
    };
    expect(
      orderSetupOutputArtifacts([observedArtifact, fromFirstRun]).map(({ runId }) => runId),
    ).toEqual([firstRun.id, newestRun.id]);
  });
});

describe("isNewerSetupOutput", () => {
  const applied = { artifactId: 11450791196, artifactCreatedAt: "2026-10-06T23:17:16Z" };
  const source = {
    runId: 1,
    runAttempt: 1,
    artifactId: 11450791196,
    artifactCreatedAt: "2026-10-06T23:17:16Z",
  };

  it("applies the first output and outputs published after the applied one", () => {
    expect(isNewerSetupOutput(source, null)).toBe(true);
    expect(
      isNewerSetupOutput(
        { ...source, artifactId: 2, artifactCreatedAt: "2026-10-07T08:00:00Z" },
        applied,
      ),
    ).toBe(true);
    expect(isNewerSetupOutput({ ...source, artifactId: 11450791197 }, applied)).toBe(true);
  });

  it("never applies the applied output again or an older one, such as during a rerun", () => {
    expect(isNewerSetupOutput(source, applied)).toBe(false);
    expect(
      isNewerSetupOutput(
        { ...source, artifactId: 11443958659, artifactCreatedAt: "2026-10-06T21:10:47Z" },
        applied,
      ),
    ).toBe(false);
  });
});

describe("readSetupOutputArchive", () => {
  it("reads the recorded artifact", () => {
    expect(readSetupOutputArchive(Buffer.from(observedSetupOutputArchiveBase64, "base64"))).toEqual(
      { ok: true, output: observedSetupOutput },
    );
  });

  it("refuses the spike artifact, whose file is not one JSON document", () => {
    expect(readSetupOutputArchive(Buffer.from(observedSpikeArchiveBase64, "base64"))).toEqual({
      ok: false,
      reason:
        "The artifact must hold exactly samebase-setup-output.json; it holds alchemy-output.json.",
    });
    const logLinesFirst = archiveOf({
      "samebase-setup-output.json": `• Refreshing Cloudflare State Store credentials\n${JSON.stringify(observedSetupOutput)}`,
    });
    expect(readSetupOutputArchive(logLinesFirst)).toEqual({
      ok: false,
      reason: "samebase-setup-output.json is not one JSON document.",
    });
  });

  it("refuses more files, a corrupt archive, and an oversized file", () => {
    const json = JSON.stringify(observedSetupOutput);
    expect(
      readSetupOutputArchive(archiveOf({ "samebase-setup-output.json": json, "extra.txt": "x" })),
    ).toMatchObject({ ok: false });
    expect(readSetupOutputArchive(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
    expect(
      readSetupOutputArchive(
        archiveOf({ "samebase-setup-output.json": " ".repeat(SETUP_OUTPUT_MAX_BYTES + 1) }),
      ),
    ).toEqual({
      ok: false,
      reason: `samebase-setup-output.json is larger than ${SETUP_OUTPUT_MAX_BYTES} bytes.`,
    });
  });
});

describe("parseSetupOutput", () => {
  it("reads the destroy receipt and several entries per list", () => {
    expect(parseSetupOutput({ version: 1, state: "destroyed" })).toEqual({
      ok: true,
      output: { version: 1, state: "destroyed" },
    });
    // The Workers, roots, and code locations of the shared-convex-monorepo-fixture in
    // src/repository/dashboard/RepositoryOverviewDialogsVisualFixture.tsx.
    const monorepo = {
      ...observedSetupOutput,
      cloudflare: {
        ...observedSetupOutput.cloudflare,
        workers: [
          {
            tag: "admin-worker-tag",
            name: "shared-convex-monorepo-fixture-admin",
            rootDirectory: "apps/admin",
          },
          {
            tag: "portal-worker-tag",
            name: "shared-convex-monorepo-fixture-portal",
            rootDirectory: "apps/portal",
          },
          {
            tag: "web-worker-tag",
            name: "shared-convex-monorepo-fixture-web",
            rootDirectory: "apps/web",
          },
        ],
      },
      convex: {
        teamId: "38516",
        projects: [
          { projectId: "1001", convexConfigPath: "apps/portal/convex.json" },
          { projectId: "1002", convexDirectoryPath: "packages/backend/convex" },
        ],
      },
    };
    expect(parseSetupOutput(monorepo)).toEqual({ ok: true, output: monorepo });
  });

  it("refuses another version, section, kind of resource, or field", () => {
    expect(parseSetupOutput({ ...observedSetupOutput, version: 2 })).toEqual({
      ok: false,
      reason:
        "The setup output has version 2, which Samebase cannot read. Samebase reads version 1.",
    });
    for (const output of [
      { ...observedSetupOutput, email: { zones: ["example.com"] } },
      { ...observedSetupOutput, cloudflare: { ...observedSetupOutput.cloudflare, buckets: [] } },
      {
        ...observedSetupOutput,
        convex: { ...observedSetupOutput.convex, region: "aws-us-east-1" },
      },
      { version: 1, state: "destroyed", reason: "manual" },
      { version: 1, state: "paused" },
      [],
    ]) {
      expect(parseSetupOutput(output)).toMatchObject({ ok: false });
    }
  });

  it("refuses numeric ids, empty lists, both code locations, and duplicates", () => {
    for (const output of [
      { ...observedSetupOutput, convex: { ...observedSetupOutput.convex, teamId: 38516 } },
      { ...observedSetupOutput, cloudflare: { ...observedSetupOutput.cloudflare, workers: [] } },
      {
        ...observedSetupOutput,
        convex: {
          ...observedSetupOutput.convex,
          projects: [
            {
              projectId: "3161449",
              convexConfigPath: "convex.json",
              convexDirectoryPath: "convex",
            },
          ],
        },
      },
    ]) {
      expect(parseSetupOutput(output)).toMatchObject({ ok: false });
    }
    const [worker] = observedSetupOutput.cloudflare.workers;
    expect(
      parseSetupOutput({
        ...observedSetupOutput,
        cloudflare: {
          ...observedSetupOutput.cloudflare,
          workers: [worker, { ...worker, name: "other" }],
        },
      }),
    ).toEqual({
      ok: false,
      reason: "The setup output lists 882b2b3cde394f5d8661075e716eaf58 more than once.",
    });
  });
});
