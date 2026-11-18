import { QueryClient, QueryClientContext } from "@tanstack/react-query";
import { type MouseEvent, useState } from "react";
import { PaneFrame } from "@samebase/sidebars/PaneFrame";
import { organizationGitHubIdentityQueryKey } from "@/organization/useOrganizationGitHubIdentity";
import { RepositoryOverviewPage } from "@/repository/dashboard/RepositoryOverviewPage";
import { RepositoryOverviewOrganizationSidebar } from "@/repository/dashboard/RepositoryOverviewSidebar";
import {
  type RepositoryOrganization,
  RepositoryOverviewListHeader,
} from "@/repository/dashboard/RepositoryOverviewPickerPane";
import { buildAlchemyStackCards } from "@/repository/dashboard/repositoryEnvironmentRoots";
import type { RepositoryWorkspaceSelected } from "@/repository/dashboard/repositoryWorkspaceModel";
import type {
  RepositoryDefaultBranchObservation,
  RepositoryPullRequest,
} from "@/repository/dashboard/useRepositoryPullRequests";
import type { Id, TableNames } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { ROLE_ACCESS_GRANTS } from "../../../shared/accessModel";
import type { AlchemyStateObservation } from "../../../shared/alchemyStateModel";
import type { RepositoryCheckSummary } from "../../../shared/repositoryChecks";

function exampleId<Table extends TableNames>(value: string): Id<Table> {
  // @ts-expect-error Convex ids are strings at runtime; the example is never sent to Convex.
  return value;
}

const ORGANIZATION = {
  canCreateRepository: true,
  githubOwnerId: "acme",
  githubOwnerLogin: "acme",
  githubOwnerType: "organization",
  organizationId: exampleId<"organizations">("example-organization-acme"),
  role: "owner",
} satisfies RepositoryOrganization;

function exampleRepository(name: string): UserRepositoryResult {
  return {
    repositoryId: exampleId<"repositories">(`example-repository-${name}`),
    organizationId: ORGANIZATION.organizationId,
    githubOwnerLogin: "acme",
    githubRepositoryName: name,
    githubRepositoryFullName: `acme/${name}`,
    defaultBranch: "main",
    fileCount: 18,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    providerPlan: null,
    providerWrite: { status: "idle", lastWriteAt: {} },
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "disabled", reason: "This repository is an example." },
    },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
  };
}

const PANTRY = exampleRepository("pantry");

/** The repositories of acme in the list, with the number of open pull requests of each. */
const REPOSITORY_LIST = [
  { repository: exampleRepository("garden"), openPullRequestCount: 1 },
  { repository: PANTRY, openPullRequestCount: 3 },
  { repository: exampleRepository("recipes"), openPullRequestCount: 0 },
  { repository: exampleRepository("website"), openPullRequestCount: 2 },
];

const PASSED_CHECKS = {
  state: "success",
  totalCount: 2,
  successCount: 2,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} satisfies RepositoryCheckSummary;

const PENDING_CHECKS = {
  ...PASSED_CHECKS,
  state: "running",
  successCount: 1,
  runningCount: 1,
} satisfies RepositoryCheckSummary;

const HEAD_COMMIT = "5d41402abc4b2a76b9719d911017c592ae2f7c3e";
const PRODUCTION_DEPLOYMENT = "tidy-otter-412";
const WORKER_URL = "https://pantry-barcode-lookup.acme.workers.dev";

/** The rows of `alchemy.run.ts` that the page reads, as Alchemy state of a Convex deployment. */
function convexDeploymentRow(type: "prod" | "preview", name: string) {
  return JSON.stringify({
    resourceType: "Convex.Deployment",
    props: { project: { projectId: 1001 }, type, rootDir: ".", source: { path: "./convex" } },
    attr: {
      projectId: 1001,
      name,
      url: `https://${name}.convex.cloud`,
      siteUrl: `https://${name}.convex.site`,
    },
    bindings: [],
  });
}

const BARCODE_LOOKUP_ROW = JSON.stringify({
  resourceType: "Cloudflare.Worker",
  attr: { workerName: "pantry-barcode-lookup", url: WORKER_URL, urls: [WORKER_URL], routes: [] },
});

const PULL_REQUESTS = [
  {
    number: 44,
    title: "Scan a barcode to add an item",
    branch: "barcode-scan",
    headCommit: "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d",
    hoursAgo: 3,
    isDraft: false,
    additions: 212,
    deletions: 18,
    changedFiles: 7,
    checks: PASSED_CHECKS,
    preview: "brave-heron-27",
  },
  {
    number: 43,
    title: "Warn three days before food expires",
    branch: "expiry-alerts",
    headCommit: "7c4a8d09ca3762af61e59520943dc26494f8941b",
    hoursAgo: 26,
    isDraft: false,
    additions: 64,
    deletions: 9,
    changedFiles: 3,
    checks: PENDING_CHECKS,
    preview: "quiet-lynx-305",
  },
  {
    number: 41,
    title: "Share the shopping list",
    branch: "shared-list",
    headCommit: "b6589fc6ab0dc82cf12099d1c2d40ab994e8410c",
    hoursAgo: 70,
    isDraft: true,
    additions: 131,
    deletions: 40,
    changedFiles: 5,
    checks: PASSED_CHECKS,
    preview: "sunny-wren-88",
  },
] as const;

/**
The selected repository `acme/pantry` at `now`: one production stack at pantry.acme.dev with a Convex
deployment and a Worker, and three open pull requests, each with its preview deployment. The page
shows times relative to the time of the render, so they are hours and days before `now`.
*/
function pantryWorkspace(now: number): RepositoryWorkspaceSelected {
  const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const run = {
    version: 1,
    repository: PANTRY.githubRepositoryFullName,
    stackFile: "alchemy.run.ts",
    branch: "main",
    pullRequest: null,
    headCommit: HEAD_COMMIT,
    runUrl: null,
    source: "github-actions",
    recordedAt: hoursAgo(50),
  } as const;
  const pullRequests = PULL_REQUESTS.map((pullRequest): RepositoryPullRequest => ({
    id: `pull-request:${pullRequest.number}`,
    number: pullRequest.number,
    title: pullRequest.title,
    url: `https://github.com/acme/pantry/pull/${pullRequest.number}`,
    isDraft: pullRequest.isDraft,
    isCrossRepository: false,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFiles: pullRequest.changedFiles,
    updatedAt: hoursAgo(pullRequest.hoursAgo),
    baseRefName: "main",
    headRefName: pullRequest.branch,
    headRefOid: pullRequest.headCommit,
    headRepository: {
      id: "repository:acme/pantry",
      nameWithOwner: "acme/pantry",
      owner: { login: "acme" },
    },
    labels: [],
    statusCheckRollup: null,
    checks: pullRequest.checks,
  }));
  const stacks = {
    store: "found",
    liveDeployments: [
      {
        deploymentName: PRODUCTION_DEPLOYMENT,
        dashboardUrl: `https://dashboard.convex.dev/t/acme/pantry/${PRODUCTION_DEPLOYMENT}`,
        region: "aws-us-east-1",
        customDomains: [{ domain: "pantry.acme.dev", requestDestination: "convexSite" }],
      },
    ],
    stacks: [
      {
        name: PANTRY.githubRepositoryFullName,
        store: "convex",
        stages: [
          ...PULL_REQUESTS.map((pullRequest) => ({
            name: `pr-${pullRequest.number}`,
            run: {
              ...run,
              branch: pullRequest.branch,
              pullRequest: pullRequest.number,
              headCommit: pullRequest.headCommit,
              recordedAt: hoursAgo(pullRequest.hoursAgo),
            },
            resources: [
              { fqn: "Site", value: convexDeploymentRow("preview", pullRequest.preview) },
            ],
            output: `{"url":"https://${pullRequest.preview}.convex.site"}`,
          })),
          {
            name: "prod",
            run,
            resources: [
              { fqn: "BarcodeLookup", value: BARCODE_LOOKUP_ROW },
              { fqn: "Site", value: convexDeploymentRow("prod", PRODUCTION_DEPLOYMENT) },
            ],
            output: '{"url":"https://pantry.acme.dev"}',
          },
        ],
      },
    ],
  } satisfies AlchemyStateObservation;
  const defaultBranch = {
    headCommitOid: HEAD_COMMIT,
    headCommitTitle: "Group items by shelf",
    headCommitCommittedAt: hoursAgo(50),
    headCommitUrl: `https://github.com/acme/pantry/commit/${HEAD_COMMIT}`,
    statusCheckRollup: null,
    checks: PASSED_CHECKS,
  } satisfies RepositoryDefaultBranchObservation;
  const accessKeys = ROLE_ACCESS_GRANTS.role_member;

  return {
    access: { state: "ready", accessKeys },
    alchemyState: { state: "loaded", observation: stacks, refreshFailed: false, reload: () => {} },
    githubRepositoryUrl: "https://github.com/acme/pantry",
    productionCards: buildAlchemyStackCards({
      stacks,
      stage: {
        name: "prod",
        headCommit: HEAD_COMMIT,
        branch: "main",
        owner: "acme",
        repoName: PANTRY.githubRepositoryName,
        schemaGraphEnabled: accessKeys.includes("access_schema_graph"),
        repository: PANTRY,
      },
    }),
    pullRequests: {
      state: "current",
      defaultBranch,
      openPullRequestCount: pullRequests.length,
      refreshing: false,
      allPullRequests: pullRequests,
      resourcesByPullRequestId: new Map(
        pullRequests.map((pullRequest) => [
          pullRequest.id,
          {
            state: "loaded",
            stackCards: buildAlchemyStackCards({
              stacks,
              stage: { name: `pr-${pullRequest.number}`, headCommit: pullRequest.headRefOid },
            }),
          },
        ]),
      ),
      loadMore: { state: "exhausted" },
    },
    repository: PANTRY,
  };
}

/**
The GitHub identity read of the organization, which the list and the page read through TanStack
Query. The client is given through `QueryClientContext`, not `QueryClientProvider`: the provider
mounts the client, and a mounted client refetches this read on window focus, which calls the Convex
action `observeOrganizationGitHubIdentity`. The client of the example is never mounted, so the
example sends no request.
*/
function exampleQueryClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(organizationGitHubIdentityQueryKey(ORGANIZATION.organizationId), {
    owner: { status: "current" },
    repositories: [],
  });
  return queryClient;
}

const noop = async () => {};

/**
Stops a click on a link of the example. Its links go to addresses that do not exist, such as
github.com/acme/pantry, or to pages of the dashboard that need an account. A menu or a popover of the
page is a portal, and React gives its clicks to this handler too.
*/
function stopExampleLink(event: MouseEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest("a")) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
The repository page of an example app, `acme/pantry`, made of the dashboard's own list of
repositories and repository page with example data. From the `@3xl` width of its container, the list
shows on the left at the default width of the left pane (240px,
`APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX`). The page has its own container, so it lays out for
its own width, as it does in its pane.

The page takes clicks: a pull request opens, and so do the checks and the menu of a deployment. Its
links do nothing, and Disconnect is disabled. The list is inert, because each of its controls goes to
another page of the dashboard or changes the account.
*/
export function RepositoryOverviewExample() {
  const [example] = useState(() => ({
    queryClient: exampleQueryClient(),
    workspace: pantryWorkspace(Date.now()),
  }));
  const { workspace } = example;

  return (
    <QueryClientContext.Provider value={example.queryClient}>
      <div className="@container">
        <div className="@3xl:grid @3xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="hidden border-r border-border @3xl:block" inert>
            <PaneFrame
              header={<RepositoryOverviewListHeader />}
              content={
                <RepositoryOverviewOrganizationSidebar
                  folderState={{ assignments: [], folders: [] }}
                  organizations={[ORGANIZATION]}
                  organizationsCollapsible
                  organizationTreeSettings={[]}
                  selectedRepositoryId={PANTRY.repositoryId}
                  sidebarSummaries={{
                    state: "loaded",
                    summaries: REPOSITORY_LIST.map(({ repository, openPullRequestCount }) => ({
                      repositoryId: repository.repositoryId,
                      openPullRequestCount,
                      checks: PASSED_CHECKS,
                    })),
                  }}
                  repositories={REPOSITORY_LIST.map(({ repository }) => repository)}
                  workspace={workspace}
                  onCreateRepositoryFolder={noop}
                  onDeleteRepositoryFolder={noop}
                  onMoveRepositoryFolder={noop}
                  onMoveRepositoryToFolder={noop}
                  onRenameRepositoryFolder={noop}
                  onSetRepositoryFolderCollapsed={noop}
                  onSetRepositoryOrganizationCollapsed={noop}
                />
              }
            />
          </div>
          {/* The page header is sticky in its pane. `overflow-hidden` makes this box its scroll
          container, so the header stays at the top of the example while the landing page scrolls. */}
          <div
            className="@container min-w-0 overflow-hidden"
            onAuxClickCapture={stopExampleLink}
            onClickCapture={stopExampleLink}
          >
            <RepositoryOverviewPage
              developerToolsVisible={false}
              isRetryingRepositoryAction={false}
              workspace={workspace}
              onOpenDeleteDialog={() => {}}
              onRetryInfrastructureProvisioning={() => {}}
              onRetryRepositoryDeletion={() => {}}
            />
          </div>
        </div>
      </div>
    </QueryClientContext.Provider>
  );
}
