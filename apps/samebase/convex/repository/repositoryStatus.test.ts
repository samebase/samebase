import { describe, expect, it } from "vite-plus/test";

import type { AlchemyStack, AlchemyStateObservation } from "../../shared/alchemyStateModel";
import type { Id } from "../_generated/dataModel";
import type { RepositoryStatus } from "./contracts/getRepositoryStatus";
import { observedBaseAlchemyRepositoryReply } from "./fixtures/observedAlchemyState";
import type { RepositoryPullRequest, RepositoryStatusCheckRollup } from "./pullRequestModel";
import {
  buildRepositoryAttention,
  buildRepositorySetupStackStatus,
  buildRepositoryStacksStatus,
  projectRepositoryStatusForMcp,
  type RepositoryObservations,
  type RepositoryStatusRepository,
} from "./repositoryStatus";

const headCommitOid = "3f9c2b7e1a4d8c6f0b5e9a2d7c1f4b8e6a3d9c2f";

const repository: RepositoryStatusRepository = {
  githubRepositoryFullName: "samebase/chess-merge",
  providerSetup: { status: "ready" },
  providerPlan: null,
};

/** A rollup as GitHub returns it: aggregate counts of every check, and the first 100 nodes. */
function checkRollup(
  checks: Array<{ name: string; conclusion: "SUCCESS" | "FAILURE" | "UNKNOWN" | null }>,
): RepositoryStatusCheckRollup {
  const countsByState = new Map<"SUCCESS" | "FAILURE" | "UNKNOWN" | "IN_PROGRESS", number>();
  for (const check of checks) {
    const state = check.conclusion ?? "IN_PROGRESS";
    countsByState.set(state, (countsByState.get(state) ?? 0) + 1);
  }
  return {
    contexts: {
      totalCount: checks.length,
      checkRunCount: checks.length,
      statusContextCount: 0,
      checkRunCountsByState: [...countsByState].map(([state, count]) => ({ state, count })),
      statusContextCountsByState: [],
      nodes: checks.slice(0, 100).map((check) => ({
        kind: "check_run" as const,
        name: check.name,
        status: check.conclusion === null ? ("IN_PROGRESS" as const) : ("COMPLETED" as const),
        conclusion: check.conclusion,
        detailsUrl: `https://github.com/samebase/chess-merge/actions/runs/18234567890/job/51928374650`,
        title: null,
      })),
    },
  };
}

function pullRequest(args: {
  number: number;
  title: string;
  headRefName: string;
  checks: RepositoryStatusCheckRollup;
}): RepositoryPullRequest {
  return {
    id: `PR_kwDOOx7Rc86hY2${args.number}`,
    number: args.number,
    title: args.title,
    url: `https://github.com/samebase/chess-merge/pull/${args.number}`,
    isDraft: false,
    isCrossRepository: false,
    additions: 184,
    deletions: 37,
    changedFiles: 9,
    updatedAt: "2026-10-03T08:41:12Z",
    baseRefName: "main",
    headRefName: args.headRefName,
    headRefOid: headCommitOid,
    headRepository: {
      id: "R_kgDOOx7Rcw",
      nameWithOwner: "samebase/chess-merge",
      owner: { login: "samebase" },
    },
    labels: { nodes: [{ name: "enhancement", color: "a2eeef" }] },
    statusCheckRollup: args.checks,
  };
}

const pullRequests = [
  pullRequest({
    number: 42,
    title: "Add an undo button to the move history",
    headRefName: "undo-move-history",
    checks: checkRollup([
      { name: "lint", conclusion: "SUCCESS" },
      { name: "test", conclusion: "FAILURE" },
      { name: "Workers Builds: chess-merge", conclusion: "SUCCESS" },
    ]),
  }),
  pullRequest({
    number: 41,
    title: "Animate merged pieces on small screens",
    headRefName: "merge-animation-mobile",
    checks: checkRollup([
      { name: "lint", conclusion: "SUCCESS" },
      { name: "test", conclusion: "SUCCESS" },
      { name: "Workers Builds: chess-merge", conclusion: null },
    ]),
  }),
];

const defaultBranch = {
  name: "main",
  headCommitOid,
  headCommitTitle: "Fix the merge animation on small screens",
  headCommitCommittedAt: "2026-10-02T17:20:44Z",
  headCommitUrl: `https://github.com/samebase/chess-merge/commit/${headCommitOid}`,
  statusCheckRollup: checkRollup([
    { name: "lint", conclusion: "SUCCESS" },
    { name: "test", conclusion: "SUCCESS" },
    { name: "Workers Builds: chess-merge", conclusion: "SUCCESS" },
  ]),
};
const githubRepository = {
  id: "R_kgDOOx7Rcw",
  databaseId: 1029384756,
  nameWithOwner: "samebase/chess-merge",
  defaultBranch,
  pullRequests: {
    totalCount: 2,
    pageInfo: {
      hasNextPage: false,
      endCursor: "Y3Vyc29yOnYyOpK5MjAyNi0xMC0wM1QwODo0MToxMiswMzowMM6hY2Mq",
    },
    nodes: pullRequests,
  },
};

/** The captured stack of samebase/base-alchemy in the shape that a store read gives. */
const [capturedStack] = observedBaseAlchemyRepositoryReply.stacks;
const [capturedStage] = capturedStack.stages;
const capturedRecord = {
  ...capturedStage.record,
  version: 1,
  source: "github-actions",
} satisfies AlchemyStack["stages"][number]["record"];
/** The captured Deployment row with `rootDir`, which the row of a store from 0.7.0 lacks. */
const capturedResources = capturedStage.resources.map((resource) => ({
  ...resource,
  value: resource.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
}));
const stack: AlchemyStack = {
  name: capturedStack.name,
  stages: [{ ...capturedStage, record: capturedRecord, resources: capturedResources }],
};
const deployedCommit = capturedStage.deployedHeadCommit;
const productionUrl = "https://ideal-dolphin-15.convex.site";
const availableStack = {
  name: "samebase/base-alchemy",
  productionUrl,
  deployedCommit,
  deployedCommitState: "matches_head" as const,
  previews: [],
};

function foundStore(
  stacks: AlchemyStack[],
  liveDeployments: Extract<AlchemyStateObservation, { store: "found" }>["liveDeployments"] = [],
): AlchemyStateObservation {
  return { store: "found", stacks, liveDeployments };
}

const healthyObservations: RepositoryObservations = {
  pullRequests: { state: "available", page: { repository: githubRepository } },
  stacks: { state: "available", stacks: [availableStack] },
  setupStack: null,
};

describe("buildRepositoryStacksStatus", () => {
  it("gives each stack its production URL, deployed commit, and preview URLs", () => {
    const preview = {
      ...stack.stages[0],
      name: "pr-42",
      deployedHeadCommit: headCommitOid,
      record: { ...capturedRecord, branch: "undo", pullRequest: 42, headCommit: headCommitOid },
    };
    const reader = {
      ...preview,
      name: "pr-7",
      deployedHeadCommit: null,
    };
    expect(
      buildRepositoryStacksStatus({
        read: foundStore([{ ...stack, stages: [preview, stack.stages[0], reader] }]),
        headCommit: deployedCommit,
      }),
    ).toEqual({
      state: "available",
      stacks: [
        {
          ...availableStack,
          previews: [
            { pullRequestNumber: 7, url: productionUrl, deployedCommit: null },
            { pullRequestNumber: 42, url: productionUrl, deployedCommit: headCommitOid },
          ],
        },
      ],
    });
  });

  it("gives the address that the overview shows, such as a custom domain", () => {
    expect(
      buildRepositoryStacksStatus({
        read: foundStore(
          [stack],
          [
            {
              deploymentName: "ideal-dolphin-15",
              dashboardUrl: null,
              region: null,
              customDomains: [{ domain: "chessmerge.com", requestDestination: "convexSite" }],
            },
          ],
        ),
        headCommit: null,
      }),
    ).toMatchObject({
      state: "available",
      stacks: [{ productionUrl: "https://chessmerge.com", deployedCommitState: "unknown" }],
    });
  });

  it("compares the deployed commit with the default branch head", () => {
    expect(
      buildRepositoryStacksStatus({ read: foundStore([stack]), headCommit: headCommitOid }),
    ).toMatchObject({ stacks: [{ deployedCommit, deployedCommitState: "behind_head" }] });
  });

  it("reports a stack without a production deploy", () => {
    const previewOnly = { ...stack.stages[0], name: "pr-3" };
    expect(
      buildRepositoryStacksStatus({
        read: foundStore([{ ...stack, stages: [previewOnly] }]),
        headCommit: headCommitOid,
      }),
    ).toMatchObject({
      stacks: [{ productionUrl: null, deployedCommit: null, deployedCommitState: "unknown" }],
    });
  });

  it.each([
    ["the store is unreadable", null, { state: "unreadable" }],
    ["the team has no store", { store: "missing" }, { state: "no_store" }],
    [
      "there is no Convex connection",
      { store: "no_connection" },
      { state: "no_convex_connection" },
    ],
    ["the store holds no stack", foundStore([]), { state: "available", stacks: [] }],
  ] as const)("says so when %s", (_name, read, expected) => {
    expect(buildRepositoryStacksStatus({ read, headCommit: headCommitOid })).toEqual(expected);
  });

  it("returns no resource row, output, or secret of the stage", () => {
    const secret = "convex-deploy-key-value";
    const withSecret: AlchemyStack = {
      ...stack,
      stages: [
        {
          ...stack.stages[0],
          output: JSON.stringify({ url: productionUrl, secret }),
          resources: [
            ...stack.stages[0].resources,
            { fqn: "Key", value: JSON.stringify({ attr: { deployKey: secret } }) },
          ],
        },
      ],
    };
    const serialized = JSON.stringify(
      buildRepositoryStacksStatus({ read: foundStore([withSecret]), headCommit: null }),
    );

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("resourceType");
  });
});

describe("buildRepositorySetupStackStatus", () => {
  const repositoryName = "samebase/base-alchemy";

  it("reports the first deployment from the same read", () => {
    expect(
      buildRepositorySetupStackStatus({ read: foundStore([stack]), repository: repositoryName }),
    ).toEqual({ state: "done" });
    expect(
      buildRepositorySetupStackStatus({ read: foundStore([]), repository: repositoryName }),
    ).toEqual({ state: "in_progress" });
    // A team's first run creates the store.
    expect(
      buildRepositorySetupStackStatus({ read: { store: "missing" }, repository: repositoryName }),
    ).toEqual({ state: "in_progress" });
  });

  it("is unavailable when the store cannot be read", () => {
    expect(buildRepositorySetupStackStatus({ read: null, repository: repositoryName })).toEqual({
      state: "unavailable",
    });
    expect(
      buildRepositorySetupStackStatus({
        read: { store: "no_connection" },
        repository: repositoryName,
      }),
    ).toEqual({ state: "unavailable" });
  });
});

describe("buildRepositoryAttention", () => {
  it("reports nothing for a repository with a stack", () => {
    expect(buildRepositoryAttention({ repository, observations: healthyObservations })).toEqual([]);
  });

  describe("what the store leaves open", () => {
    const attention = (stacks: RepositoryObservations["stacks"]) =>
      buildRepositoryAttention({
        repository,
        observations: { ...healthyObservations, stacks },
      });

    it("says that an empty store is no sign of a deleted app", () => {
      expect(attention({ state: "available", stacks: [] })).toEqual([
        {
          tool: null,
          problem:
            "The team's Alchemy state store holds no stack for samebase/chess-merge, so Samebase cannot see what is deployed. An app deployed another way keeps running. Move it to Alchemy to see it here: https://samebase.com/docs/the-big-migration",
        },
      ]);
    });

    it("says that the team has no store yet", () => {
      expect(attention({ state: "no_store" })).toEqual([
        {
          tool: null,
          problem:
            "The Convex team of samebase/chess-merge has no Alchemy state store yet, so Samebase cannot see what is deployed. The first Alchemy deploy creates it: https://samebase.com/docs/the-big-migration",
        },
      ]);
    });

    it("says that there is no Convex connection", () => {
      expect(attention({ state: "no_convex_connection" })).toEqual([
        {
          tool: null,
          problem:
            "Samebase has no Convex connection for samebase/chess-merge, so it cannot read the team's Alchemy state store. Connect Convex in the organization's providers page in the dashboard.",
        },
      ]);
    });

    it("never reads an unreadable store as nothing deployed", () => {
      expect(attention({ state: "unreadable" })).toEqual([
        {
          tool: null,
          problem:
            "The team's Alchemy state store could not be read, so this status does not say what samebase/chess-merge has deployed. Call repository_getStatus again.",
        },
      ]);
    });
  });

  describe("reads the provider setup state before anything else", () => {
    // @ts-expect-error Run IDs are strings at runtime; the rules ignore them.
    const runId: Id<"workflow_repositoryProvisioning_runs"> = "run-1";
    const providerSetups: Record<
      RepositoryStatusRepository["providerSetup"]["status"],
      RepositoryStatusRepository["providerSetup"]
    > = {
      not_applicable: { status: "not_applicable" },
      running: {
        status: "running",
        provider: "cloudflare",
        runId,
        step: "configure_workers_builds_for_github",
        updatedAt: 1,
      },
      failed: {
        status: "failed",
        provider: "cloudflare",
        runId,
        step: "configure_workers_builds_for_github",
        message: "private provider diagnostic",
        updatedAt: 1,
      },
      ready: { status: "ready" },
    };
    const noStackObservations: RepositoryObservations = {
      ...healthyObservations,
      stacks: { state: "available", stacks: [] },
    };
    const runningItem = {
      tool: null,
      problem:
        "Samebase setup of the Cloudflare Worker is running. Call repository_getStatus again when repository_list shows provider setup ready or failed.",
    };
    const retryItem = {
      tool: "repository_retryProviderSetup",
      problem: "Samebase setup of the Cloudflare Worker failed.",
    };

    it.each([
      ["running", [runningItem]],
      ["failed", [retryItem]],
    ] as const)("provider setup %s", (status, expected) => {
      expect(
        buildRepositoryAttention({
          repository: { ...repository, providerSetup: providerSetups[status] },
          observations: noStackObservations,
        }),
      ).toEqual(expected);
    });

    it.each(["not_applicable", "ready"] as const)("provider setup %s", (status) => {
      expect(
        buildRepositoryAttention({
          repository: { ...repository, providerSetup: providerSetups[status] },
          observations: noStackObservations,
        }),
      ).toHaveLength(1);
    });
  });

  describe("a repository that its GitHub Actions set up", () => {
    const repositoryActionsRepository = (
      ciSecrets: Extract<
        NonNullable<RepositoryStatusRepository["providerPlan"]>,
        { provisioning: "repository_actions" }
      >["ciSecrets"],
    ): RepositoryStatusRepository => ({
      ...repository,
      providerPlan: {
        provisioning: "repository_actions",
        convexConfigPath: "convex.json",
        ciSecrets,
      },
    });

    const writtenSecrets = { state: "written", writtenAt: 2, credentialRevision: 1 } as const;
    const setupStackAttention = (setupStack: RepositoryObservations["setupStack"]) =>
      buildRepositoryAttention({
        repository: repositoryActionsRepository(writtenSecrets),
        observations: { ...healthyObservations, setupStack },
      });

    it("gives nothing for a done setup status", () => {
      expect(setupStackAttention({ state: "done" })).toEqual([]);
      expect(setupStackAttention(null)).toEqual([]);
    });

    it("gives only the store item for an unreadable setup status", () => {
      expect(
        buildRepositoryAttention({
          repository: repositoryActionsRepository(writtenSecrets),
          observations: {
            ...healthyObservations,
            stacks: { state: "unreadable" },
            setupStack: { state: "unavailable" },
          },
        }),
      ).toEqual([
        {
          tool: null,
          problem:
            "The team's Alchemy state store could not be read, so this status does not say what samebase/chess-merge has deployed. Call repository_getStatus again.",
        },
      ]);
    });

    it("reports a deployment in progress with the Actions page, and no empty store", () => {
      const emptyReads: RepositoryObservations["stacks"][] = [
        { state: "no_store" },
        { state: "available", stacks: [] },
      ];
      for (const stacks of emptyReads) {
        expect(
          buildRepositoryAttention({
            repository: repositoryActionsRepository(writtenSecrets),
            observations: { ...healthyObservations, stacks, setupStack: { state: "in_progress" } },
          }),
        ).toEqual([
          {
            tool: null,
            problem:
              "The first deployment of samebase/chess-merge is in progress in its GitHub Actions: https://github.com/samebase/chess-merge/actions. Call repository_getStatus again when the run finishes.",
          },
        ]);
      }
    });

    it("says that the Actions secrets are not written yet", () => {
      expect(
        buildRepositoryAttention({
          repository: repositoryActionsRepository({ state: "planned" }),
          observations: {
            ...healthyObservations,
            stacks: { state: "no_store" },
            setupStack: { state: "in_progress" },
          },
        }),
      ).toEqual([
        {
          tool: null,
          problem:
            "The GitHub Actions secrets of samebase/chess-merge are not written yet, so its deploy workflow cannot run.",
        },
      ]);
    });

    it("names the GitHub Actions secrets while Samebase's setup runs or after it failed", () => {
      // @ts-expect-error Run IDs are strings at runtime; the rules ignore them.
      const runId: Id<"workflow_repositoryProvisioning_runs"> = "run-2";
      expect(
        buildRepositoryAttention({
          repository: {
            ...repositoryActionsRepository({ state: "planned" }),
            providerSetup: {
              status: "failed",
              provider: "github",
              runId,
              step: "write_actions_secrets",
              message: "The Samebase GitHub App is missing the Secrets repository permission.",
              updatedAt: 1,
            },
          },
          observations: healthyObservations,
        }),
      ).toEqual([
        {
          tool: "repository_retryProviderSetup",
          problem: "Samebase setup of the GitHub Actions secrets failed.",
        },
      ]);
    });
  });
});

describe("projectRepositoryStatusForMcp", () => {
  const status: RepositoryStatus = { ...healthyObservations, attention: [] };

  it("keeps the typical result (1 stack, 2 open PRs) under 4 KB", () => {
    const mcpResult = projectRepositoryStatusForMcp({ repository, status });
    const mcpBytes = Buffer.byteLength(JSON.stringify(mcpResult));

    expect(mcpBytes).toBeLessThan(4096);
    expect(mcpBytes).toBeLessThanOrEqual(Buffer.byteLength(JSON.stringify(status)));
  });

  it("projects what the overview shows, with failed check names and no internal IDs or SHAs", () => {
    const mcpResult = projectRepositoryStatusForMcp({ repository, status });

    expect(mcpResult).toMatchObject({
      repository: "samebase/chess-merge",
      defaultBranch: {
        name: "main",
        checks: {
          total: 3,
          failed: 0,
          pending: 0,
          unknown: 0,
          failedNames: [],
          failedNamesComplete: true,
        },
      },
      openPullRequestCount: 2,
      stacks: { state: "available", stacks: [availableStack] },
      pullRequests: [
        { number: 42, checks: { total: 3, failed: 1, pending: 0, failedNames: ["test"] } },
        { number: 41, checks: { total: 3, failed: 0, pending: 1, failedNames: [] } },
      ],
      attention: [],
    });
    const serialized = JSON.stringify(mcpResult);
    for (const internalValue of ["PR_kwDOOx7Rc86hY2", "enhancement", "headRefOid"]) {
      expect(serialized).not.toContain(internalValue);
    }
  });

  it("counts every check from GitHub's aggregate counts, beyond the 100 listed checks", () => {
    // 102 checks: GitHub lists the first 100, which hold one unknown check; a failure and a
    // pending check come after them.
    const checks = checkRollup([
      ...Array.from({ length: 99 }, (_, index) => ({
        name: `unit ${index + 1}`,
        conclusion: "SUCCESS" as const,
      })),
      { name: "license scan", conclusion: "UNKNOWN" },
      { name: "deploy preview", conclusion: "FAILURE" },
      { name: "e2e", conclusion: null },
    ]);
    const mcpResult = projectRepositoryStatusForMcp({
      repository,
      status: {
        ...status,
        pullRequests: {
          state: "available",
          page: {
            repository: {
              ...githubRepository,
              defaultBranch: { ...defaultBranch, statusCheckRollup: checks },
            },
          },
        },
      },
    });

    expect(mcpResult.defaultBranch?.checks).toEqual({
      total: 102,
      failed: 1,
      pending: 1,
      unknown: 1,
      failedNames: [],
      failedNamesComplete: false,
    });
  });

  it("reports an unreadable GitHub and an unreadable store as such", () => {
    const mcpResult = projectRepositoryStatusForMcp({
      repository,
      status: {
        ...status,
        pullRequests: { state: "unavailable" },
        stacks: { state: "unreadable" },
      },
    });

    expect(mcpResult).toMatchObject({
      defaultBranch: null,
      openPullRequestCount: null,
      stacks: { state: "unreadable" },
      pullRequests: [],
    });
  });
});
