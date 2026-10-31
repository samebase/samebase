import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { observedNativePreviewsProductionBuild } from "../cloudflareApi/fixtures/observedWorkerBuilds";
import { matchLatestCloudflareWorkerBuildForBranch } from "./cloudflareBuildMatching";
import type { RepositoryStatus } from "./contracts/getRepositoryStatus";
import type { RepositoryPullRequest, RepositoryStatusCheckRollup } from "./pullRequestModel";
import {
  buildRepositoryAttention,
  projectRepositoryStatusForMcp,
  type RepositoryObservations,
  type RepositoryStatusRepository,
} from "./repositoryStatus";

function fakeWorkerId(value: string): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; these pure rules only compare them.
  return value;
}

function fakeConvexProjectId(value: string): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; these pure rules only compare them.
  return value;
}

const accountId = "9a7806061c88ada191ed06f989cc3dac";
const buildTokenUuid = "0f3c9a2e-5b1d-4c7e-9f20-8a6b4d1e7c35";
const workerId = fakeWorkerId("k57a3m9x2p8q4r6t1v0w5y7z3b8c2d4e");
const convexProjectId = fakeConvexProjectId("j97b4n2c8x5v1m3k6p9q0r7s2t4u8w1y");
const adminConvexProjectId = fakeConvexProjectId("j97b4n2c8x5v1m3k6p9q0r7s2t4u8w2z");
const headCommitOid = "3f9c2b7e1a4d8c6f0b5e9a2d7c1f4b8e6a3d9c2f";

const repository: RepositoryStatusRepository = {
  githubRepositoryFullName: "samebase/chess-merge",
  providerSetup: { status: "ready" },
  providerPlan: null,
  cloudflareWorkers: [
    {
      workerId,
      accountId,
      workerName: "chess-merge",
      workerTag: "8d3c5e1f7a9b2c4d6e8f0a1b3c5d7e9f",
      rootDirectory: "/",
    },
  ],
  convexProjects: [
    {
      convexProjectId,
      teamId: "41275",
      projectId: "387501",
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
    },
  ],
};
const adminProject = {
  convexProjectId: adminConvexProjectId,
  teamId: "41275",
  projectId: "387502",
  codeLocation: { kind: "config" as const, convexConfigPath: "apps/admin/convex.json" },
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

const healthyObservations: RepositoryObservations = {
  workers: [
    {
      state: "available",
      workerId,
      workerName: "chess-merge",
      customDomains: ["chessmerge.com"],
      workersDev: { state: "enabled", url: "https://chess-merge.samebase.workers.dev" },
    },
  ],
  workerBuilds: [
    {
      state: "available",
      workerId,
      repository: { state: "ready", rootDirectory: "/", builds: { state: "available" } },
      builds: {
        state: "connected",
        productionBuildTokenUuid: buildTokenUuid,
        previewBuildTokenUuid: buildTokenUuid,
      },
      productionBuild: {
        state: "available",
        buildState: "success",
        commitHash: headCommitOid,
        logsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/chess-merge/production/builds/5e2b8c41-7d3a-4f19-b6e0-9c8a2d1f4e73`,
      },
    },
  ],
  workerConvexBuildAccess: [
    {
      state: "available",
      workerId,
      convexBuildAccess: {
        state: "configured",
        convexProject: {
          state: "attached",
          convexProjectId,
          teamId: "41275",
          attachedTeamId: "41275",
          teamState: "matches",
          projectId: "387501",
        },
      },
    },
  ],
  convexProjects: [
    {
      convexProjectId,
      projectId: "387501",
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      source: { state: "valid", kind: "config" },
      provider: {
        state: "current",
        projectSlug: "chess-merge",
        teamSlug: "samebase",
        productionDeployment: {
          state: "available",
          deploymentName: "tremendous-otter-123",
          dashboardUrl: "https://dashboard.convex.dev/d/tremendous-otter-123",
          region: "aws-us-east-1",
        },
      },
    },
  ],
  pullRequests: { state: "available", page: { repository: githubRepository } },
  pullRequestResources: pullRequests.map((read) => ({
    state: "available" as const,
    pullRequestId: read.id,
    cloudflareBuilds: { state: "available" as const },
    workers: [
      {
        workerId,
        workerName: "chess-merge",
        rootDirectory: "/",
        cloudflareBuild: {
          state: "available" as const,
          uuid: "7c1d9e4a-2b6f-4a83-9d5e-1f0b8c3a6e27",
          buildState: "success" as const,
          logsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/chess-merge/production/builds/7c1d9e4a-2b6f-4a83-9d5e-1f0b8c3a6e27`,
        },
        cloudflareBranchPreview: {
          state: "available" as const,
          url: `https://${read.headRefName}-chess-merge.samebase.workers.dev`,
          provenance: "selected_result" as const,
        },
      },
    ],
    convexProjects: [
      {
        state: "absent" as const,
        convexProjectId,
        rootDirectory: "/",
      },
    ],
    hostingPreviews: {
      cloudflare: { state: "available" as const, previews: [] },
      netlify: { state: "available" as const, previews: [] },
    },
  })),
  setupStack: null,
};

function withWorkerBuilds(
  workerBuilds: RepositoryObservations["workerBuilds"][number],
): RepositoryObservations {
  return { ...healthyObservations, workerBuilds: [workerBuilds] };
}

function withConvexBuildAccess(
  convexBuildAccess: Extract<
    RepositoryObservations["workerConvexBuildAccess"][number],
    { state: "available" }
  >["convexBuildAccess"],
): RepositoryObservations {
  return {
    ...healthyObservations,
    workerConvexBuildAccess: [{ state: "available", workerId, convexBuildAccess }],
  };
}

const readyBuilds = {
  state: "available" as const,
  workerId,
  repository: {
    state: "ready" as const,
    rootDirectory: "/",
    builds: { state: "available" as const },
  },
  builds: {
    state: "connected" as const,
    productionBuildTokenUuid: buildTokenUuid,
    previewBuildTokenUuid: buildTokenUuid,
  },
  productionBuild: { state: "absent" as const },
};

describe("buildRepositoryAttention", () => {
  it("reports nothing for a healthy repository", () => {
    expect(buildRepositoryAttention({ repository, observations: healthyObservations })).toEqual([]);
  });

  describe("reads the provider setup state before any repair", () => {
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
    // Builds that the managed run has not configured yet, so a repair item would follow.
    const unconfiguredObservations = withWorkerBuilds({
      ...readyBuilds,
      repository: { state: "not_connected" },
    });
    // A creation without a Workers Builds token: Convex is attached, no Worker yet.
    const pendingCloudflareRepository: RepositoryStatusRepository = {
      ...repository,
      cloudflareWorkers: [],
      providerPlan: {
        convexConfigPath: "convex.json",
        convex: {
          state: "created",
          projectName: "chess-merge",
          deploymentRegion: "aws-us-east-1",
          teamId: "41275",
          projectId: "387501",
        },
        cloudflare: {
          state: "planned",
          accountId,
          workerName: "chess-merge",
          rootDirectory: "/",
          buildTokenUuid: null,
        },
      },
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
    const configureItem = {
      tool: "repository_cloudflare_configureBuilds",
      workerName: "chess-merge",
      problem: "Workers Builds of chess-merge is not connected to this GitHub repository.",
    };
    const pendingItem = {
      tool: "repository_cloudflare_createWorker",
      workerName: "chess-merge",
      rootDirectory: "/",
      problem:
        "Cloudflare setup is pending because the Cloudflare account had no Workers Builds token. Give the user https://samebase.com/docs/cloudflare-setup. After the user finishes it, call repository_cloudflare_createWorker for this repository: it creates the Worker chess-merge at root directory / and installs the Convex deploy key.",
    };

    it.each([
      ["not_applicable", "attached Worker", [configureItem]],
      ["running", "attached Worker", [runningItem]],
      ["failed", "attached Worker", [retryItem]],
      ["ready", "attached Worker", [configureItem]],
      ["not_applicable", "pending Cloudflare setup", [pendingItem]],
      ["running", "pending Cloudflare setup", [runningItem]],
      ["failed", "pending Cloudflare setup", [retryItem]],
      ["ready", "pending Cloudflare setup", [pendingItem]],
    ] as const)("provider setup %s with an %s", (status, cloudflare, expected) => {
      expect(
        buildRepositoryAttention({
          repository: {
            ...(cloudflare === "pending Cloudflare setup"
              ? pendingCloudflareRepository
              : repository),
            providerSetup: providerSetups[status],
          },
          observations: unconfiguredObservations,
        }),
      ).toEqual(expected);
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
    // Builds that Samebase would repair for a samebase repository.
    const unconfiguredObservations = withWorkerBuilds({
      ...readyBuilds,
      repository: { state: "not_connected" },
    });

    const writtenSecrets = { state: "written", writtenAt: 2, credentialRevision: 1 } as const;
    const setupStackAttention = (setupStack: RepositoryObservations["setupStack"]) =>
      buildRepositoryAttention({
        repository: repositoryActionsRepository(writtenSecrets),
        observations: { ...healthyObservations, setupStack },
      });

    it("names the setup stack instead of a Samebase repair tool for an attached Worker", () => {
      expect(
        buildRepositoryAttention({
          repository: repositoryActionsRepository(writtenSecrets),
          observations: { ...unconfiguredObservations, setupStack: { state: "done" } },
        }),
      ).toEqual([
        {
          tool: null,
          problem:
            "Workers Builds of chess-merge is not connected to this GitHub repository. The setup stack in alchemy.run.ts owns this setting: change the stack, or run the alchemy workflow on the default branch to repair it.",
        },
      ]);
    });

    it("gives nothing for a done or unreadable setup status", () => {
      expect(setupStackAttention({ state: "done" })).toEqual([]);
      expect(setupStackAttention({ state: "unavailable" })).toEqual([]);
      expect(setupStackAttention(null)).toEqual([]);
    });

    it("reports a deployment in progress with the Actions page, and no failure", () => {
      expect(setupStackAttention({ state: "in_progress" })).toEqual([
        {
          tool: null,
          problem:
            "The first deployment of samebase/chess-merge is in progress in its GitHub Actions: https://github.com/samebase/chess-merge/actions. Call repository_getStatus again when the run finishes.",
        },
      ]);
    });

    it("says that the Actions secrets are not written yet", () => {
      expect(
        buildRepositoryAttention({
          repository: repositoryActionsRepository({ state: "planned" }),
          observations: unconfiguredObservations,
        }),
      ).toEqual([
        {
          tool: null,
          problem:
            "The GitHub Actions secrets of samebase/chess-merge are not written yet, so its deploy workflow cannot run.",
        },
        {
          tool: null,
          problem:
            "Workers Builds of chess-merge is not connected to this GitHub repository. The setup stack in alchemy.run.ts owns this setting: change the stack, or run the alchemy workflow on the default branch to repair it.",
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
          observations: unconfiguredObservations,
        }),
      ).toEqual([
        {
          tool: "repository_retryProviderSetup",
          problem: "Samebase setup of the GitHub Actions secrets failed.",
        },
      ]);
    });
  });

  it("reports a Worker that no longer exists, and nothing for unreadable Worker facts", () => {
    expect(
      buildRepositoryAttention({
        repository,
        observations: {
          ...healthyObservations,
          workers: [{ state: "missing", workerId }],
        },
      }),
    ).toEqual([
      {
        tool: null,
        problem: "The Cloudflare Worker chess-merge no longer exists in the Cloudflare account.",
      },
    ]);
    expect(
      buildRepositoryAttention({
        repository,
        observations: withWorkerBuilds({ state: "failed", workerId, reason: "request_failed" }),
      }),
    ).toEqual([]);
  });

  it.each([
    {
      name: "not connected to the GitHub repository",
      builds: { ...readyBuilds, repository: { state: "not_connected" as const } },
      item: {
        tool: "repository_cloudflare_configureBuilds",
        workerName: "chess-merge",
        problem: "Workers Builds of chess-merge is not connected to this GitHub repository.",
      },
    },
    {
      name: "incomplete Builds settings",
      builds: { ...readyBuilds, builds: { state: "not_connected" as const } },
      item: {
        tool: "repository_cloudflare_configureBuilds",
        workerName: "chess-merge",
        problem: "The Workers Builds setup of chess-merge is incomplete.",
      },
    },
    {
      name: "different production and preview tokens",
      builds: {
        ...readyBuilds,
        builds: {
          state: "connected" as const,
          productionBuildTokenUuid: buildTokenUuid,
          previewBuildTokenUuid: "b81e2f4c-9a3d-4e65-8c17-0d2f6a9b3e54",
        },
      },
      item: {
        tool: "repository_cloudflare_configureBuilds",
        workerName: "chess-merge",
        problem:
          "The production and preview builds of chess-merge use different Workers Builds tokens.",
      },
    },
    {
      name: "no Builds token",
      builds: {
        ...readyBuilds,
        builds: {
          state: "connected" as const,
          productionBuildTokenUuid: null,
          previewBuildTokenUuid: null,
        },
      },
      item: {
        tool: "repository_cloudflare_configureBuilds",
        workerName: "chess-merge",
        problem: "chess-merge has no Workers Builds token.",
      },
    },
    {
      name: "Builds of another GitHub repository",
      builds: { ...readyBuilds, repository: { state: "connected_elsewhere" as const } },
      item: {
        tool: null,
        problem:
          "Workers Builds of chess-merge builds another GitHub repository. Change it in Cloudflare.",
      },
    },
    {
      name: "no single repository root",
      builds: {
        ...readyBuilds,
        repository: { state: "ambiguous" as const, reason: "multiple_root_directories" as const },
      },
      item: {
        tool: null,
        problem:
          "Workers Builds of chess-merge has no single repository root. Fix its Builds settings in Cloudflare.",
      },
    },
    {
      name: "legacy previews",
      builds: {
        ...readyBuilds,
        repository: {
          state: "ready" as const,
          rootDirectory: "/",
          builds: { state: "legacy_previews" as const },
        },
      },
      item: {
        tool: null,
        problem:
          "chess-merge does not use native Worker Previews. Migrate it first: https://samebase.com/docs/cloudflare-previews-migration",
      },
    },
  ])("reports Workers Builds with $name", ({ builds, item }) => {
    expect(
      buildRepositoryAttention({ repository, observations: withWorkerBuilds(builds) }),
    ).toEqual([item]);
  });

  it.each([
    {
      name: "missing keys use the only attached project",
      access: { state: "not_configured" as const },
      problem: "chess-merge has no Convex deploy keys.",
    },
    {
      name: "incomplete keys repair their own project",
      access: {
        state: "incomplete" as const,
        convexProject: {
          state: "attached" as const,
          convexProjectId,
          teamId: "41275",
          attachedTeamId: "41275",
          teamState: "matches" as const,
          projectId: "387501",
        },
      },
      problem: "The Convex deploy keys of chess-merge are incomplete.",
    },
    {
      name: "keys of another team",
      access: {
        state: "configured" as const,
        convexProject: {
          state: "attached" as const,
          convexProjectId,
          teamId: "50311",
          attachedTeamId: "41275",
          teamState: "differs" as const,
          projectId: "387501",
        },
      },
      problem: "The Convex deploy keys of chess-merge belong to another Convex team.",
    },
    {
      name: "keys of an unattached project",
      access: {
        state: "configured" as const,
        convexProject: { state: "external" as const, teamId: "41275", projectId: "990001" },
      },
      problem:
        "The Convex deploy keys of chess-merge target a Convex project that is not attached to this repository.",
    },
    {
      name: "keys of an unknown project",
      access: { state: "target_unknown" as const },
      problem: "chess-merge has Convex deploy keys for an unknown Convex project.",
    },
    {
      name: "an invalid marker",
      access: { state: "invalid" as const },
      problem: "The Convex project marker of chess-merge is invalid.",
    },
  ])("names the deploy-key rotation for $name", ({ access, problem }) => {
    expect(
      buildRepositoryAttention({ repository, observations: withConvexBuildAccess(access) }),
    ).toEqual([
      {
        tool: "repository_cloudflare_rotateConvexDeployKeys",
        workerName: "chess-merge",
        convexProjectSlug: "chess-merge",
        problem,
      },
    ]);
  });

  it("asks for the Convex project when several are attached and the keys name none", () => {
    const observations = withConvexBuildAccess({ state: "not_configured" });
    const [project] = observations.convexProjects;
    expect(
      buildRepositoryAttention({
        repository: { ...repository, convexProjects: [...repository.convexProjects, adminProject] },
        observations: {
          ...observations,
          convexProjects: [
            project,
            {
              ...project,
              convexProjectId: adminConvexProjectId,
              projectId: "387502",
              codeLocation: adminProject.codeLocation,
            },
          ],
        },
      }),
    ).toEqual([
      {
        tool: "repository_cloudflare_rotateConvexDeployKeys",
        workerName: "chess-merge",
        convexProjectSlug: null,
        problem:
          "chess-merge has no Convex deploy keys. Ask the user which attached Convex project the Worker deploys with.",
      },
    ]);
  });

  it("names no deploy-key repair when no Convex project is attached", () => {
    expect(
      buildRepositoryAttention({
        repository: { ...repository, convexProjects: [] },
        observations: {
          ...withConvexBuildAccess({ state: "not_configured" }),
          convexProjects: [],
        },
      }),
    ).toEqual([]);
  });

  it("names no deploy-key repair when Convex cannot be read", () => {
    const observations = withConvexBuildAccess({ state: "not_configured" });
    const unreadableProject = {
      ...observations.convexProjects[0],
      provider: { state: "unavailable" as const, reason: "request_failed" as const },
    };

    expect(
      buildRepositoryAttention({
        repository,
        observations: { ...observations, convexProjects: [unreadableProject] },
      }),
    ).toEqual([]);
    expect(
      buildRepositoryAttention({
        repository: { ...repository, convexProjects: [...repository.convexProjects, adminProject] },
        observations: { ...observations, convexProjects: [unreadableProject] },
      }),
    ).toEqual([]);
  });

  it("says to deploy the Convex project to production first instead of a rotation that would fail", () => {
    const observations = withConvexBuildAccess({ state: "not_configured" });
    expect(
      buildRepositoryAttention({
        repository,
        observations: {
          ...observations,
          convexProjects: [
            {
              convexProjectId,
              projectId: "387501",
              codeLocation: { kind: "config", convexConfigPath: "convex.json" },
              source: { state: "valid", kind: "config" },
              provider: {
                state: "current",
                projectSlug: "chess-merge",
                teamSlug: "samebase",
                productionDeployment: { state: "missing" },
              },
            },
          ],
        },
      }),
    ).toEqual([
      {
        tool: null,
        problem:
          "Deploy the Convex project chess-merge to production first. Samebase installs its deploy key after the production deployment exists. Then call repository_cloudflare_rotateConvexDeployKeys for the Worker that deploys with it.",
      },
    ]);
  });

  it("reports a missing Convex project and a missing code location, and nothing for unreadable Convex facts", () => {
    const [project] = healthyObservations.convexProjects;
    expect(
      buildRepositoryAttention({
        repository,
        observations: {
          ...healthyObservations,
          convexProjects: [
            {
              ...project,
              source: { state: "missing" },
              provider: { state: "missing_ambiguous" },
            },
          ],
        },
      }),
    ).toEqual([
      {
        tool: null,
        problem:
          "The Convex code location convex.json no longer exists on the default branch. Change it in the Samebase dashboard.",
      },
      {
        tool: null,
        problem:
          "The Convex project at convex.json is missing from the connected Convex team. It may have moved to another team.",
      },
    ]);
    expect(
      buildRepositoryAttention({
        repository,
        observations: {
          ...healthyObservations,
          convexProjects: [
            {
              ...project,
              source: { state: "unavailable", reason: "request_failed" },
              provider: { state: "unavailable", reason: "request_failed" },
            },
          ],
        },
      }),
    ).toEqual([]);
  });
});

describe("projectRepositoryStatusForMcp", () => {
  const status: RepositoryStatus = { ...healthyObservations, attention: [] };

  it("keeps the typical result (1 Worker, 1 Convex project, 2 open PRs) under 4 KB", () => {
    const mcpResult = projectRepositoryStatusForMcp({ repository, status });
    const mcpBytes = Buffer.byteLength(JSON.stringify(mcpResult));

    expect(mcpBytes).toBe(2274);
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
      apps: [
        {
          workerName: "chess-merge",
          rootDirectory: "/",
          productionBuild: { state: "available", buildState: "success" },
          urls: ["https://chessmerge.com", "https://chess-merge.samebase.workers.dev"],
        },
      ],
      convexProjects: [
        {
          codeLocation: "convex.json",
          projectSlug: "chess-merge",
          productionDeployment: { state: "available", deploymentName: "tremendous-otter-123" },
        },
      ],
      pullRequests: [
        {
          number: 42,
          checks: { total: 3, failed: 1, pending: 0, failedNames: ["test"] },
          apps: [
            {
              workerName: "chess-merge",
              previewBuild: { state: "available", buildState: "success" },
              previewUrl: "https://undo-move-history-chess-merge.samebase.workers.dev",
            },
          ],
        },
        { number: 41, checks: { total: 3, failed: 0, pending: 1, failedNames: [] } },
      ],
      attention: [],
    });
    const serialized = JSON.stringify(mcpResult);
    for (const internalValue of [
      workerId,
      convexProjectId,
      "PR_kwDOOx7Rc86hY2",
      "enhancement",
      "headRefOid",
    ]) {
      expect(serialized).not.toContain(internalValue);
    }
  });

  it("says whether the latest production build is of the default branch head", () => {
    // The recorded ChessMerge production build on main.
    const build = matchLatestCloudflareWorkerBuildForBranch({
      builds: [observedNativePreviewsProductionBuild],
      branch: "main",
      worker: { workerTag: "d8f877365405479ba51bd8f96fcdc156", rootDirectory: "/" },
      githubRepositoryDatabaseId: "993742136",
    });
    if (build.state !== "available") {
      throw new Error("Expected the recorded build to match the default branch.");
    }
    const productionBuildAtHead = (head: string | null) =>
      projectRepositoryStatusForMcp({
        repository,
        status: {
          ...status,
          workerBuilds: [
            {
              ...readyBuilds,
              productionBuild: {
                state: "available",
                buildState: build.buildState,
                commitHash: build.commitHash,
                logsUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/chess-merge/production/builds/${build.buildUuid}`,
              },
            },
          ],
          pullRequests:
            head === null
              ? { state: "unavailable" }
              : {
                  state: "available",
                  page: {
                    repository: {
                      ...githubRepository,
                      defaultBranch: { ...defaultBranch, headCommitOid: head },
                    },
                  },
                },
        },
      }).apps[0]?.productionBuild;

    expect(
      productionBuildAtHead(
        observedNativePreviewsProductionBuild.build_trigger_metadata.commit_hash,
      ),
    ).toMatchObject({
      state: "available",
      buildState: "success",
      commit: "matches_head",
    });
    // A push advances only the head: the same successful build no longer deploys it.
    expect(productionBuildAtHead(headCommitOid)).toMatchObject({
      buildState: "success",
      commit: "behind_head",
    });
    expect(productionBuildAtHead(null)).toMatchObject({ buildState: "success", commit: "unknown" });
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

  it("reports unreadable reads as unavailable", () => {
    const mcpResult = projectRepositoryStatusForMcp({
      repository,
      status: {
        ...status,
        workers: [{ state: "failed", workerId, reason: "request_failed" }],
        workerBuilds: [{ state: "failed", workerId, reason: "request_failed" }],
        pullRequests: { state: "unavailable" },
        pullRequestResources: [],
      },
    });

    expect(mcpResult).toMatchObject({
      defaultBranch: null,
      openPullRequestCount: null,
      apps: [{ workerName: "chess-merge", productionBuild: { state: "unavailable" }, urls: [] }],
      pullRequests: [],
    });
  });

  it("reports each app of a pull request as unavailable when its Cloudflare builds are unread", () => {
    const mcpResult = projectRepositoryStatusForMcp({
      repository,
      status: {
        ...status,
        pullRequestResources: status.pullRequestResources.map((resources) =>
          resources.state === "available"
            ? { ...resources, cloudflareBuilds: { state: "unavailable" as const }, workers: [] }
            : resources,
        ),
      },
    });

    expect(mcpResult.pullRequests.map((pullRequest) => pullRequest.apps)).toEqual([
      [{ workerName: "chess-merge", previewBuild: { state: "unavailable" }, previewUrl: null }],
      [{ workerName: "chess-merge", previewBuild: { state: "unavailable" }, previewUrl: null }],
    ]);
  });
});
