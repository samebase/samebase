import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";

import {
  derivedFailedSetupOutputArchive,
  derivedFailedSetupRun,
  observedDestroyArtifactPage,
  observedDestroyReceiptArchiveBase64,
  observedDestroyRepository,
  observedDestroyRun,
  observedSetupOutput,
  observedSetupOutputArchiveBase64,
  observedSetupOutputArtifactPage,
  observedSetupOutputRepository,
  observedSetupWorkflowRunPage,
  observedSpikeArchiveBase64,
  observedSpikeArtifact,
} from "./fixtures/observedSetupOutput";
import {
  decideFirstSetupOutputApply,
  isNewerSetupOutput,
  namesOnlyAttachedSetupStack,
  orderSetupOutputArtifacts,
  parseSetupOutput,
  readSetupOutputArchive,
  readSetupOutputSource,
  SETUP_OUTPUT_MAX_BYTES,
  zGitHubArtifactPage,
  zGitHubWorkflowRun,
} from "./setupOutputModel";

/*
State axes of the reader, each tested below:
- artifact: the newest by its creation time, or skipped for its name, expiry, or a missing run
- run: of any workflow, completed with success or failure on the live default branch of this
  repository; refused when it has not finished, was cancelled, is on another branch, comes from a
  fork, or differs from the artifact's run and commit
- applied checkpoint: none, the same artifact, or a newer one, which an older output never replaces
- archive: exactly the one JSON file, or more files, another name, a corrupt or oversized archive,
  or a file that is not one JSON document
- output: version 1 deployed, destroyed, or failed, with one or several entries per list; any other
  version, state, section, kind of resource, or field fails closed
*/

const runs = observedSetupWorkflowRunPage.workflow_runs.map((run) => zGitHubWorkflowRun.parse(run));
const newestRun = runs.at(0);
const firstRun = runs.at(2);
const artifacts = zGitHubArtifactPage.parse(observedSetupOutputArtifactPage).artifacts;
const observedArtifact = artifacts.at(0);
const observedOrigin = observedArtifact?.workflow_run;
if (!newestRun || !firstRun || !observedArtifact || !observedOrigin) {
  throw new Error("The recorded pages hold three runs and one artifact of a run.");
}
const destroyRun = zGitHubWorkflowRun.parse(observedDestroyRun);
const destroyReceipt = zGitHubArtifactPage.parse(observedDestroyArtifactPage).artifacts.at(0);
if (!destroyReceipt) {
  throw new Error("The recorded destroy page lists the receipt first.");
}
const archiveOf = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));

describe("orderSetupOutputArtifacts and readSetupOutputSource", () => {
  const read = (artifact: typeof observedArtifact, run: typeof newestRun) =>
    readSetupOutputSource({ artifact, run, repository: observedSetupOutputRepository });

  it("reads the recorded artifact of the recorded run with its attempt and creation time", () => {
    expect(orderSetupOutputArtifacts(artifacts)).toEqual([
      { artifact: observedArtifact, runId: 37545425944 },
    ]);
    expect(read(observedArtifact, newestRun)).toEqual({
      source: {
        runId: 37545425944,
        runAttempt: 2,
        artifactId: 11450791196,
        artifactCreatedAt: "2026-10-06T23:17:16Z",
      },
      run: {
        runId: 37545425944,
        runAttempt: 2,
        conclusion: "success",
        startedAt: "2026-10-06T23:15:54Z",
        url: "https://github.com/samebase/tmp-alchemy-v2/actions/runs/37545425944",
      },
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

  it("reads the recorded destroy receipt of a run of another workflow", () => {
    expect(
      readSetupOutputSource({
        artifact: destroyReceipt,
        run: destroyRun,
        repository: observedDestroyRepository,
      }),
    ).toMatchObject({
      source: {
        runId: 37612780148,
        runAttempt: 1,
        artifactId: 11479280115,
        artifactCreatedAt: "2026-10-07T11:16:41Z",
      },
      run: { runId: 37612780148, conclusion: "success" },
    });
    expect(
      readSetupOutputArchive(Buffer.from(observedDestroyReceiptArchiveBase64, "base64")),
    ).toEqual({ ok: true, output: { version: 1, state: "destroyed" } });
  });

  it("reads the failed output of a failed run", () => {
    expect(read(observedArtifact, zGitHubWorkflowRun.parse(derivedFailedSetupRun))).toMatchObject({
      run: { runId: 37545425944, conclusion: "failure" },
    });
    expect(readSetupOutputArchive(derivedFailedSetupOutputArchive)).toEqual({
      ok: true,
      output: { version: 1, state: "failed" },
    });
  });

  it("refuses a run that has not finished, was cancelled, or is off the default branch", () => {
    expect(read(observedArtifact, { ...newestRun, status: "in_progress", conclusion: null })).toBe(
      null,
    );
    expect(read(observedArtifact, { ...newestRun, conclusion: "cancelled" })).toBeNull();
    expect(read(observedArtifact, { ...newestRun, head_branch: "feature" })).toBeNull();
    expect(read(observedArtifact, { ...newestRun, repository: { id: 1 } })).toBeNull();
  });

  it("refuses a run from a fork or a run that differs from the artifact", () => {
    expect(read(observedArtifact, { ...newestRun, head_repository: { id: 1 } })).toBeNull();
    expect(
      read(
        { ...observedArtifact, workflow_run: { ...observedOrigin, head_sha: "0".repeat(40) } },
        newestRun,
      ),
    ).toBeNull();
    expect(
      read(
        { ...observedArtifact, workflow_run: { ...observedOrigin, repository_id: 1 } },
        newestRun,
      ),
    ).toBeNull();
    expect(read(observedArtifact, firstRun)).toBeNull();
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
  it("reads the destroy receipt, the failed output, and several entries per list", () => {
    expect(parseSetupOutput({ version: 1, state: "destroyed" })).toEqual({
      ok: true,
      output: { version: 1, state: "destroyed" },
    });
    expect(parseSetupOutput({ version: 1, state: "failed" })).toEqual({
      ok: true,
      output: { version: 1, state: "failed" },
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
      { version: 1, state: "failed", runId: 1 },
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

/*
State axes of the first-apply rule, each tested below:
- count: one Worker and one Convex project, or fewer or more of either
- names: each the name reserved at creation, or another one; the project name unique in the team or
  shared with another project
- times: each resource created at or after the app, or before it
*/
describe("decideFirstSetupOutputApply", () => {
  const appCreatedAt = Date.parse("2026-10-06T20:00:00Z");
  const reservedNames = { workerName: "tmp-alchemy-v2", convexProjectName: "tmp-alchemy-v2" };
  const worker = { workerName: "tmp-alchemy-v2", createdAt: appCreatedAt + 60_000 };
  const project = {
    projectName: "tmp-alchemy-v2",
    createdAt: appCreatedAt + 30_000,
    nameIsUniqueInTeam: true,
  };
  const decide = (overrides: {
    workers?: ReadonlyArray<{ workerName: string; createdAt: number }>;
    projects?: ReadonlyArray<{
      projectName: string;
      createdAt: number;
      nameIsUniqueInTeam: boolean;
    }>;
  }) =>
    decideFirstSetupOutputApply({
      reservedNames,
      appCreatedAt,
      workers: overrides.workers ?? [worker],
      projects: overrides.projects ?? [project],
    });

  it("applies the reserved Worker and project when both were created after the app", () => {
    expect(decide({})).toEqual({ automatic: true });
    expect(
      decide({
        workers: [{ ...worker, createdAt: appCreatedAt }],
        projects: [{ ...project, createdAt: appCreatedAt }],
      }),
    ).toEqual({ automatic: true });
  });

  it("waits for a member when the output lists other than one of each", () => {
    for (const lists of [
      { workers: [], projects: [project] },
      { workers: [worker], projects: [] },
      { workers: [worker, { ...worker, workerName: "tmp-alchemy-v2-admin" }], projects: [project] },
      { workers: [worker], projects: [project, { ...project, projectName: "tmp-alchemy-v2-b" }] },
    ]) {
      expect(decide(lists)).toEqual({
        automatic: false,
        reason: `The setup output lists ${lists.workers.length} Workers and ${lists.projects.length} Convex projects; Samebase reserved one of each when it created the app.`,
      });
    }
  });

  it("waits for a member when a name is not the reserved one or the project name is shared", () => {
    expect(decide({ workers: [{ ...worker, workerName: "other-worker" }] })).toEqual({
      automatic: false,
      reason:
        "The Worker is named other-worker, not tmp-alchemy-v2, the name Samebase reserved when it created the app.",
    });
    expect(decide({ projects: [{ ...project, projectName: "other-project" }] })).toEqual({
      automatic: false,
      reason:
        "The Convex project is named other-project, not tmp-alchemy-v2, the name Samebase reserved when it created the app.",
    });
    expect(decide({ projects: [{ ...project, nameIsUniqueInTeam: false }] })).toEqual({
      automatic: false,
      reason: "Another Convex project of the team is also named tmp-alchemy-v2.",
    });
  });

  it("waits for a member when a resource is older than the app", () => {
    expect(decide({ workers: [{ ...worker, createdAt: appCreatedAt - 1 }] })).toEqual({
      automatic: false,
      reason: "The Worker tmp-alchemy-v2 existed before Samebase created the app.",
    });
    expect(decide({ projects: [{ ...project, createdAt: appCreatedAt - 1 }] })).toEqual({
      automatic: false,
      reason: "The Convex project tmp-alchemy-v2 existed before Samebase created the app.",
    });
  });
});

/*
State axes of the identity comparison: the output lists the same, more, or fewer resources than the
attached setup_stack rows, per provider; a row with the same identity but another origin does not
count, because applying the output would take it over.
*/
describe("namesOnlyAttachedSetupStack", () => {
  const attachedWorkers = [
    { workerTag: "tag-app", origin: "setup_stack" as const },
    { workerTag: "tag-admin", origin: "setup_stack" as const },
  ];
  const attachedProjects = [{ projectId: "3161449", origin: "setup_stack" as const }];

  it("finds nothing to apply when the output lists exactly the attached setup_stack rows", () => {
    expect(
      namesOnlyAttachedSetupStack({
        workerTags: ["tag-admin", "tag-app"],
        projectIds: ["3161449"],
        attachedWorkers,
        attachedProjects,
      }),
    ).toBe(true);
  });

  it("finds something to apply for a new, a dropped, or a hand-attached resource", () => {
    for (const lists of [
      { workerTags: ["tag-admin", "tag-app", "tag-docs"], projectIds: ["3161449"] },
      { workerTags: ["tag-app"], projectIds: ["3161449"] },
      { workerTags: ["tag-admin", "tag-app"], projectIds: ["3161449", "3161450"] },
      { workerTags: ["tag-admin", "tag-app"], projectIds: [] },
    ]) {
      expect(namesOnlyAttachedSetupStack({ ...lists, attachedWorkers, attachedProjects })).toBe(
        false,
      );
    }
    expect(
      namesOnlyAttachedSetupStack({
        workerTags: ["tag-admin", "tag-app"],
        projectIds: ["3161449"],
        attachedWorkers,
        attachedProjects: [{ projectId: "3161449", origin: "selected_existing" }],
      }),
    ).toBe(false);
  });
});
