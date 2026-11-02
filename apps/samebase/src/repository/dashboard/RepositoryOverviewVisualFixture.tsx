import { useState } from "react";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  RepositoryOverviewLoadingPage,
  RepositoryOverviewPage,
} from "@/repository/dashboard/RepositoryOverviewPage";
import {
  type RepositoryFolderCallbacks,
  RepositoryOverviewOrganizationSidebar,
  RepositoryOverviewSidebarLoading,
} from "@/repository/dashboard/RepositoryOverviewSidebar";
import { buildAlchemyStackCards } from "@/repository/dashboard/repositoryEnvironmentRoots";
import type {
  RepositoryFolderState,
  RepositoryOrganizationTreeSettings,
  RepositoryWorkspaceSelected,
} from "@/repository/dashboard/repositoryWorkspaceModel";
import {
  type RepositoryOrganization,
  RepositoryOverviewListHeader,
  RepositoryOverviewPickerPane,
} from "@/repository/dashboard/RepositoryOverviewPickerPane";
import { SidebarLayoutFixtureFrame } from "@/components/SidebarLayoutFixtureFrame";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type {
  RepositoryDefaultBranchObservation,
  RepositoryPullRequest,
  RepositoryPullRequestsState,
} from "@/repository/dashboard/useRepositoryPullRequests";
import type { RepositorySidebarSummariesState } from "@/repository/dashboard/useRepositorySidebarSummaries";
import type { RepositoryAlchemyState } from "@/repository/dashboard/useRepositoryAlchemyState";
import type { RepositoryAlchemyStacks } from "@/repository/dashboard/useRepositoryProviderObservations";
import type { Id } from "../../../convex/_generated/dataModel";
import { observedSamebaseStackReply } from "../../../convex/repository/fixtures/observedSamebaseAlchemyState";
import { observedScoutR2Resources } from "../../../convex/repository/fixtures/observedScoutR2Resources";
import { ROLE_ACCESS_GRANTS } from "../../../shared/accessModel";
import type { AlchemyStateObservation } from "../../../shared/alchemyStateModel";
import {
  RepositoryOverviewDialogsVisualFixture,
  type RepositoryOverviewDialogsVisualMode,
} from "./RepositoryOverviewDialogsVisualFixture";

export type RepositoryOverviewVisualMode =
  | RepositoryOverviewDialogsVisualMode
  | "repository-overview-v2"
  | "repository-overview-v2-auto-pagination"
  | "repository-overview-v2-cloudflare-github-authorization-failed"
  | "repository-overview-v2-dev"
  | "repository-overview-v2-loading"
  | "repository-overview-v2-no-convex"
  | "repository-overview-v2-partial-loading"
  | "repository-overview-v2-provisioning-source"
  | "repository-overview-v2-provisioning-github"
  | "repository-overview-v2-provisioning-early-empty"
  | "repository-overview-v2-provisioning-complete-empty"
  | "repository-overview-v2-provisioning-stale-empty"
  | "repository-overview-v2-provisioning-commit"
  | "repository-overview-v2-provisioning-ready"
  | "repository-overview-v2-root"
  | "repository-overview-v2-r2"
  | "repository-overview-v2-settings"
  | "repository-overview-v2-settings-active"
  | "repository-overview-v2-settings-loading"
  | "repository-overview-v2-store-missing"
  | "repository-overview-v2-store-unreadable";

const FIXTURE_NOW = Date.parse("2026-04-03T00:00:12Z");
function fakeRepositoryId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeFolderId(value: string): Id<"ui_repositoryTree_folders"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeCloudflareWorkerId(value: string): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeConvexProjectId(value: string): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

function fakeRepositoryProvisioningRunId(
  value: string,
): Id<"workflow_repositoryProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this fixture only
  // needs a stable value for static rendering.
  return value;
}

const LIST_SPACING_REPOSITORY_ID = fakeRepositoryId();
const VISUAL_ORGANIZATION_ID = fakeOrganizationId("organization-samebase");
const VISUAL_NOTER_ORGANIZATION_ID = fakeOrganizationId("organization-noter");
const VISUAL_EMPTY_ORGANIZATION_ID = fakeOrganizationId("organization-empty");
const LIST_SPACING_DOMAIN_WORKER_ID = fakeCloudflareWorkerId("worker-domain-router");
const LIST_SPACING_SAMEBASE_WORKER_ID = fakeCloudflareWorkerId("worker-samebase");
const LIST_SPACING_CONVEX_PROJECT_ID = fakeConvexProjectId("convex-project-samebase");
const LIST_SPACING_REPOSITORY = {
  repositoryId: LIST_SPACING_REPOSITORY_ID,
  organizationId: VISUAL_ORGANIZATION_ID,
  cloudflareAccountId: "fe57d01d7ab41f60d00ba1aade20eb33",
  convexTeamId: "samebase-team-id",
  githubOwnerLogin: "samebase",
  githubRepositoryName: "samebase",
  githubRepositoryFullName: "samebase/samebase",
  defaultBranch: "main",
  fileCount: 18,
  sourceSetup: { status: "ready" },
  providerSetup: { status: "ready" },
  providerPlan: null,
  providerWrite: { status: "idle", lastWriteAt: {} },
  deletion: {
    state: "not_deleting",
    deleteAction: { state: "available" },
  },
  isSamebaseManaged: true,
  hasConnectedGitHubRepository: true,
  hasConvexProvision: true,
  hasCloudflareProvision: true,
  cloudflareWorkers: [
    {
      workerId: LIST_SPACING_DOMAIN_WORKER_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "domain-router",
      workerTag: "domain-router-tag",
      rootDirectory: "apps/domain-router",
    },
    {
      workerId: LIST_SPACING_SAMEBASE_WORKER_ID,
      accountId: "fe57d01d7ab41f60d00ba1aade20eb33",
      workerName: "samebase-worker",
      workerTag: "samebase-worker-tag",
      rootDirectory: "apps/samebase",
    },
  ],
  convexProjects: [
    {
      convexProjectId: LIST_SPACING_CONVEX_PROJECT_ID,
      codeLocation: { kind: "config", convexConfigPath: "apps/samebase/convex.json" },
      teamId: "samebase-team-id",
      projectId: "839311",
    },
  ],
} satisfies UserRepositoryResult;

/**
The Worker of the captured PosthogProxy row of samebase/samebase as `workerName`, served at its
workers.dev URL.
*/
function fixtureWorkerRow(workerName: string): string {
  const [, proxyRow] = observedSamebaseStackReply.value.stages[2].resources;
  const url = `https://${workerName}.samebase.workers.dev`;
  return proxyRow.value
    .replaceAll("samebase-posthog-proxy", workerName)
    .replace('"urls":[]', `"url":"${url}","urls":["${url}"]`);
}

/**
The stacks of samebase/samebase from the captured rows of its stages `prod` and `pr-1768`: the root
stack, whose Site deployment serves at its custom domain samebase.com and binds the `mail` component
to the namespace `Mail` of an inbox Worker and a Scout bucket, and the stack of apps/sidebars-example
with only a Worker. The root stack has the captured preview of pull request 1768 as the stage
`pr-1260` of the first fixture pull request. Each stage deployed the head commit that the overview
shows, so no card has a run line.
*/
const FIXTURE_STACKS = ((): RepositoryAlchemyStacks => {
  const [, preview, prod] = observedSamebaseStackReply.value.stages;
  const [, , projectRow, siteRow] = prod.resources;
  const [, , previewSiteRow] = preview.resources;
  const [, workspacesProdRow] = observedScoutR2Resources;
  const inMail = (value: string) => value.replace(/}$/, ',"namespace":{"Id":"Mail"}}');
  // The captured run record of the stage with the stack file at the repository root, for the head
  // commit of the fixture default branch.
  const record = {
    version: 1,
    repository: "samebase/samebase",
    stackFile: "alchemy.run.ts",
    branch: "main",
    pullRequest: null,
    headCommit: "81145b7d2a32186823452c7515b2d5ba2d79b350",
    runUrl: "https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1",
    source: "github-actions",
    recordedAt: "2026-10-22T08:22:58.152Z",
  } as const;
  // The head commit of the fixture pull request 1260.
  const pullRequestHead = "0000000000000000000000000000000000000001";
  return {
    store: "found",
    liveDeployments: [
      {
        deploymentName: "clear-butterfly-858",
        dashboardUrl: "https://dashboard.convex.dev/t/nicu/samebase/clear-butterfly-858",
        region: "aws-us-east-1",
        customDomains: [
          { domain: "api.samebase.com", requestDestination: "convexSite" },
          { domain: "cloud.samebase.com", requestDestination: "convexCloud" },
          { domain: "samebase.com", requestDestination: "convexSite" },
        ],
      },
    ],
    stacks: [
      {
        name: "samebase/samebase",
        stages: [
          {
            name: "pr-1260",
            // The captured run record of `pr-1768`, for the head commit of the pull request.
            record: {
              ...record,
              branch: "alchemy-root-stack",
              pullRequest: 1260,
              headCommit: pullRequestHead,
              runUrl: "https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1",
              recordedAt: "2026-10-22T09:34:35.577Z",
            },
            deployedHeadCommit: pullRequestHead,
            resources: [previewSiteRow],
            output: '{"url":"https://aware-bobcat-542.convex.site"}',
          },
          {
            name: "prod",
            record,
            deployedHeadCommit: record.headCommit,
            resources: [
              {
                fqn: "Mail/Inbox",
                value: inMail(fixtureWorkerRow("samebasemail-inbox-prod-lozzg2cltoglxke7")),
              },
              { fqn: "Mail/WorkspacesProd", value: inMail(workspacesProdRow.value) },
              projectRow,
              {
                fqn: "Site",
                value: siteRow.value
                  .replace('"type":"prod"', '"type":"prod","rootDir":"apps/samebase"')
                  .replace(
                    '"bindings":[]',
                    '"bindings":[{"sid":"convex.component:[\\"Mail\\"]","data":{"type":"component","path":"mail","namespace":["Mail"]}}]',
                  ),
              },
            ],
            output: '{"url":"https://clear-butterfly-858.convex.site"}',
          },
        ],
      },
      {
        name: "samebase/samebase/apps/sidebars-example",
        stages: [
          {
            name: "prod",
            record: { ...record, stackFile: "apps/sidebars-example/alchemy.run.ts" },
            deployedHeadCommit: record.headCommit,
            resources: [
              { fqn: "Site", value: fixtureWorkerRow("samebase-monorepo-sidebars-example") },
            ],
            output: "{}",
          },
        ],
      },
    ],
  };
})();

function loadedStore(observation: AlchemyStateObservation): RepositoryAlchemyState {
  return { state: "loaded", observation, refreshFailed: false, reload: () => {} };
}

/** A store that holds no stack of the repository, such as the store of an old app's team. */
const NO_STACK_STORE = loadedStore({ store: "found", stacks: [], liveDeployments: [] });

const SIDEBAR_LIST_SELECTED_REPOSITORY_ID = fakeRepositoryId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8c");
const SIDEBAR_LIST_REPOSITORIES = [
  {
    ...LIST_SPACING_REPOSITORY,
    repositoryId: LIST_SPACING_REPOSITORY_ID,
    githubOwnerLogin: "samebase",
    githubRepositoryName: "samebase",
    githubRepositoryFullName: "samebase/samebase",
  },
  {
    ...LIST_SPACING_REPOSITORY,
    repositoryId: SIDEBAR_LIST_SELECTED_REPOSITORY_ID,
    githubOwnerLogin: "samebase",
    githubRepositoryName: "marketing-site",
    githubRepositoryFullName: "samebase/marketing-site",
  },
  {
    ...LIST_SPACING_REPOSITORY,
    repositoryId: fakeRepositoryId("jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8d"),
    organizationId: VISUAL_NOTER_ORGANIZATION_ID,
    githubOwnerLogin: "noter",
    githubRepositoryName: "guestbook",
    githubRepositoryFullName: "noter/guestbook",
  },
] satisfies UserRepositoryResult[];

const FIXTURE_FOLDER_CALLBACKS = {
  onDeleteRepositoryFolder: async () => {},
  onMoveRepositoryFolder: async () => {},
  onMoveRepositoryToFolder: async () => {},
  onRenameRepositoryFolder: async () => {},
  onSetRepositoryFolderCollapsed: async () => {},
} satisfies RepositoryFolderCallbacks;

const VISUAL_PRODUCTS_FOLDER_ID = fakeFolderId("folder-products");
const VISUAL_FOLDER_STATE = {
  assignments: [
    {
      folderId: VISUAL_PRODUCTS_FOLDER_ID,
      repositoryId: SIDEBAR_LIST_SELECTED_REPOSITORY_ID,
    },
  ],
  folders: [
    {
      _id: VISUAL_PRODUCTS_FOLDER_ID,
      collapsed: false,
      name: "Products",
      organizationId: VISUAL_ORGANIZATION_ID,
      position: 0,
    },
    {
      _id: fakeFolderId("folder-archive"),
      collapsed: false,
      name: "Archive",
      organizationId: VISUAL_ORGANIZATION_ID,
      position: 1,
    },
  ],
} satisfies RepositoryFolderState;

const FIXTURE_REPOSITORY_FOLDER_PROPS = {
  ...FIXTURE_FOLDER_CALLBACKS,
  folderState: VISUAL_FOLDER_STATE,
  onCreateRepositoryFolder: async () => {},
  onSetRepositoryOrganizationCollapsed: async () => {},
  organizationTreeSettings: [],
};

const VISUAL_ORGANIZATIONS = [
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-empty",
    githubOwnerLogin: "empty-owner",
    githubOwnerType: "organization",
    organizationId: VISUAL_EMPTY_ORGANIZATION_ID,
    role: "owner",
  },
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-noter",
    githubOwnerLogin: "noter",
    githubOwnerType: "user",
    organizationId: VISUAL_NOTER_ORGANIZATION_ID,
    role: "owner",
  },
  {
    canCreateRepository: true,
    githubOwnerId: "github-owner-samebase",
    githubOwnerLogin: "samebase",
    githubOwnerType: "organization",
    organizationId: VISUAL_ORGANIZATION_ID,
    role: "owner",
  },
] satisfies RepositoryOrganization[];

const FIXTURE_NO_CHECKS = {
  state: "none",
  totalCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} as const;

type FixturePullRequest = RepositoryPullRequest;

const FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP = {
  contexts: {
    totalCount: 4,
    checkRunCount: 3,
    statusContextCount: 1,
    checkRunCountsByState: [{ state: "SUCCESS", count: 3 }],
    statusContextCountsByState: [{ state: "SUCCESS", count: 1 }],
    nodes: [
      {
        kind: "check_run",
        name: "supply-chain",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/1",
        title: null,
      },
      {
        kind: "check_run",
        name: "checks (24.x)",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/samebase/samebase/actions/runs/1/job/2",
        title: null,
      },
      {
        kind: "check_run",
        name: "Workers Builds: samebase",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl:
          "https://dash.cloudflare.com/account-1/workers/services/view/samebase/production/builds/build-1",
        title: "Workers Builds: samebase",
      },
      {
        kind: "status_context",
        context: "Cloudflare Workers",
        state: "SUCCESS",
        targetUrl: "https://dash.cloudflare.com/builds/legacy-1",
        description: "Deployment completed",
      },
    ],
  },
} satisfies NonNullable<FixturePullRequest["statusCheckRollup"]>;

const FIXTURE_DEFAULT_BRANCH_CHECKS = {
  headCommitOid: "81145b7d2a32186823452c7515b2d5ba2d79b350",
  headCommitTitle: "Keep repository provider observations explicit",
  headCommitCommittedAt: "2026-07-21T09:30:00Z",
  headCommitUrl:
    "https://github.com/samebase/samebase/commit/81145b7d2a32186823452c7515b2d5ba2d79b350",
  statusCheckRollup: FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP,
  checks: {
    ...FIXTURE_NO_CHECKS,
    state: "success",
    totalCount: 4,
    successCount: 4,
  },
} satisfies RepositoryDefaultBranchObservation;

const FIXTURE_SIDEBAR_SUMMARIES = {
  state: "loaded",
  summaries: SIDEBAR_LIST_REPOSITORIES.map((repository) => ({
    repositoryId: repository.repositoryId,
    openPullRequestCount: 3,
    checks: FIXTURE_DEFAULT_BRANCH_CHECKS.checks,
  })),
} satisfies RepositorySidebarSummariesState;

const FIXTURE_ROOT_SIDEBAR_SUMMARIES = {
  state: "loaded",
  summaries: SIDEBAR_LIST_REPOSITORIES.map((repository) => ({
    repositoryId: repository.repositoryId,
    openPullRequestCount: repository.githubRepositoryFullName === "noter/guestbook" ? 0 : 3,
    checks: FIXTURE_DEFAULT_BRANCH_CHECKS.checks,
  })),
} satisfies RepositorySidebarSummariesState;

function fixturePullRequest({
  index,
  labels = [],
  checks = FIXTURE_NO_CHECKS,
  statusCheckRollup = null,
  isDraft = false,
}: {
  index: number;
  labels?: FixturePullRequest["labels"];
  checks?: FixturePullRequest["checks"];
  statusCheckRollup?: FixturePullRequest["statusCheckRollup"];
  isDraft?: boolean;
}): FixturePullRequest {
  const number = 1_260 - index;
  const id = `pull-request:${number}`;
  const branchName = `codex/live-provider-truth-${String(index + 1).padStart(2, "0")}`;
  const headRefOid = (index + 1).toString(16).padStart(40, "0");

  return {
    id,
    number,
    title:
      index === 0
        ? "Show the exact preview for each pull request"
        : `Live provider update ${number}`,
    url: `https://github.com/samebase/samebase/pull/${number}`,
    isDraft,
    isCrossRepository: false,
    additions: 40 + index,
    deletions: 10 + index,
    changedFiles: 3 + index,
    updatedAt: new Date(FIXTURE_NOW - index * 60_000).toISOString(),
    baseRefName: "main",
    headRefName: branchName,
    headRefOid,
    headRepository: {
      id: "repository:samebase/samebase",
      nameWithOwner: "samebase/samebase",
      owner: { login: "samebase" },
    },
    labels,
    statusCheckRollup,
    checks,
  };
}

const LIST_SPACING_PULL_REQUESTS = [
  fixturePullRequest({
    index: 0,
    labels: [
      { name: "needs review", color: "bf8700" },
      { name: "customer", color: "1a7f37" },
    ],
    checks: {
      ...FIXTURE_NO_CHECKS,
      state: "success",
      totalCount: 4,
      successCount: 4,
    },
    statusCheckRollup: FIXTURE_SUCCESSFUL_STATUS_CHECK_ROLLUP,
  }),
  fixturePullRequest({
    index: 1,
    labels: [{ name: "research", color: "0969da" }],
    checks: {
      ...FIXTURE_NO_CHECKS,
      state: "running",
      totalCount: 3,
      successCount: 1,
      runningCount: 2,
    },
  }),
  fixturePullRequest({ index: 2, isDraft: true }),
];

type RepositoryOverviewProvisioningVisualMode = Extract<
  RepositoryOverviewVisualMode,
  | "repository-overview-v2-cloudflare-github-authorization-failed"
  | "repository-overview-v2-provisioning-source"
  | "repository-overview-v2-provisioning-github"
  | "repository-overview-v2-provisioning-early-empty"
  | "repository-overview-v2-provisioning-complete-empty"
  | "repository-overview-v2-provisioning-stale-empty"
  | "repository-overview-v2-provisioning-commit"
  | "repository-overview-v2-provisioning-ready"
>;

// Captured from a real Samebase-managed repository. The first five states occurred
// during provisioning. Reloading the stuck empty state exposed the commit, then the stack.
const PROVISIONING_RUN_ID = fakeRepositoryProvisioningRunId("repository-provisioning-run-fixture");
const PROVISIONING_ORGANIZATION = {
  canCreateRepository: true,
  githubOwnerId: "github-owner-nicu-chiciuc",
  githubOwnerLogin: "nicu-chiciuc",
  githubOwnerType: "user",
  organizationId: VISUAL_ORGANIZATION_ID,
  role: "owner",
} satisfies RepositoryOrganization;
const PROVISIONING_REPOSITORY = {
  ...LIST_SPACING_REPOSITORY,
  cloudflareAccountId: "fixture-cloudflare-account",
  convexTeamId: "38516",
  githubOwnerLogin: "nicu-chiciuc",
  githubRepositoryName: "tmp-f149-repository-loading-states",
  githubRepositoryFullName: "nicu-chiciuc/tmp-f149-repository-loading-states",
  cloudflareWorkers: [],
  convexProjects: [],
  providerPlan: {
    provisioning: "repository_actions",
    convexConfigPath: "convex.json",
    ciSecrets: { state: "written", writtenAt: FIXTURE_NOW, credentialRevision: 1 },
  },
} satisfies UserRepositoryResult;

/** The stack of the repository after its first deployment. */
const PROVISIONING_STACK_STORE = ((): RepositoryAlchemyState => {
  const stage = FIXTURE_STACKS.stacks[0].stages[1];
  return loadedStore({
    store: "found",
    liveDeployments: [],
    stacks: [
      {
        name: PROVISIONING_REPOSITORY.githubRepositoryFullName,
        stages: [
          {
            ...stage,
            resources: stage.resources
              .filter((resource) => resource.fqn === "Site")
              .map((resource) => ({
                ...resource,
                value: resource.value.replaceAll("clear-butterfly-858", "dazzling-pheasant-894"),
              })),
          },
        ],
      },
    ],
  });
})();

const PROVISIONING_DEFAULT_BRANCH = {
  headCommitOid: "e027945fddf37a983c3b44e88dcdb7d55ebe2109",
  headCommitTitle: "Initialize Samebase app",
  headCommitCommittedAt: "2026-07-25T15:40:42Z",
  headCommitUrl:
    "https://github.com/nicu-chiciuc/tmp-f149-repository-loading-states/commit/e027945fddf37a983c3b44e88dcdb7d55ebe2109",
  statusCheckRollup: null,
  checks: FIXTURE_NO_CHECKS,
} satisfies RepositoryDefaultBranchObservation;

const PROVISIONING_PLANNED_PROVIDER_PLAN = {
  convexConfigPath: "convex.json",
  convex: {
    state: "planned",
    projectName: "tmp-f149-repository-loading-states",
    deploymentRegion: "aws-eu-west-1",
    teamId: "38516",
  },
  cloudflare: {
    state: "planned",
    accountId: "fixture-cloudflare-account",
    buildTokenUuid: "fixture-build-token",
    workerName: "tmp-f149-repository-loading-states",
    rootDirectory: "/",
  },
} satisfies NonNullable<UserRepositoryResult["providerPlan"]>;

function fixturePullRequests(
  pullRequests: readonly FixturePullRequest[],
  defaultBranch: RepositoryDefaultBranchObservation | null,
  alchemyState: RepositoryAlchemyState = NO_STACK_STORE,
): Extract<RepositoryPullRequestsState, { state: "current" | "stale" }> {
  return {
    state: "current",
    defaultBranch,
    openPullRequestCount: pullRequests.length,
    refreshing: false,
    allPullRequests: [...pullRequests],
    resourcesByPullRequestId: new Map(
      pullRequests.map((pullRequest) => [
        pullRequest.id,
        alchemyState.state === "loaded"
          ? {
              state: "loaded",
              stackCards:
                alchemyState.observation.store === "found"
                  ? buildAlchemyStackCards({
                      stacks: alchemyState.observation,
                      stage: {
                        name: `pr-${pullRequest.number}`,
                        headCommit: pullRequest.headRefOid,
                      },
                    })
                  : [],
            }
          : { state: alchemyState.state },
      ]),
    ),
    loadMore: { state: "exhausted" },
  };
}

const AUTO_PAGINATION_PULL_REQUESTS = [
  ...LIST_SPACING_PULL_REQUESTS.slice(0, 2),
  ...Array.from({ length: 6 }, (_, index) => fixturePullRequest({ index: index + 3 })),
];

function buildFixtureWorkspace({
  alchemyState,
  githubRepositoryUrl,
  pullRequests,
  repository,
}: {
  alchemyState: RepositoryAlchemyState;
  githubRepositoryUrl: string;
  pullRequests: RepositoryPullRequestsState;
  repository: UserRepositoryResult;
}) {
  const workspace = {
    alchemyState,
    access: { state: "ready", accessKeys: ROLE_ACCESS_GRANTS.role_member },
    githubRepositoryUrl,
    productionCards:
      repository.defaultBranch &&
      alchemyState.state === "loaded" &&
      alchemyState.observation.store === "found"
        ? buildAlchemyStackCards({
            stacks: alchemyState.observation,
            stage: {
              name: "prod",
              headCommit:
                pullRequests.state === "current" || pullRequests.state === "stale"
                  ? (pullRequests.defaultBranch?.headCommitOid ?? null)
                  : null,
              branch: repository.defaultBranch,
              owner: repository.githubOwnerLogin,
              repoName: repository.githubRepositoryName,
              repository,
            },
          })
        : [],
    pullRequests,
    repository,
  } satisfies RepositoryWorkspaceSelected;

  return workspace;
}

function RepositoryOverviewProvisioningFixture({
  mode,
}: {
  mode: RepositoryOverviewProvisioningVisualMode;
}) {
  let repository: UserRepositoryResult;
  let pullRequests: RepositoryPullRequestsState;
  let alchemyState: RepositoryAlchemyState = NO_STACK_STORE;

  switch (mode) {
    case "repository-overview-v2-cloudflare-github-authorization-failed": {
      const githubRepositoryFullName = "noter-guest/tmp-testing-waters";
      const recoveryUrl =
        "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
      repository = {
        ...PROVISIONING_REPOSITORY,
        githubOwnerLogin: "noter-guest",
        githubRepositoryName: "tmp-testing-waters",
        githubRepositoryFullName,
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          runId: PROVISIONING_RUN_ID,
          step: "attach_worker",
          message: `Cloudflare Workers and Pages GitHub App is not authorized for ${githubRepositoryFullName}. Follow Cloudflare's recovery steps at ${recoveryUrl}: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages. GitHub gives this access to the Cloudflare Workers and Pages GitHub App, not to Samebase. Select All repositories so Cloudflare can connect repositories that Samebase creates later to Workers Builds, then retry.`,
          updatedAt: FIXTURE_NOW,
        },
      };
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      break;
    }
    case "repository-overview-v2-provisioning-source":
      repository = {
        ...PROVISIONING_REPOSITORY,
        defaultBranch: undefined,
        hasConnectedGitHubRepository: false,
        sourceSetup: {
          status: "running",
          runId: PROVISIONING_RUN_ID,
          step: "create_github_repository",
          updatedAt: FIXTURE_NOW,
        },
        providerSetup: { status: "not_applicable" },
      };
      pullRequests = { state: "not_requested" };
      alchemyState = { state: "loading" };
      break;
    case "repository-overview-v2-provisioning-github":
      repository = {
        ...PROVISIONING_REPOSITORY,
        sourceSetup: {
          status: "running",
          runId: PROVISIONING_RUN_ID,
          step: "sync_tree",
          updatedAt: FIXTURE_NOW,
        },
        providerSetup: { status: "not_applicable" },
      };
      pullRequests = { state: "loading" };
      alchemyState = { state: "loading" };
      break;
    case "repository-overview-v2-provisioning-early-empty":
      repository = {
        ...PROVISIONING_REPOSITORY,
        sourceSetup: { status: "ready" },
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          runId: PROVISIONING_RUN_ID,
          step: "attach_worker",
          updatedAt: FIXTURE_NOW,
        },
      };
      pullRequests = fixturePullRequests([], null);
      break;
    case "repository-overview-v2-provisioning-complete-empty":
      repository = PROVISIONING_REPOSITORY;
      pullRequests = fixturePullRequests([], null);
      break;
    case "repository-overview-v2-provisioning-stale-empty":
      repository = PROVISIONING_REPOSITORY;
      pullRequests = {
        ...fixturePullRequests([], null),
        state: "stale",
      };
      break;
    case "repository-overview-v2-provisioning-commit":
      repository = PROVISIONING_REPOSITORY;
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      alchemyState = { state: "loading" };
      break;
    case "repository-overview-v2-provisioning-ready":
      repository = PROVISIONING_REPOSITORY;
      pullRequests = fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH);
      alchemyState = PROVISIONING_STACK_STORE;
      break;
  }

  const workspace = buildFixtureWorkspace({
    alchemyState,
    githubRepositoryUrl: `https://github.com/${repository.githubRepositoryFullName}`,
    pullRequests,
    repository,
  });
  const sidebarSummaries = {
    state: "loaded",
    summaries: [
      {
        repositoryId: repository.repositoryId,
        openPullRequestCount: 0,
        checks: PROVISIONING_DEFAULT_BRANCH.checks,
      },
    ],
  } satisfies RepositorySidebarSummariesState;
  return (
    <TestRouterProvider initialEntries={[`/repo/${repository.githubRepositoryFullName}`]}>
      <SidebarLayoutFixtureFrame
        left={{
          header: <RepositoryOverviewListHeader />,
          content: (
            <RepositoryOverviewOrganizationSidebar
              {...FIXTURE_REPOSITORY_FOLDER_PROPS}
              organizations={[
                {
                  ...PROVISIONING_ORGANIZATION,
                  githubOwnerId: `github-owner-${repository.githubOwnerLogin}`,
                  githubOwnerLogin: repository.githubOwnerLogin,
                },
              ]}
              organizationsCollapsible
              page="overview"
              selectedRepositoryId={repository.repositoryId}
              sidebarSummaries={sidebarSummaries}
              repositories={[repository]}
              workspace={workspace}
            />
          ),
        }}
        main={{
          content: (
            <RepositoryOverviewPage
              developerToolsVisible={false}
              isRetryingRepositoryAction={false}
              page="overview"
              workspace={workspace}
              onOpenDeleteDialog={() => {}}
              onRetryInfrastructureProvisioning={() => {}}
              onRetryRepositoryDeletion={() => {}}
            />
          ),
        }}
        shortcutPaneSide="left"
      />
    </TestRouterProvider>
  );
}

function RepositoryOverviewActiveSettingsFixture() {
  const repository: UserRepositoryResult = {
    ...PROVISIONING_REPOSITORY,
    providerPlan: PROVISIONING_PLANNED_PROVIDER_PLAN,
    providerSetup: {
      status: "running",
      provider: "cloudflare",
      runId: PROVISIONING_RUN_ID,
      step: "attach_worker",
      updatedAt: FIXTURE_NOW,
    },
    providerWrite: {
      status: "active",
      owner: { kind: "managed_run" },
      lastWriteAt: {},
    },
    deletion: {
      state: "not_deleting",
      deleteAction: {
        state: "disabled",
        reason: "Repository setup is still running.",
      },
    },
  };
  const workspace = buildFixtureWorkspace({
    alchemyState: NO_STACK_STORE,
    githubRepositoryUrl: "https://github.com/nicu-chiciuc/tmp-f149-repository-loading-states",
    pullRequests: fixturePullRequests([], PROVISIONING_DEFAULT_BRANCH),
    repository,
  });

  return (
    <TestRouterProvider
      initialEntries={["/repo/nicu-chiciuc/tmp-f149-repository-loading-states/settings"]}
    >
      <SidebarLayoutFixtureFrame
        left={{
          header: <RepositoryOverviewListHeader />,
          content: (
            <RepositoryOverviewOrganizationSidebar
              {...FIXTURE_REPOSITORY_FOLDER_PROPS}
              organizations={[PROVISIONING_ORGANIZATION]}
              organizationsCollapsible
              page="settings"
              selectedRepositoryId={repository.repositoryId}
              sidebarSummaries={{
                state: "loaded",
                summaries: [
                  {
                    repositoryId: repository.repositoryId,
                    openPullRequestCount: 0,
                    checks: PROVISIONING_DEFAULT_BRANCH.checks,
                  },
                ],
              }}
              repositories={[repository]}
              workspace={workspace}
            />
          ),
        }}
        main={{
          content: (
            <RepositoryOverviewPage
              developerToolsVisible={false}
              isRetryingRepositoryAction={false}
              page="settings"
              workspace={workspace}
              onOpenDeleteDialog={() => {}}
              onRetryInfrastructureProvisioning={() => {}}
              onRetryRepositoryDeletion={() => {}}
            />
          ),
        }}
        shortcutPaneSide="left"
      />
    </TestRouterProvider>
  );
}

export function RepositoryOverviewVisualFixture({ mode }: { mode: RepositoryOverviewVisualMode }) {
  const [nextPullRequestPageLoaded, setNextPullRequestPageLoaded] = useState(false);
  const [organizationTreeSettings, setOrganizationTreeSettings] =
    useState<RepositoryOrganizationTreeSettings>([]);
  const page =
    mode === "repository-overview-v2-settings" || mode === "repository-overview-v2-settings-loading"
      ? "settings"
      : "overview";

  switch (mode) {
    case "repository-overview-v2-delete-dialog":
      return <RepositoryOverviewDialogsVisualFixture mode={mode} />;
    case "repository-overview-v2-cloudflare-github-authorization-failed":
    case "repository-overview-v2-provisioning-source":
    case "repository-overview-v2-provisioning-github":
    case "repository-overview-v2-provisioning-early-empty":
    case "repository-overview-v2-provisioning-complete-empty":
    case "repository-overview-v2-provisioning-stale-empty":
    case "repository-overview-v2-provisioning-commit":
    case "repository-overview-v2-provisioning-ready":
      return <RepositoryOverviewProvisioningFixture mode={mode} />;
    case "repository-overview-v2-settings-active":
      return <RepositoryOverviewActiveSettingsFixture />;
  }

  if (mode === "repository-overview-v2-root") {
    return (
      <TestRouterProvider initialEntries={["/repo"]}>
        <SidebarLayoutFixtureFrame
          main={{
            content: (
              <RepositoryOverviewPickerPane
                {...FIXTURE_REPOSITORY_FOLDER_PROPS}
                globalInventory
                organizations={VISUAL_ORGANIZATIONS}
                organizationTreeSettings={organizationTreeSettings}
                onSetRepositoryOrganizationCollapsed={async (setting) => {
                  setOrganizationTreeSettings((currentSettings) =>
                    currentSettings
                      .filter(
                        (currentSetting) =>
                          currentSetting.organizationId !== setting.organizationId,
                      )
                      .concat(setting),
                  );
                }}
                sidebarSummaries={FIXTURE_ROOT_SIDEBAR_SUMMARIES}
                repositories={SIDEBAR_LIST_REPOSITORIES}
              />
            ),
          }}
          shortcutPaneSide="left"
        />
      </TestRouterProvider>
    );
  }

  if (
    mode === "repository-overview-v2-loading" ||
    mode === "repository-overview-v2-settings-loading"
  ) {
    return (
      <TestRouterProvider initialEntries={["/repo/samebase/samebase"]}>
        <SidebarLayoutFixtureFrame
          left={{
            header: <RepositoryOverviewListHeader />,
            content: <RepositoryOverviewSidebarLoading />,
          }}
          main={{
            content: (
              <RepositoryOverviewLoadingPage owner="samebase" page={page} repoName="samebase" />
            ),
          }}
          shortcutPaneSide="left"
        />
      </TestRouterProvider>
    );
  }

  let alchemyState = NO_STACK_STORE;
  switch (mode) {
    case "repository-overview-v2-r2":
      alchemyState = loadedStore(FIXTURE_STACKS);
      break;
    case "repository-overview-v2-partial-loading":
      alchemyState = { state: "loading" };
      break;
    case "repository-overview-v2-store-unreadable":
      alchemyState = {
        state: "failed",
        error: new Error("Alchemy state is temporarily unavailable."),
        reload: () => {},
      };
      break;
    case "repository-overview-v2-store-missing":
      alchemyState = loadedStore({ store: "missing" });
      break;
    case "repository-overview-v2-no-convex":
      alchemyState = loadedStore({ store: "no_connection" });
      break;
  }
  const sourcePullRequests =
    mode === "repository-overview-v2-auto-pagination"
      ? AUTO_PAGINATION_PULL_REQUESTS.slice(0, nextPullRequestPageLoaded ? 8 : 6)
      : LIST_SPACING_PULL_REQUESTS;
  const currentPullRequests = fixturePullRequests(
    sourcePullRequests,
    FIXTURE_DEFAULT_BRANCH_CHECKS,
    alchemyState,
  );
  const pullRequests: RepositoryPullRequestsState =
    mode === "repository-overview-v2-auto-pagination"
      ? {
          ...currentPullRequests,
          openPullRequestCount: AUTO_PAGINATION_PULL_REQUESTS.length,
          loadMore: nextPullRequestPageLoaded
            ? { state: "exhausted" }
            : {
                state: "available",
                load: () => setNextPullRequestPageLoaded(true),
              },
        }
      : currentPullRequests;
  const workspace = buildFixtureWorkspace({
    alchemyState,
    githubRepositoryUrl: "https://github.com/samebase/samebase",
    pullRequests,
    repository: LIST_SPACING_REPOSITORY,
  });

  return (
    <SidebarLayoutFixtureFrame
      left={{
        header: <RepositoryOverviewListHeader />,
        content: (
          <RepositoryOverviewOrganizationSidebar
            {...FIXTURE_REPOSITORY_FOLDER_PROPS}
            organizations={VISUAL_ORGANIZATIONS}
            organizationsCollapsible
            page={page}
            selectedRepositoryId={LIST_SPACING_REPOSITORY_ID}
            sidebarSummaries={FIXTURE_SIDEBAR_SUMMARIES}
            repositories={SIDEBAR_LIST_REPOSITORIES}
            workspace={workspace}
          />
        ),
      }}
      main={{
        content: (
          <RepositoryOverviewPage
            developerToolsVisible={mode === "repository-overview-v2-dev"}
            isRetryingRepositoryAction={false}
            page={page}
            workspace={workspace}
            onOpenDeleteDialog={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryRepositoryDeletion={() => {}}
          />
        ),
      }}
      shortcutPaneSide="left"
    />
  );
}
