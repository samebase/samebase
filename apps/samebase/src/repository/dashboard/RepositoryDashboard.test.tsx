// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  RepositoryPullRequest,
  RepositoryPullRequestsState,
} from "@/repository/dashboard/useRepositoryPullRequests";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationContext } from "@/organization/context";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type RepositoryOrganization,
  RepositoryOverviewPickerPane,
} from "./RepositoryOverviewPickerPane";
import { RepositoryOverviewPage } from "./RepositoryOverviewPage";
import {
  type RepositoryFolderCallbacks,
  RepositoryOverviewSidebar,
} from "./RepositoryOverviewSidebar";
import { PullRequestsSection } from "./RepositoryPullRequestsSection";
import { RepositorySettings } from "./RepositorySettings";
import { RepositoryDeleteDialogContent } from "./RepositoryDeleteDialog";
import {
  DefaultBranchSection,
  PullRequestResources,
  RepositoryEnvironmentTree,
} from "./RepositoryEnvironmentTree";
import { observedAlchemyStackReply } from "../../../convex/repository/fixtures/observedAlchemyState";
import { observedSamebaseStackReply } from "../../../convex/repository/fixtures/observedSamebaseAlchemyState";
import { observedScoutR2Resources } from "../../../convex/repository/fixtures/observedScoutR2Resources";
import {
  buildAlchemyStackCards,
  buildProductionEnvironmentRoots,
  buildPullRequestEnvironmentRoots,
} from "./repositoryEnvironmentRoots";
import type {
  RepositoryAlchemyStacks,
  RepositoryCloudflareProviderObservationState,
  RepositoryCloudflareWorkerBuildsObservation,
  RepositoryCloudflareWorkerConvexBuildAccessObservation,
  RepositoryCloudflareWorkerObservation,
} from "./useRepositoryProviderObservations";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { formatRepositorySourceSetupStep } from "./repositorySourceSetup";

const useOrganizationGitHubIdentitiesMock = vi.hoisted(() => vi.fn(() => new Map()));
const useActionMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/organization/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/organization/useOrganizationGitHubIdentity")>();
  return {
    ...actual,
    useOrganizationGitHubIdentities: useOrganizationGitHubIdentitiesMock,
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: useActionMock,
    useMutation: vi.fn(),
    useQuery: useQueryMock,
  };
});
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

const FOLDER_CALLBACKS = {
  onDeleteRepositoryFolder: async () => {},
  onMoveRepositoryFolder: async () => {},
  onMoveRepositoryToFolder: async () => {},
  onRenameRepositoryFolder: async () => {},
  onSetRepositoryFolderCollapsed: async () => {},
} satisfies RepositoryFolderCallbacks;

const REPOSITORY_PICKER_FOLDER_PROPS = {
  ...FOLDER_CALLBACKS,
  folderState: { assignments: [], folders: [] },
  onCreateRepositoryFolder: async () => {},
  onSetRepositoryOrganizationCollapsed: async () => {},
  organizationTreeSettings: [],
};

function fakeRepositoryId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable repository id for the query args.
  return value;
}

function fakeOrganizationId(value = "organization-samebase"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable organization id.
  return value;
}

function fakeCloudflareWorkerId(value = "worker-root"): Id<"repositoryCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeConvexProjectId(value = "convex-project-root"): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeRunId(): Id<"workflow_repositoryProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable run id for component props.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeDeletionRunId(): Id<"workflow_repositoryDeletion_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable run id for component props.
  return "mx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

type RepositorySettingsBuilderRepository = UserRepositoryResult;
type RepositorySettingsCloudflareWorker =
  RepositorySettingsBuilderRepository["cloudflareWorkers"][number];
type RepositorySettingsConvexProject =
  RepositorySettingsBuilderRepository["convexProjects"][number];
type AvailableRepositorySettingsCloudflareObservation = Extract<
  RepositoryCloudflareWorkerObservation,
  { state: "available" }
>;
type AvailableRepositorySettingsCloudflareBuildsObservation = Extract<
  RepositoryCloudflareWorkerBuildsObservation,
  { state: "available" }
>;
function makeRepositorySettingsCloudflareWorker(
  overrides: Partial<RepositorySettingsCloudflareWorker>,
): RepositorySettingsCloudflareWorker {
  return {
    workerId: fakeCloudflareWorkerId(),
    accountId: "account-1",
    workerName: "demo-worker",
    workerTag: "demo-worker-tag",
    rootDirectory: "/",
    ...overrides,
  };
}

function makeAvailableRepositorySettingsCloudflareObservation(
  overrides: Partial<AvailableRepositorySettingsCloudflareObservation> & {
    workerId: Id<"repositoryCloudflareWorkers">;
  },
): AvailableRepositorySettingsCloudflareObservation {
  return {
    state: "available",
    workerName: "demo-worker",
    customDomains: [],
    workersDev: { state: "enabled", url: "https://demo-worker.ada.workers.dev" },
    ...overrides,
  };
}

function makeAvailableRepositorySettingsCloudflareBuildsObservation(
  overrides: Partial<AvailableRepositorySettingsCloudflareBuildsObservation> & {
    workerId: Id<"repositoryCloudflareWorkers">;
  },
): AvailableRepositorySettingsCloudflareBuildsObservation {
  return {
    state: "available",
    repository: {
      state: "ready",
      rootDirectory: "/",
      builds: { state: "not_available" },
    },
    builds: { state: "not_connected" },
    productionBuild: { state: "absent" },
    ...overrides,
  };
}

function makeLoadedCloudflareObservations({
  workers,
  builds,
  convexBuildAccess,
}: {
  workers: readonly RepositoryCloudflareWorkerObservation[];
  builds: readonly RepositoryCloudflareWorkerBuildsObservation[];
  convexBuildAccess: readonly RepositoryCloudflareWorkerConvexBuildAccessObservation[];
}): RepositoryCloudflareProviderObservationState {
  return {
    workers: {
      state: "loaded",
      refreshFailed: false,
      reload: () => {},
      observations: workers,
    },
    builds: {
      state: "loaded",
      refreshFailed: false,
      reload: () => {},
      observations: builds,
    },
    convexBuildAccess: {
      state: "loaded",
      refreshFailed: false,
      reload: () => {},
      observations: convexBuildAccess,
    },
  };
}

function makeRepositorySettingsConvexProject(
  overrides: Partial<RepositorySettingsConvexProject>,
): RepositorySettingsConvexProject {
  return {
    convexProjectId: fakeConvexProjectId(),
    codeLocation: { kind: "config", convexConfigPath: "convex.json" },
    teamId: "team-1",
    projectId: "demo-project-id",
    ...overrides,
  };
}

function makeRepositorySettingsBuilderRepository(
  overrides: Partial<RepositorySettingsBuilderRepository>,
): RepositorySettingsBuilderRepository {
  const repository: RepositorySettingsBuilderRepository = {
    repositoryId: fakeRepositoryId(),
    organizationId: fakeOrganizationId(),
    convexTeamId: "team-1",
    cloudflareAccountId: "account-1",
    githubOwnerLogin: "ada",
    githubRepositoryName: "demo",
    githubRepositoryFullName: "ada/demo",
    defaultBranch: "main",
    fileCount: 0,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "not_applicable" },
    providerPlan: null,
    providerWrite: { status: "idle", lastWriteAt: {} },
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "available" },
    },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    hasCloudflareProvision: false,
    cloudflareWorkers: [],
    convexProjects: [],
  };
  return { ...repository, ...overrides };
}

describe("buildProductionEnvironmentRoots", () => {
  it("shows production builds without the legacy preview setup", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const repository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [
        makeRepositorySettingsCloudflareWorker({ workerId, rootDirectory: "apps/web" }),
      ],
      convexProjects: [
        makeRepositorySettingsConvexProject({
          convexProjectId,
          codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
        }),
      ],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      repository,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId,
            customDomains: ["www.example.com", "app.example.com"],
          }),
        ],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId,
            repository: {
              state: "ready",
              rootDirectory: "apps/web",
              builds: { state: "not_available" },
            },
            builds: { state: "not_connected" },
            productionBuild: {
              state: "available",
              buildState: "success",
              commitHash: null,
              logsUrl:
                "https://dash.cloudflare.com/account-1/workers/services/view/demo-worker/production/builds/build-1",
            },
          }),
        ],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [
          {
            convexProjectId,
            projectId: "demo-project-id",
            codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
            source: { kind: "config", state: "valid" },
            provider: {
              state: "current",
              projectSlug: "demo",
              teamSlug: "ada",
              productionDeployment: {
                state: "available",
                deploymentName: "calm-swan-123",
                dashboardUrl: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
                region: "aws-eu-west-1",
              },
            },
          },
        ],
      },
      owner: "ada",
      repoName: "demo",
      schemaGraphEnabled: true,
    });

    expect(roots).toEqual([
      {
        rootDirectory: "apps/web",
        resources: [
          {
            kind: "cloudflare_worker",
            id: workerId,
            worker: {
              workerName: "demo-worker",
              build: {
                state: "available",
                buildState: "success",
                logsUrl:
                  "https://dash.cloudflare.com/account-1/workers/services/view/demo-worker/production/builds/build-1",
              },
              destination: {
                state: "available",
                href: "https://app.example.com",
                label: "app.example.com",
                provenance: "production",
                title: "Open production app for apps/web",
              },
              actions: [
                {
                  destination: "external",
                  href: "https://www.example.com",
                  label: "www.example.com",
                },
                {
                  destination: "external",
                  href: "https://demo-worker.ada.workers.dev",
                  label: "demo-worker.ada.workers.dev",
                },
              ],
            },
          },
          {
            kind: "destination",
            id: "convex:https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
            actions: [
              {
                destination: "samebase",
                href: `/repo/ada/demo/db/main/project/${convexProjectId}`,
                label: "Data",
              },
              {
                destination: "samebase",
                href: `/repo/ada/demo/schema/main/project/${convexProjectId}`,
                label: "Schema",
              },
              {
                destination: "samebase",
                href: `/repo/ada/demo/components/calm-swan-123`,
                label: "Components",
              },
            ],
            href: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
            label: "calm-swan-123",
            provider: "convex",
            provenance: "production",
            region: "aws-eu-west-1",
            title: "Open production Convex deployment calm-swan-123",
          },
        ],
      },
    ]);
  });

  it("keeps custom domains visible when workers.dev is disabled and builds are unavailable", () => {
    const workerId = fakeCloudflareWorkerId();
    const repository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      repository,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId,
            customDomains: ["app.example.com"],
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId,
            productionBuild: { state: "unavailable", reasons: ["request_failed"] },
          }),
        ],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      owner: "ada",
      repoName: "demo",
      schemaGraphEnabled: true,
    });

    expect(roots).toEqual([
      {
        rootDirectory: "/",
        resources: [
          {
            kind: "cloudflare_worker",
            id: workerId,
            worker: {
              workerName: "demo-worker",
              build: { state: "unavailable" },
              destination: {
                state: "available",
                href: "https://app.example.com",
                label: "app.example.com",
                provenance: "production",
                title: "Open production app",
              },
              actions: [],
            },
          },
        ],
      },
    ]);
  });

  it("keeps attached Workers visible before they have a production destination", () => {
    const workerId = fakeCloudflareWorkerId();
    const repository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      repository,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId,
            customDomains: [],
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [makeAvailableRepositorySettingsCloudflareBuildsObservation({ workerId })],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      owner: "ada",
      repoName: "demo",
      schemaGraphEnabled: true,
    });

    expect(roots).toEqual([
      {
        rootDirectory: "/",
        resources: [
          {
            kind: "cloudflare_worker",
            id: workerId,
            worker: {
              workerName: "demo-worker",
              build: { state: "absent" },
              destination: { state: "absent" },
              actions: [],
            },
          },
        ],
      },
    ]);
  });

  it("keeps every attached Worker visible when live checks return partial failures", () => {
    const readyWorkerId = fakeCloudflareWorkerId("worker-ready");
    const failedWorkerId = fakeCloudflareWorkerId("worker-failed");
    const convexProjectId = fakeConvexProjectId();
    const repository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [
        makeRepositorySettingsCloudflareWorker({ workerId: readyWorkerId }),
        makeRepositorySettingsCloudflareWorker({
          workerId: failedWorkerId,
          workerName: "samebase-worker",
          workerTag: "samebase-worker-tag",
          rootDirectory: "apps/samebase",
        }),
      ],
      convexProjects: [makeRepositorySettingsConvexProject({ convexProjectId })],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      repository,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({ workerId: readyWorkerId }),
          { state: "failed", workerId: failedWorkerId, reason: "request_failed" },
        ],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId: readyWorkerId,
          }),
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId: failedWorkerId,
            repository: {
              state: "ready",
              rootDirectory: "apps/moved",
              builds: { state: "not_available" },
            },
            builds: {
              state: "connected",
              productionBuildTokenUuid: "samebase-build-token",
              previewBuildTokenUuid: "samebase-build-token",
            },
            productionBuild: {
              state: "available",
              buildState: "success",
              commitHash: null,
              logsUrl: "https://dash.cloudflare.com/samebase-build",
            },
          }),
        ],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [
          {
            convexProjectId,
            projectId: "demo-project-id",
            codeLocation: { kind: "config", convexConfigPath: "convex.json" },
            source: { kind: "config", state: "valid" },
            provider: { state: "missing_ambiguous" },
          },
        ],
      },
      owner: "ada",
      repoName: "demo",
      schemaGraphEnabled: true,
    });

    expect(roots).toEqual([
      {
        rootDirectory: "/",
        resources: [
          {
            kind: "cloudflare_worker",
            id: readyWorkerId,
            worker: {
              workerName: "demo-worker",
              build: { state: "absent" },
              destination: {
                state: "available",
                href: "https://demo-worker.ada.workers.dev",
                label: "demo-worker.ada.workers.dev",
                provenance: "production",
                title: "Open production app",
              },
              actions: [],
            },
          },
        ],
      },
      {
        rootDirectory: "apps/samebase",
        resources: [
          {
            kind: "cloudflare_worker",
            id: failedWorkerId,
            worker: {
              workerName: "samebase-worker",
              build: {
                state: "available",
                buildState: "success",
                logsUrl: "https://dash.cloudflare.com/samebase-build",
              },
              destination: { state: "absent" },
              actions: [],
            },
          },
        ],
      },
    ]);
  });
});

/**
The stacks as `reader:repository` returns the captured stage `prod` of samebase/base-alchemy,
with the `rootDir` "." on its Deployment row that @samebase/alchemy-convex 0.8.0 writes for a stack
file at the repository root.
*/
function observedBaseAlchemyStack(): RepositoryAlchemyStacks {
  const [, , prod] = observedAlchemyStackReply.value.stages;
  return {
    store: "found",
    liveDeployments: [
      {
        deploymentName: "ideal-dolphin-15",
        dashboardUrl: "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
        region: "aws-us-east-1",
        customDomains: [],
      },
    ],
    stacks: [
      {
        name: "samebase/base-alchemy",
        stages: [
          {
            name: prod.stage,
            record: {
              version: 1,
              repository: "samebase/base-alchemy",
              stackFile: "alchemy.run.ts",
              branch: "main",
              pullRequest: null,
              headCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
              runUrl:
                "https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1",
              source: "github-actions",
              recordedAt: "2026-10-21T19:58:06.882Z",
            },
            deployedHeadCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
            resources: prod.resources.map((resource) => ({
              fqn: resource.fqn,
              value: resource.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
            })),
            output: '{"url":"https://ideal-dolphin-15.convex.site"}',
          },
        ],
      },
    ],
  };
}

/**
The stacks of samebase/samebase after the move of its stack to the repository root: the captured
`prod` and `pr-1768` stages of the stack samebase/samebase, and a stack of the folder
apps/sidebars-example. The `prod` record is the captured one with the stack file and commit that the
first push after the move writes, and its Site row the captured one with the `rootDir` that the
captured `pr-1768` row holds. Its PosthogProxy row is the captured one with the `main` that the root
stack writes, in apps/samebase. Its Domains row keeps the captured `main`, which is relative to
apps/samebase and leaves the repository from the root. The sidebars stack has no row yet, so its
Worker is the captured PosthogProxy row renamed.
*/
function samebaseStacksAfterTheMove(): RepositoryAlchemyStacks {
  const [, , prod] = observedSamebaseStackReply.value.stages;
  const record = {
    version: 1 as const,
    repository: "samebase/samebase",
    stackFile: "alchemy.run.ts",
    branch: "main",
    pullRequest: null,
    headCommit: "1592243a49970f5c5142009b7ca7b2d71d31f104",
    runUrl: "https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1",
    source: "github-actions" as const,
    recordedAt: "2026-10-22T08:22:58.152Z",
  };
  const rowOf = (fqn: string) => {
    const row = prod.resources.find((resource) => resource.fqn === fqn);
    if (!row) {
      throw new Error(`Expected the captured ${fqn} row.`);
    }
    return row;
  };
  const site = rowOf("Site");
  const proxy = rowOf("PosthogProxy");
  return {
    store: "found",
    liveDeployments: [],
    stacks: [
      {
        name: "samebase/samebase",
        stages: [
          {
            name: "prod",
            record,
            deployedHeadCommit: record.headCommit,
            resources: [
              rowOf("Domains"),
              {
                fqn: "PosthogProxy",
                value: proxy.value.replace(
                  '"main":"../posthog-proxy/src/index.ts"',
                  '"main":"apps/samebase/workers/posthog-proxy/index.ts"',
                ),
              },
              rowOf("Project"),
              {
                fqn: "Site",
                value: site.value.replace(
                  '"type":"prod"',
                  '"type":"prod","rootDir":"apps/samebase"',
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
              {
                fqn: "Site",
                value: proxy.value.replaceAll(
                  "samebase-posthog-proxy",
                  "samebase-monorepo-sidebars-example",
                ),
              },
            ],
            output: "{}",
          },
        ],
      },
    ],
  };
}

/** The stacks of samebase/samebase after the move, with `replace` applied to every row. */
function samebaseStacksWithRows(replace: (value: string) => string): RepositoryAlchemyStacks {
  const stacks = samebaseStacksAfterTheMove();
  return {
    ...stacks,
    stacks: stacks.stacks.map((stack) => ({
      ...stack,
      stages: stack.stages.map((stage) => ({
        ...stage,
        resources: stage.resources.map((resource) => ({
          fqn: resource.fqn,
          value: replace(resource.value),
        })),
      })),
    })),
  };
}

/** The cards of `stacks` for `repository` on the default branch `main` at `headCommit`. */
function stackCardsOf(
  stacks: RepositoryAlchemyStacks,
  repository: RepositorySettingsBuilderRepository,
  headCommit: string | null,
) {
  return buildAlchemyStackCards({
    stacks,
    stage: {
      name: "prod",
      headCommit,
      branch: "main",
      owner: repository.githubOwnerLogin,
      repoName: repository.githubRepositoryName,
      schemaGraphEnabled: true,
      repository,
    },
  });
}

/**
The default-branch block of `repository` with the stacks of the team store while the GitHub
pull-request query loads, and its stack cards for the head `headCommit` without the relative times
of their runs.
*/
function renderStackCards(
  stacks: RepositoryAlchemyStacks,
  repository: RepositorySettingsBuilderRepository,
  headCommit: string | null,
) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <TestRouterProvider initialEntries={[`/repo/${repository.githubRepositoryFullName}`]}>
      <DefaultBranchSection
        filesReadEnabled={false}
        workspace={{
          access: { state: "ready", accessKeys: [] },
          alchemyObservations: {
            state: "loaded",
            observations: [stacks],
            refreshFailed: false,
            reload: () => {},
          },
          alchemyState: {
            state: "loaded",
            observation: stacks,
            refreshFailed: false,
            reload: () => {},
          },
          cloudflareConnection: { state: "loading" },
          cloudflareObservations: {
            workers: { state: "loading" },
            builds: { state: "loading" },
            convexBuildAccess: { state: "loading" },
          },
          convexObservations: { state: "loading" },
          githubRepositoryUrl: `https://github.com/${repository.githubRepositoryFullName}`,
          production: { source: "stacks", cards: stackCardsOf(stacks, repository, headCommit) },
          pullRequests: { state: "loading" },
          repository,
        }}
      />
    </TestRouterProvider>,
  );
  for (const time of container.querySelectorAll("time")) {
    time.remove();
  }
  return {
    section: container,
    cards: [...container.querySelectorAll('[aria-label^="Alchemy stack "]')],
  };
}

describe("Alchemy stack cards", () => {
  it("builds a card from the stage prod of the stack while the GitHub pull-request query loads", () => {
    // Like the preview deployment of Samebase: the repository has no attachment rows.
    const repository = makeRepositorySettingsBuilderRepository({
      githubOwnerLogin: "samebase",
      githubRepositoryName: "base-alchemy",
      githubRepositoryFullName: "samebase/base-alchemy",
      convexTeamId: "38516",
    });
    const stacks = observedBaseAlchemyStack();

    expect(stackCardsOf(stacks, repository, null)).toEqual([
      {
        stack: "samebase/base-alchemy",
        stackFile: "alchemy.run.ts",
        // The only stack of the repository shows without its root folder.
        folder: null,
        // The GitHub pull-request query loads, so the head is not known and no run line shows.
        run: null,
        address: {
          href: "https://ideal-dolphin-15.convex.site",
          label: "ideal-dolphin-15.convex.site",
        },
        addressWorker: null,
        resources: [
          {
            kind: "destination",
            id: "alchemy:samebase/base-alchemy:Deployment",
            // The Data route resolves the Convex project id through the stack, with no attachment.
            actions: [
              {
                destination: "samebase",
                href: "/repo/samebase/base-alchemy/db/main/project/3245938",
                label: "Data",
              },
              {
                destination: "samebase",
                href: "/repo/samebase/base-alchemy/components/ideal-dolphin-15",
                label: "Components",
              },
            ],
            href: "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
            label: "ideal-dolphin-15",
            provider: "convex",
            provenance: "stack",
            region: "aws-us-east-1",
            title: "Open Convex deployment ideal-dolphin-15",
          },
        ],
      },
    ]);
    const { section, cards } = renderStackCards(stacks, repository, null);
    expect(section.querySelector("section")?.getAttribute("aria-label")).toBe(
      "Default branch main",
    );
    expect(section.querySelectorAll('[aria-label="Loading default branch commit"]')).toHaveLength(
      1,
    );
    expect(cards.map((card) => card.textContent)).toEqual([
      "ideal-dolphin-15.convex.siteideal-dolphin-15🇺🇸US East (N. Virginia)",
    ]);
    expect(
      [...section.querySelectorAll("a")].map((link) => [
        link.textContent,
        link.getAttribute("href"),
      ]),
    ).toEqual([
      ["main", "https://github.com/samebase/base-alchemy/tree/main"],
      ["ideal-dolphin-15.convex.site", "https://ideal-dolphin-15.convex.site"],
      ["ideal-dolphin-15", "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15"],
    ]);
    const region = section.querySelector('[title="US East (N. Virginia)"]');
    expect(region?.querySelector('[aria-hidden="true"]')?.textContent).toBe("🇺🇸");
    expect(region?.querySelector(".sr-only")?.textContent).toBe("US East (N. Virginia)");
  });

  it("shows one card for each stack with its folder and rows without type labels", () => {
    const { cards } = renderStackCards(
      samebaseStacksAfterTheMove(),
      makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      "1592243a49970f5c5142009b7ca7b2d71d31f104",
    );

    expect(cards.map((card) => [card.getAttribute("aria-label"), card.textContent])).toEqual([
      [
        "Alchemy stack samebase/samebase",
        "/clear-butterfly-858.convex.sitesamebase-domains*.json.mdsamebase-posthog-proxye.samebase.comclear-butterfly-858",
      ],
      [
        "Alchemy stack samebase/samebase/apps/sidebars-example",
        "apps/sidebars-examplesamebase-monorepo-sidebars-examplee.samebase.com",
      ],
    ]);
  });

  it.each([
    ["alchemy.run.ts", ""],
    ["infrastructure/alchemy.run.ts", "infrastructure"],
  ])("shows the R2 buckets of %s and links their Cloudflare dashboard", (stackFile, folder) => {
    const stacks = observedBaseAlchemyStack();
    const { cards } = renderStackCards(
      {
        ...stacks,
        stacks: stacks.stacks.map((stack) => ({
          name: "samebase/scout",
          stages: stack.stages.map((stage) => ({
            ...stage,
            record: { ...stage.record, stackFile },
            resources: observedScoutR2Resources,
          })),
        })),
      },
      makeRepositorySettingsBuilderRepository({}),
      null,
    );

    expect(cards.map((card) => card.textContent)).toEqual([
      `${folder}scout-public-mediascout-workspacesscout-workspaces-prod`,
    ]);
    expect(
      [...cards[0].querySelectorAll('a[title^="Open R2 bucket"]')].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-public-media",
      "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-workspaces",
      "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-workspaces-prod",
    ]);
  });

  it.each([
    ["on", "Google sign-in: on"],
    ["off", "Google sign-in: not set up"],
    ["suspended", "Google sign-in: suspended"],
  ])("shows a shared hub client that is %s as the last row of its card", (status, line) => {
    const stacks = observedBaseAlchemyStack();
    const { cards } = renderStackCards(
      {
        ...stacks,
        stacks: stacks.stacks.map((stack) => ({
          name: "samebase/scout",
          stages: stack.stages.map((stage) => ({
            ...stage,
            record: { ...stage.record, stackFile: "alchemy.run.ts" },
            resources: [
              {
                fqn: "Client",
                value: JSON.stringify({
                  resourceType: "IdentityHub.SharedClient",
                  attr: { status, clientId: "client-id" },
                }),
              },
              ...observedScoutR2Resources,
            ],
          })),
        })),
      },
      makeRepositorySettingsBuilderRepository({}),
      null,
    );

    expect(cards.map((card) => card.textContent)).toEqual([
      `scout-public-mediascout-workspacesscout-workspaces-prod${line}`,
    ]);
  });

  it("links the Workers of samebase/samebase without URLs to their routes", () => {
    // The captured Domains and PosthogProxy rows: no custom domain and no workers.dev URL.
    const cards = stackCardsOf(
      samebaseStacksAfterTheMove(),
      makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      null,
    );

    expect(
      cards
        .filter((card) => card.stack === "samebase/samebase")
        .flatMap((card) =>
          card.resources.flatMap((resource) =>
            resource.kind === "cloudflare_worker"
              ? [
                  {
                    workerName: resource.worker.workerName,
                    destination: resource.worker.destination,
                    actions: resource.worker.actions,
                  },
                ]
              : [],
          ),
        ),
    ).toEqual([
      {
        workerName: "samebase-domains",
        destination: { state: "unlinked", label: "*.json.md" },
        actions: [{ destination: "none", label: "*.xml.md" }],
      },
      {
        workerName: "samebase-posthog-proxy",
        destination: {
          state: "available",
          href: "https://e.samebase.com/",
          label: "e.samebase.com",
          provenance: "stack",
          title: "Open samebase-posthog-proxy",
        },
        actions: [],
      },
    ]);
  });

  it("links a route that covers a path of its host to that path", () => {
    // The captured PosthogProxy row with a second route on a path of its host. Alchemy gives every
    // route of the host the same url, the origin.
    const cards = stackCardsOf(
      samebaseStacksWithRows((value) =>
        value.replace(
          '"url":"https://e.samebase.com"}]',
          '"url":"https://e.samebase.com"},{"id":"static","pattern":"e.samebase.com/static/*","zoneId":"2f2e7713e926a7282b25796b02826f02","url":"https://e.samebase.com"}]',
        ),
      ),
      makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      null,
    );

    expect(
      cards.flatMap((card) =>
        card.resources.flatMap((resource) =>
          resource.kind === "cloudflare_worker" &&
          resource.worker.workerName === "samebase-posthog-proxy"
            ? [resource.worker.actions]
            : [],
        ),
      ),
    ).toEqual([
      [
        {
          destination: "external",
          href: "https://e.samebase.com/static/",
          label: "e.samebase.com/static/",
        },
      ],
    ]);
  });

  it("shows no Convex deployment for a row without rootDir", () => {
    // The captured `prod` of samebase/samebase: its Site row has no rootDir, so only the Workers
    // show, and they serve at no URL.
    const [, , prod] = observedSamebaseStackReply.value.stages;
    const cards = stackCardsOf(
      {
        store: "found",
        liveDeployments: [],
        stacks: [
          {
            name: "samebase/samebase",
            stages: [
              {
                name: prod.stage,
                record: {
                  version: 1,
                  repository: "samebase/samebase",
                  stackFile: "apps/samebase/alchemy.run.ts",
                  branch: "main",
                  pullRequest: null,
                  headCommit: "1592243a49970f5c5142009b7ca7b2d71d31f104",
                  runUrl:
                    "https://github.com/samebase/samebase/actions/runs/39746887572/attempts/1",
                  source: "github-actions",
                  recordedAt: "2026-10-22T08:22:58.152Z",
                },
                deployedHeadCommit: "1592243a49970f5c5142009b7ca7b2d71d31f104",
                resources: prod.resources,
                output: '{"url":"https://clear-butterfly-858.convex.site"}',
              },
            ],
          },
        ],
      },
      makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      null,
    );

    expect(
      cards.map((card) => [
        card.folder,
        card.address,
        card.resources.map((resource) => resource.kind),
      ]),
    ).toEqual([["apps/samebase", null, ["cloudflare_worker", "cloudflare_worker"]]]);
  });

  it("routes a Convex deployment of the store through its attachment row when one exists", () => {
    const convexProjectId = fakeConvexProjectId("convex-project-base-alchemy");
    const cards = stackCardsOf(
      observedBaseAlchemyStack(),
      makeRepositorySettingsBuilderRepository({
        githubOwnerLogin: "samebase",
        githubRepositoryName: "base-alchemy",
        githubRepositoryFullName: "samebase/base-alchemy",
        convexTeamId: "38516",
        convexProjects: [
          makeRepositorySettingsConvexProject({
            convexProjectId,
            teamId: "38516",
            projectId: "3245938",
          }),
        ],
      }),
      null,
    );

    expect(
      cards.flatMap((card) =>
        card.resources.flatMap((resource) =>
          resource.kind === "destination" ? resource.actions.map((action) => action.href) : [],
        ),
      ),
    ).toEqual([
      "/repo/samebase/base-alchemy/db/main/project/convex-project-base-alchemy",
      "/repo/samebase/base-alchemy/schema/main/project/convex-project-base-alchemy",
      "/repo/samebase/base-alchemy/components/ideal-dolphin-15",
    ]);
  });

  it("shows the URL of a Worker-only stack once, as its address", () => {
    // The `main` Worker row measured in research/2026-10-21-alchemy-state-rows-for-workers-and-convex.md.
    const worker =
      '{"status":"created","fqn":"Worker","logicalId":"Worker","instanceId":"4fb5acd8a74d8a46633a8e57084e0bc1","resourceType":"Cloudflare.Worker","props":{"name":"tmp-k7m2-rows","main":"./worker.ts","env":{"CONVEX_URL":"https://modest-guanaco-252.convex.cloud"},"isExternal":true},"attr":{"workerId":"6d2434039c4343a9a02300ba85841b70","workerName":"tmp-k7m2-rows","logpush":false,"url":"https://tmp-k7m2-rows.pfp.workers.dev","urls":["https://tmp-k7m2-rows.pfp.workers.dev"],"tags":["alchemy:stack:samebase/tmp-k7m2-rows","alchemy:stage:main","alchemy:id:Worker"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[],"crons":[],"tailConsumers":[],"hash":{"bundle":"b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85","metadata":"6692e8262512d066c344158cd4e091a1287954eb8b43208b87b336715b99bb65"}},"bindings":[{"sid":"CONVEX_URL","data":{"bindings":[{"type":"plain_text","name":"CONVEX_URL","text":"https://modest-guanaco-252.convex.cloud"}]}}],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}';
    const stacksWith = (value: string): RepositoryAlchemyStacks => ({
      store: "found",
      liveDeployments: [],
      stacks: [
        {
          name: "samebase/tmp-k7m2-rows",
          stages: [
            {
              name: "prod",
              record: {
                version: 1,
                repository: "samebase/tmp-k7m2-rows",
                stackFile: "alchemy.run.ts",
                branch: "main",
                pullRequest: null,
                headCommit: "a".repeat(40),
                runUrl: null,
                source: "laptop",
                recordedAt: "2026-10-21T12:00:00.000Z",
              },
              deployedHeadCommit: "a".repeat(40),
              resources: [{ fqn: "Worker", value }],
              output: "{}",
            },
          ],
        },
      ],
    });
    const repository = makeRepositorySettingsBuilderRepository({});
    const { cards } = renderStackCards(stacksWith(worker), repository, "b".repeat(40));

    // A run from a laptop has no run URL, so its line links nowhere. The address is the one URL of
    // the Worker, so the Worker row shows no URL and no build state.
    expect(cards.map((card) => card.textContent)).toEqual([
      "tmp-k7m2-rows.pfp.workers.devaaaaaaatmp-k7m2-rows",
    ]);
    expect([...cards[0].querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://tmp-k7m2-rows.pfp.workers.dev",
    ]);
    // The same row with a custom domain, which Alchemy puts first: the row keeps the other URL.
    expect(
      stackCardsOf(
        stacksWith(
          worker.replace(
            '"url":"https://tmp-k7m2-rows.pfp.workers.dev","urls":[',
            '"url":"https://rows.samebase.com","urls":["https://rows.samebase.com",',
          ),
        ),
        repository,
        null,
      ).map((card) => ({
        address: card.address,
        destinations: card.resources.map((resource) =>
          resource.kind === "cloudflare_worker" ? resource.worker.destination : resource.kind,
        ),
      })),
    ).toEqual([
      {
        address: { href: "https://rows.samebase.com", label: "rows.samebase.com" },
        destinations: [
          {
            state: "available",
            href: "https://tmp-k7m2-rows.pfp.workers.dev",
            label: "tmp-k7m2-rows.pfp.workers.dev",
            provenance: "stack",
            title: "Open tmp-k7m2-rows",
          },
        ],
      },
    ]);
  });

  it("shows the resources of a bound namespace under their component, below its deployment", () => {
    // Like the Mail stack: the captured prod stage of samebase/base-alchemy from
    // apps/mail/alchemy.run.ts, its Deployment row with a `mail` binding in the shape of
    // https://github.com/samebase/alchemy-convex/blob/v0.10.0/test/Component.test.ts#L73-L77, the
    // captured PosthogProxy Worker row and a Scout bucket with the `namespace` that alchemy
    // 2.0.0-beta.83 writes under `Namespace.push("Mail", ...)`, and the captured Domains Worker row
    // at the stack root.
    const [, , samebaseProd] = observedSamebaseStackReply.value.stages;
    const workerRow = (fqn: string) => {
      const row = samebaseProd.resources.find((resource) => resource.fqn === fqn);
      if (!row) {
        throw new Error(`Expected the captured ${fqn} row.`);
      }
      return row;
    };
    const [bucketRow] = observedScoutR2Resources;
    const inMail = (value: string) => value.replace(/}$/, ',"namespace":{"Id":"Mail"}}');
    const stacks = observedBaseAlchemyStack();
    const mailStacks: RepositoryAlchemyStacks = {
      ...stacks,
      stacks: stacks.stacks.map((stack) => ({
        ...stack,
        stages: stack.stages.map((stage) => ({
          ...stage,
          record: { ...stage.record, stackFile: "apps/mail/alchemy.run.ts" },
          resources: [
            ...stage.resources.map((resource) => ({
              fqn: resource.fqn,
              value:
                resource.fqn === "Deployment"
                  ? resource.value.replace(
                      '"bindings":[]',
                      '"bindings":[{"sid":"convex.component:[\\"Mail\\"]","data":{"type":"component","path":"mail","namespace":["Mail"]}}]',
                    )
                  : resource.value,
            })),
            workerRow("Domains"),
            { fqn: "Mail/PosthogProxy", value: inMail(workerRow("PosthogProxy").value) },
            { fqn: `Mail/${bucketRow.fqn}`, value: inMail(bucketRow.value) },
          ],
        })),
      })),
    };
    const repository = makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" });

    expect(
      stackCardsOf(mailStacks, repository, null).map((card) =>
        card.resources.map((resource) =>
          resource.kind === "destination"
            ? {
                id: resource.id,
                components: resource.components?.map((component) => ({
                  path: component.path,
                  resources: component.resources.map((child) => child.id),
                })),
              }
            : resource.id,
        ),
      ),
    ).toEqual([
      [
        "alchemy:samebase/base-alchemy:Domains",
        {
          id: "alchemy:samebase/base-alchemy:Deployment",
          components: [
            {
              path: "mail",
              resources: [
                "alchemy:samebase/base-alchemy:Mail/PosthogProxy",
                "alchemy:samebase/base-alchemy:Mail/Workspaces",
              ],
            },
          ],
        },
      ],
    ]);
    const { cards } = renderStackCards(mailStacks, repository, null);
    const deployment = cards[0].querySelector('[aria-label="Convex deployment ideal-dolphin-15"]');
    expect(deployment?.querySelector('[aria-label="Convex component mail"]')?.textContent).toBe(
      "mailConvex componentsamebase-posthog-proxye.samebase.comscout-workspaces",
    );
    expect(
      deployment?.querySelector('[aria-label="Cloudflare Worker samebase-domains"]'),
    ).toBeNull();
    expect(cards.map((card) => card.textContent)).toEqual([
      "apps/mailideal-dolphin-15.convex.sitesamebase-domains*.json.mdideal-dolphin-15🇺🇸US East (N. Virginia)mailConvex componentsamebase-posthog-proxye.samebase.comscout-workspaces",
    ]);
  });

  it("shows a card in a pull request row for each stack with the stage of the pull request", () => {
    // The stacks of samebase/samebase after the move, with the captured stage pr-1768 on the root
    // stack. The stack of apps/sidebars-example has only `prod`, so it shows no card.
    const stacks = samebaseStacksAfterTheMove();
    const [, preview] = observedSamebaseStackReply.value.stages;
    const withPreview: RepositoryAlchemyStacks = {
      ...stacks,
      stacks: stacks.stacks.map((stack) =>
        stack.name === "samebase/samebase"
          ? {
              ...stack,
              stages: [
                {
                  name: "pr-1768",
                  record: {
                    version: 1,
                    repository: "samebase/samebase",
                    stackFile: "alchemy.run.ts",
                    branch: "alchemy-root-stack",
                    pullRequest: 1768,
                    headCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
                    runUrl:
                      "https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1",
                    source: "github-actions",
                    recordedAt: "2026-10-22T09:34:35.577Z",
                  },
                  deployedHeadCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
                  resources: preview.resources,
                  output: '{"url":"https://aware-bobcat-542.convex.site"}',
                },
                ...stack.stages,
              ],
            }
          : stack,
      ),
    };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PullRequestResources
        resource={{
          state: "current",
          resources: {
            pullRequestId: "pull-request-1768",
            cloudflareBuilds: { state: "available" },
            workers: [],
            convexProjects: [],
            hostingPreviews: {
              cloudflare: { state: "available", previews: [] },
              netlify: { state: "available", previews: [] },
            },
          },
          // The pull request has a newer head than the deployed commit, so the card has a run line.
          stackCards: buildAlchemyStackCards({
            stacks: withPreview,
            stage: { name: "pr-1768", headCommit: "e63be559a98682f3b67090f9d9e294694e87fad2" },
          }),
        }}
      />,
    );
    for (const time of container.querySelectorAll("time")) {
      time.remove();
    }
    const cards = [...container.querySelectorAll('[aria-label^="Alchemy stack "]')];

    // One card at the root shows no folder, and a preview deployment has no live read or route.
    expect(cards.map((card) => [card.getAttribute("aria-label"), card.textContent])).toEqual([
      ["Alchemy stack samebase/samebase", "/aware-bobcat-542.convex.site429c121aware-bobcat-542"],
    ]);
    expect([...cards[0].querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://aware-bobcat-542.convex.site",
      "https://github.com/samebase/samebase/actions/runs/39756039340/attempts/1",
      "https://dashboard.convex.dev/d/aware-bobcat-542",
    ]);
    expect(cards[0].querySelectorAll("button")).toHaveLength(0);
  });
});

describe("repository environment roots", () => {
  it("keeps a Convex row under its known root while deployment details load", () => {
    const convexProjectId = fakeConvexProjectId();
    const repository = makeRepositorySettingsBuilderRepository({
      convexProjects: [
        makeRepositorySettingsConvexProject({
          convexProjectId,
          codeLocation: { kind: "config", convexConfigPath: "packages/backend/convex.json" },
        }),
      ],
    });

    expect(
      buildProductionEnvironmentRoots({
        branch: "main",
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [],
          builds: [],
          convexBuildAccess: [],
        }),
        convexObservations: { state: "loading" },
        owner: "ada",
        repoName: "demo",
        schemaGraphEnabled: true,
        repository,
      }),
    ).toEqual([
      {
        rootDirectory: "packages/backend",
        resources: [
          {
            kind: "convex_loading",
            id: convexProjectId,
          },
        ],
      },
    ]);
  });

  it("keeps production Data available independently from Schema access", () => {
    const convexProjectId = fakeConvexProjectId();
    const dashboardUrl = "https://dashboard.convex.dev/t/ada/demo/calm-swan-123";
    const repository = makeRepositorySettingsBuilderRepository({
      convexProjects: [
        makeRepositorySettingsConvexProject({
          convexProjectId,
          codeLocation: { kind: "config", convexConfigPath: "packages/backend/convex.json" },
        }),
      ],
    });

    expect(
      buildProductionEnvironmentRoots({
        branch: "main",
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [],
          builds: [],
          convexBuildAccess: [],
        }),
        convexObservations: {
          state: "loaded",
          refreshFailed: false,
          reload: () => {},
          observations: [
            {
              convexProjectId,
              projectId: "demo-project-id",
              codeLocation: { kind: "config", convexConfigPath: "packages/backend/convex.json" },
              source: { kind: "config", state: "valid" },
              provider: {
                state: "current",
                projectSlug: "demo",
                teamSlug: "ada",
                productionDeployment: {
                  state: "available",
                  deploymentName: "calm-swan-123",
                  dashboardUrl,
                  region: "aws-eu-west-1",
                },
              },
            },
          ],
        },
        owner: "ada",
        repoName: "demo",
        schemaGraphEnabled: false,
        repository,
      }),
    ).toEqual([
      {
        rootDirectory: "packages/backend",
        resources: [
          {
            kind: "destination",
            id: `convex:${dashboardUrl}`,
            actions: [
              {
                destination: "samebase",
                href: `/repo/ada/demo/db/main/project/${convexProjectId}`,
                label: "Data",
              },
              {
                destination: "samebase",
                href: `/repo/ada/demo/components/calm-swan-123`,
                label: "Components",
              },
            ],
            href: dashboardUrl,
            label: "calm-swan-123",
            provider: "convex",
            provenance: "production",
            region: "aws-eu-west-1",
            title: "Open production Convex deployment calm-swan-123",
          },
        ],
      },
    ]);
  });

  it("groups pull request Workers by their saved roots", () => {
    const domainWorkerId = fakeCloudflareWorkerId("worker-domain");
    const samebaseWorkerId = fakeCloudflareWorkerId("worker-samebase");
    const roots = buildPullRequestEnvironmentRoots({
      resources: {
        pullRequestId: "pull-request-1",
        cloudflareBuilds: { state: "available" },
        workers: [
          {
            workerId: domainWorkerId,
            workerName: "domain-router",
            rootDirectory: "apps/domain-router",
            cloudflareBuild: {
              state: "available",
              uuid: "domain-build",
              buildState: "success",
              logsUrl: "https://dash.cloudflare.com/domain-build",
            },
            cloudflareBranchPreview: { state: "absent" },
          },
          {
            workerId: samebaseWorkerId,
            workerName: "samebase",
            rootDirectory: "apps/samebase",
            cloudflareBuild: {
              state: "available",
              uuid: "samebase-build",
              buildState: "failure",
              logsUrl: "https://dash.cloudflare.com/samebase-build",
            },
            cloudflareBranchPreview: { state: "absent" },
          },
        ],
        convexProjects: [],
        hostingPreviews: {
          cloudflare: { state: "available", previews: [] },
          netlify: { state: "available", previews: [] },
        },
      },
    });

    expect(
      roots.map((root) => ({
        rootDirectory: root.rootDirectory,
        workers: root.resources.flatMap((resource) =>
          resource.kind === "cloudflare_worker"
            ? [{ name: resource.worker.workerName, build: resource.worker.build }]
            : [],
        ),
      })),
    ).toEqual([
      {
        rootDirectory: "apps/domain-router",
        workers: [
          {
            name: "domain-router",
            build: {
              state: "available",
              buildState: "success",
              logsUrl: "https://dash.cloudflare.com/domain-build",
            },
          },
        ],
      },
      {
        rootDirectory: "apps/samebase",
        workers: [
          {
            name: "samebase",
            build: {
              state: "available",
              buildState: "failure",
              logsUrl: "https://dash.cloudflare.com/samebase-build",
            },
          },
        ],
      },
    ]);
  });

  it("shows a Convex preview independently from a failed Cloudflare build", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const worker = {
      workerId,
      workerName: "demo-web",
      rootDirectory: "apps/web",
      cloudflareBuild: {
        state: "available" as const,
        uuid: "build-1",
        buildState: "failure" as const,
        logsUrl: "https://dash.cloudflare.com/build-1",
      },
      cloudflareBranchPreview: { state: "absent" as const },
    };

    expect(
      buildPullRequestEnvironmentRoots({
        resources: {
          pullRequestId: "pull-request-1",
          cloudflareBuilds: { state: "available" },
          workers: [worker],
          convexProjects: [
            {
              state: "branch",
              convexProjectId,
              rootDirectory: "apps/web",
              deploymentName: "calm-swan-123",
              dashboardUrl: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
            },
          ],
          hostingPreviews: {
            cloudflare: { state: "available", previews: [] },
            netlify: { state: "available", previews: [] },
          },
        },
      }),
    ).toEqual([
      {
        rootDirectory: "apps/web",
        resources: [
          {
            kind: "cloudflare_worker",
            id: workerId,
            worker: {
              workerName: "demo-web",
              build: {
                state: "available",
                buildState: "failure",
                logsUrl: "https://dash.cloudflare.com/build-1",
              },
              destination: { state: "absent" },
              actions: [],
            },
          },
          {
            kind: "destination",
            id: `convex:${convexProjectId}`,
            actions: [
              {
                destination: "external",
                href: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123/data",
                label: "Data",
              },
            ],
            href: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
            label: "calm-swan-123",
            provider: "convex",
            provenance: "pull_request_branch",
            title: "Open branch Convex deployment calm-swan-123",
          },
        ],
      },
    ]);
  });

  it("shows a building current build and an earlier-commit branch preview independently", () => {
    const workerId = fakeCloudflareWorkerId();
    const previewUrl = "https://older-demo-web.example.workers.dev";
    const resources = {
      pullRequestId: "pull-request-1",
      cloudflareBuilds: { state: "available" as const },
      workers: [
        {
          workerId,
          workerName: "demo-web",
          rootDirectory: "apps/web",
          cloudflareBuild: {
            state: "available" as const,
            uuid: "building-1",
            buildState: "running" as const,
            logsUrl: "https://dash.cloudflare.com/building-1",
          },
          cloudflareBranchPreview: {
            state: "available" as const,
            url: previewUrl,
            provenance: "earlier_check" as const,
          },
        },
      ],
      convexProjects: [],
      hostingPreviews: {
        cloudflare: { state: "available" as const, previews: [] },
        netlify: { state: "available" as const, previews: [] },
      },
    };
    const roots = buildPullRequestEnvironmentRoots({ resources });

    expect(roots).toEqual([
      {
        rootDirectory: "apps/web",
        resources: [
          {
            kind: "cloudflare_worker",
            id: workerId,
            worker: {
              workerName: "demo-web",
              build: {
                state: "available",
                buildState: "running",
                logsUrl: "https://dash.cloudflare.com/building-1",
              },
              destination: {
                state: "available",
                href: previewUrl,
                label: "Branch preview",
                provenance: "earlier_check",
                title: "older-demo-web.example.workers.dev",
              },
              actions: [],
            },
          },
        ],
      },
    ]);

    const markup = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    expect(markup).toContain("Building");
    expect(markup).toContain("May be from an earlier commit");
  });

  it("shows one pull request message when Cloudflare comments are unavailable", () => {
    const markup = renderToStaticMarkup(
      <PullRequestResources
        resource={{
          state: "current",
          resources: {
            pullRequestId: "pull-request-1",
            cloudflareBuilds: { state: "unavailable" },
            workers: [],
            convexProjects: [],
            hostingPreviews: {
              cloudflare: { state: "unavailable" },
              netlify: { state: "available", previews: [] },
            },
          },
          stackCards: [],
        }}
      />,
    );

    expect(markup).toContain("Could not load Cloudflare build status");
    expect(markup).not.toContain("Unavailable");
  });

  it("keeps an unavailable pull request head out of Cloudflare comment errors", () => {
    const markup = renderToStaticMarkup(<PullRequestResources resource={{ state: "failed" }} />);

    expect(markup).toContain("Deploy status unavailable");
    expect(markup).not.toContain("Could not load Cloudflare build status");
    expect(markup).not.toContain("Cloudflare Workers");
    expect(markup).not.toContain(">Unavailable<");
  });

  it("links a comment build with its direct status", () => {
    const workerId = fakeCloudflareWorkerId();
    const logsUrl = "https://dash.cloudflare.com/account-1/workers/builds/building-1";
    const roots = buildPullRequestEnvironmentRoots({
      resources: {
        pullRequestId: "pull-request-1",
        cloudflareBuilds: { state: "available" },
        workers: [
          {
            workerId,
            workerName: "demo-web",
            rootDirectory: "apps/web",
            cloudflareBuild: {
              state: "available",
              uuid: "building-1",
              buildState: "running",
              logsUrl,
            },
            cloudflareBranchPreview: { state: "absent" },
          },
        ],
        convexProjects: [],
        hostingPreviews: {
          cloudflare: { state: "available", previews: [] },
          netlify: { state: "available", previews: [] },
        },
      },
    });

    expect(roots).toMatchObject([
      {
        rootDirectory: "apps/web",
        resources: [
          {
            kind: "cloudflare_worker",
            worker: {
              build: { state: "available", buildState: "running", logsUrl },
            },
          },
        ],
      },
    ]);

    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    const buildLink = rootElement.querySelector(`a[href="${logsUrl}"]`);
    expect(buildLink?.textContent).toContain("Building");
    expect(buildLink?.getAttribute("target")).toBe("_blank");
    expect(buildLink?.getAttribute("rel")).toBe("noreferrer noopener");
  });
});

describe("PullRequestsSection", () => {
  it("shows rootless hosting previews without a setup link", async () => {
    const pullRequest = {
      id: "pull-request:41",
      number: 41,
      title: "Show previews found in comments",
      url: "https://github.com/ada/demo/pull/41",
      isDraft: false,
      isCrossRepository: false,
      additions: 3,
      deletions: 1,
      changedFiles: 2,
      updatedAt: "2026-07-31T08:00:00Z",
      baseRefName: "main",
      headRefName: "preview-comments",
      headRefOid: "1111111111111111111111111111111111111111",
      headRepository: {
        id: "repository:ada/demo",
        nameWithOwner: "ada/demo",
        owner: { login: "ada" },
      },
      labels: [],
      statusCheckRollup: null,
      checks: {
        state: "none",
        totalCount: 0,
        successCount: 0,
        failureCount: 0,
        runningCount: 0,
        neutralCount: 0,
        unknownCount: 0,
      },
    } satisfies RepositoryPullRequest;
    const cloudflareWorkerUrl = "https://preview-comments.demo.workers.dev";
    const cloudflarePagesUrl = "https://preview-comments.demo.pages.dev";
    const netlifyUrl = "https://deploy-preview-41--demo.netlify.app";
    const pullRequests = {
      state: "current",
      defaultBranch: null,
      openPullRequestCount: 1,
      refreshing: false,
      allPullRequests: [pullRequest],
      resourcesByPullRequestId: new Map([
        [
          pullRequest.id,
          {
            state: "current",
            resources: {
              pullRequestId: pullRequest.id,
              cloudflareBuilds: { state: "available" },
              workers: [],
              convexProjects: [],
              hostingPreviews: {
                cloudflare: {
                  state: "available",
                  previews: [
                    { kind: "worker", name: "comment-worker", url: cloudflareWorkerUrl },
                    { kind: "pages", name: "comment-pages", url: cloudflarePagesUrl },
                  ],
                },
                netlify: {
                  state: "available",
                  previews: [{ name: "demo-netlify", url: netlifyUrl }],
                },
              },
            },
            stackCards: [],
          },
        ],
      ]),
      loadMore: { state: "exhausted" },
    } satisfies RepositoryPullRequestsState;
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <TestRouterProvider initialEntries={["/repo/ada/demo"]}>
            <PullRequestsSection
              filesReadEnabled={false}
              pullRequests={pullRequests}
              repository={makeRepositorySettingsBuilderRepository({})}
            />
          </TestRouterProvider>,
        );
      });

      expect(rootElement.querySelector("#repository-pull-requests-heading")?.textContent).toBe(
        "1 open pull request",
      );

      const expandButton = rootElement.querySelector(
        'button[aria-label="Show pull request #41 details"]',
      );
      if (!(expandButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the pull request details button.");
      }
      await act(async () => {
        expandButton.click();
      });

      const otherPreviews = rootElement.querySelector(
        '[role="group"][aria-label="Other previews"]',
      );
      expect(otherPreviews).not.toBeNull();
      expect(otherPreviews?.textContent).toContain("Other previews");
      expect(otherPreviews?.textContent).not.toContain("Connect");

      const workerPreview = otherPreviews?.querySelector(`a[href="${cloudflareWorkerUrl}"]`);
      const pagesPreview = otherPreviews?.querySelector(`a[href="${cloudflarePagesUrl}"]`);
      const netlifyPreview = otherPreviews?.querySelector(`a[href="${netlifyUrl}"]`);
      expect(workerPreview?.textContent).toContain("Branch preview");
      expect(pagesPreview?.textContent).toContain("Branch preview");
      expect(netlifyPreview?.textContent).toContain("Deploy preview");
      for (const previewLink of [workerPreview, pagesPreview, netlifyPreview]) {
        expect(previewLink?.getAttribute("target")).toBe("_blank");
        expect(previewLink?.getAttribute("rel")).toBe("noreferrer noopener");
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    }
  });
});

describe("RepositoryOverviewPickerPane", () => {
  function organizationForRepository(
    repository: RepositorySettingsBuilderRepository,
  ): RepositoryOrganization {
    return {
      canCreateRepository: true,
      githubOwnerId: "github-owner-ada",
      githubOwnerLogin: repository.githubOwnerLogin,
      githubOwnerType: "user",
      organizationId: repository.organizationId,
      role: "owner",
    };
  }

  it("shows positive resource counts and omits zero resource counts", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({})],
      convexProjects: [makeRepositorySettingsConvexProject({})],
      githubRepositoryName: "demo",
      githubOwnerLogin: "ada",
      githubRepositoryFullName: "ada/demo",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForRepository(repository)]}
          sidebarSummaries={{
            state: "loaded",
            summaries: [
              {
                repositoryId: repository.repositoryId,
                openPullRequestCount: 3,
                checks: {
                  state: "success",
                  totalCount: 1,
                  successCount: 1,
                  failureCount: 0,
                  runningCount: 0,
                  neutralCount: 0,
                  unknownCount: 0,
                },
              },
            ],
          }}
          repositories={[repository]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('<nav aria-label="Repositories"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('href="/org/ada/repositories"');
    expect(markup).toContain("demo");
    expect(markup).toContain("1/1 passed");
    expect(markup).toContain("3 PRs");
    expect(markup).toContain("1 Cloudflare Worker");
    expect(markup).toContain("1 Convex project");
    expect(markup).not.toContain("Install GitHub App");
    expect(markup).toContain('href="/repo/ada/demo"');
    expect(markup).toMatch(/<a[^>]+href="\/repo\/ada\/demo"[^>]*>[\s\S]*1\/1 passed[\s\S]*<\/a>/);
    expect(markup).not.toContain(
      "Select a repository from the left sidebar or add one from the right sidebar.",
    );

    const emptyRepository = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [],
      convexProjects: [],
      githubRepositoryName: "empty",
      githubOwnerLogin: "ada",
      githubRepositoryFullName: "ada/empty",
    });
    const emptyMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForRepository(emptyRepository)]}
          sidebarSummaries={{
            state: "loaded",
            summaries: [
              {
                repositoryId: emptyRepository.repositoryId,
                openPullRequestCount: 0,
                checks: {
                  state: "success",
                  totalCount: 1,
                  successCount: 1,
                  failureCount: 0,
                  runningCount: 0,
                  neutralCount: 0,
                  unknownCount: 0,
                },
              },
            ],
          }}
          repositories={[emptyRepository]}
        />
      </TestRouterProvider>,
    );

    expect(emptyMarkup).toContain('aria-label="ada/empty, 1/1 passed"');
    expect(emptyMarkup).not.toContain("Cloudflare Worker");
    expect(emptyMarkup).not.toContain("Convex project");
    expect(emptyMarkup).not.toContain("open pull request");
    expect(emptyMarkup).not.toContain(" PR");
  });

  it("keeps a direct organization inventory open without a fold control", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      githubRepositoryName: "demo",
      githubOwnerLogin: "ada",
      githubRepositoryFullName: "ada/demo",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/ada/repositories"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory={false}
          organizations={[organizationForRepository(repository)]}
          organizationTreeSettings={[
            { collapsed: true, organizationId: repository.organizationId },
          ]}
          sidebarSummaries={{ state: "loading" }}
          repositories={[repository]}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('data-slot="collapsible-trigger"');
    expect(markup).toContain(">ada</span>");
    expect(markup).toContain('href="/repo/ada/demo"');
  });

  it("preserves organization order and repository order while grouping in one pass", () => {
    const zedFirst = makeRepositorySettingsBuilderRepository({
      repositoryId: fakeRepositoryId("repository-zed-first"),
      githubRepositoryName: "first",
      githubOwnerLogin: "zed",
      organizationId: fakeOrganizationId("organization-zed"),
      githubRepositoryFullName: "zed/first",
    });
    const zedSecond = makeRepositorySettingsBuilderRepository({
      ...zedFirst,
      repositoryId: fakeRepositoryId("repository-zed-second"),
      githubRepositoryName: "second",
      githubRepositoryFullName: "zed/second",
    });
    const adaFirst = makeRepositorySettingsBuilderRepository({
      repositoryId: fakeRepositoryId("repository-ada-first"),
      githubRepositoryName: "first",
      githubOwnerLogin: "ada",
      organizationId: fakeOrganizationId("organization-ada"),
      githubRepositoryFullName: "ada/first",
    });
    const adaSecond = makeRepositorySettingsBuilderRepository({
      ...adaFirst,
      repositoryId: fakeRepositoryId("repository-ada-second"),
      githubRepositoryName: "second",
      githubRepositoryFullName: "ada/second",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForRepository(zedFirst), organizationForRepository(adaFirst)]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          repositories={[adaSecond, zedFirst, adaFirst, zedSecond]}
        />
      </TestRouterProvider>,
    );
    const orderedMarkers = [
      ">zed</span>",
      'href="/repo/zed/first"',
      'href="/repo/zed/second"',
      ">ada</span>",
      'href="/repo/ada/second"',
      'href="/repo/ada/first"',
    ];

    for (const marker of orderedMarkers) {
      expect(markup.indexOf(marker)).toBeGreaterThanOrEqual(0);
    }
    for (let index = 1; index < orderedMarkers.length; index += 1) {
      expect(markup.indexOf(orderedMarkers[index])).toBeGreaterThan(
        markup.indexOf(orderedMarkers[index - 1]),
      );
    }
  });

  it("prioritizes active repository workflows in the root repository picker", () => {
    const settingUpMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[
            organizationForRepository(
              makeRepositorySettingsBuilderRepository({
                sourceSetup: {
                  status: "running",
                  runId: fakeRunId(),
                  step: "sync_tree",
                  updatedAt: 30,
                },
              }),
            ),
          ]}
          sidebarSummaries={{ state: "loading" }}
          repositories={[
            makeRepositorySettingsBuilderRepository({
              sourceSetup: {
                status: "running",
                runId: fakeRunId(),
                step: "sync_tree",
                updatedAt: 30,
              },
            }),
          ]}
        />
      </TestRouterProvider>,
    );
    const deletingMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[
            organizationForRepository(
              makeRepositorySettingsBuilderRepository({
                deletion: {
                  state: "deleting",
                  runId: fakeDeletionRunId(),
                  requestedAt: 20,
                  currentStep: "delete_cloudflare",
                  message: "Removing Cloudflare resources.",
                  updatedAt: 30,
                },
              }),
            ),
          ]}
          sidebarSummaries={{ state: "loading" }}
          repositories={[
            makeRepositorySettingsBuilderRepository({
              deletion: {
                state: "deleting",
                runId: fakeDeletionRunId(),
                requestedAt: 20,
                currentStep: "delete_cloudflare",
                message: "Removing Cloudflare resources.",
                updatedAt: 30,
              },
            }),
          ]}
        />
      </TestRouterProvider>,
    );

    expect(settingUpMarkup).toContain("Setting up");
    expect(settingUpMarkup).toContain("animate-spin");
    expect(settingUpMarkup).not.toContain("Loading checks");
    expect(deletingMarkup).toContain("Deleting");
    expect(deletingMarkup).toContain("animate-spin");
    expect(deletingMarkup).not.toContain("Loading checks");
  });

  it("includes the current setup state in each sidebar link name", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      sourceSetup: {
        status: "running",
        runId: fakeRunId(),
        step: "sync_tree",
        updatedAt: 30,
      },
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/ada/demo"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={{ assignments: [], folders: [] }}
          organizationId={repository.organizationId}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={[repository]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-label="ada/demo, Setting up"');
  });

  it("renders loading, zero-membership, and empty-organization states", () => {
    const emptyOrganization = organizationForRepository(
      makeRepositorySettingsBuilderRepository({}),
    );
    const loadingMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={null}
        />
      </TestRouterProvider>,
    );
    const emptyMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          repositories={[]}
        />
      </TestRouterProvider>,
    );
    const emptyOrganizationMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/ada/repositories"]}>
        <RepositoryOverviewPickerPane
          {...REPOSITORY_PICKER_FOLDER_PROPS}
          globalInventory={false}
          organizations={[emptyOrganization]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          repositories={[]}
        />
      </TestRouterProvider>,
    );

    expect(loadingMarkup).toContain('aria-label="Loading repositories"');
    expect(emptyMarkup).toContain("No organizations");
    expect(emptyMarkup).toContain("Connect a GitHub account or organization to Samebase.");
    expect(emptyMarkup).toContain("Add organization");
    expect(emptyMarkup).toContain('href="/org"');
    expect(emptyOrganizationMarkup).toContain("ada");
    expect(emptyOrganizationMarkup).toContain('<nav aria-label="Repositories"');
    expect(emptyOrganizationMarkup).toContain("No repositories");
    expect(emptyOrganizationMarkup).not.toContain("Add organization");
  });
});

describe("RepositoryOverviewPage", () => {
  it("does not link an unconnected repository", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      hasConnectedGitHubRepository: false,
    });
    const cloudflareObservations = makeLoadedCloudflareObservations({
      workers: [],
      builds: [],
      convexBuildAccess: [],
    });
    const convexObservations = {
      state: "loaded" as const,
      refreshFailed: false,
      reload: () => {},
      observations: [],
    };
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/ada/demo"]}>
        <RepositoryOverviewPage
          developerToolsVisible={false}
          isRetryingRepositoryAction={false}
          onOpenDeleteDialog={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryRepositoryDeletion={() => {}}
          page="overview"
          workspace={{
            alchemyState: {
              state: "loaded" as const,
              observation: { store: "missing" as const },
              refreshFailed: false,
              reload: () => {},
            },
            alchemyObservations: {
              state: "loaded",
              observations: [],
              refreshFailed: false,
              reload: () => {},
            },
            access: { state: "ready", accessKeys: [] },
            cloudflareConnection: { state: "loading" },
            cloudflareObservations,
            convexObservations,
            production: { source: "attachments", roots: [] },
            githubRepositoryUrl: "https://github.com/ada/demo",
            pullRequests: { state: "not_requested" },
            repository,
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('href="https://github.com/ada/demo"');
  });

  it("offers a repository name update only to an organization owner", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      githubRepositoryName: "agent-plugins",
      githubRepositoryFullName: "ada/agent-plugins",
    });
    const workspace = {
      alchemyState: {
        state: "loaded" as const,
        observation: { store: "missing" as const },
        refreshFailed: false,
        reload: () => {},
      },
      alchemyObservations: {
        state: "loaded" as const,
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
      access: { state: "ready" as const, accessKeys: [] },
      cloudflareConnection: { state: "loading" as const },
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [],
        builds: [],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded" as const,
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      production: { source: "attachments" as const, roots: [] },
      githubRepositoryUrl: "https://github.com/ada/plugin",
      pullRequests: { state: "not_requested" as const },
      repository,
    };
    useOrganizationGitHubIdentitiesMock.mockReturnValue(
      new Map([
        [
          repository.organizationId,
          {
            owner: { status: "current" },
            repositories: [
              {
                status: "renamed",
                repositoryId: repository.repositoryId,
                repositoryName: "plugin",
                update: "available",
              },
            ],
          },
        ],
      ]),
    );

    function renderForRole(role: "member" | "owner") {
      const queryClient = new QueryClient();
      return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <OrganizationContext.Provider
            value={{
              organizations: [
                {
                  canCreateRepository: true,
                  githubOwnerId: "github-owner-ada",
                  githubOwnerLogin: "ada",
                  githubOwnerType: "user",
                  organizationId: repository.organizationId,
                  role,
                },
              ],
              surface: { kind: "allRepositories" },
            }}
          >
            <TestRouterProvider initialEntries={["/repo/ada/agent-plugins/settings"]}>
              <RepositorySettings
                developerToolsVisible={false}
                onOpenDeleteDialog={() => {}}
                workspace={workspace}
              />
            </TestRouterProvider>
          </OrganizationContext.Provider>
        </QueryClientProvider>,
      );
    }

    const ownerMarkup = renderForRole("owner");
    const memberMarkup = renderForRole("member");

    expect(ownerMarkup).toContain("GitHub now uses");
    expect(ownerMarkup).toContain("ada</span>/<span");
    expect(ownerMarkup).toContain("plugin</span>.");
    expect(ownerMarkup).toContain("Update name");
    expect(memberMarkup).toContain("An organization owner must update this name.");
    expect(memberMarkup).not.toContain("Update name");
    expect(ownerMarkup).toContain("Remove from Samebase");
    expect(ownerMarkup).not.toContain("Connections");
  });
});

describe("formatRepositorySourceSetupStep", () => {
  it("uses dashboard labels for create-app setup steps", () => {
    expect(formatRepositorySourceSetupStep("connect_github_repository")).toBe(
      "Connecting GitHub repository",
    );
    expect(formatRepositorySourceSetupStep("fetch_github_repository")).toBe(
      "Reading GitHub repository",
    );
    expect(formatRepositorySourceSetupStep("seed_starter")).toBe("Adding starter files");
    expect(formatRepositorySourceSetupStep("sync_tree")).toBe("Syncing repository files");
  });
});

describe("RepositoryDeleteDialogContent", () => {
  const baseProps = {
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
    onCommitBeforeRemove: () => {},
    onOpenChange: () => {},
    onRemoveGithubRepoChange: () => {},
    onRemoveRepository: () => {},
    progress: "idle",
    removeGithubRepo: false,
    stagedChangesCount: 0,
  } satisfies Omit<Parameters<typeof RepositoryDeleteDialogContent>[0], "target">;

  it("offers to delete only the GitHub repository", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialogContent
        {...baseProps}
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "ada/created-repo",
          isSamebaseManaged: true,
          canRemoveGithubRepo: true,
          setupStack: null,
        }}
      />,
    );

    expect(markup).toContain("Also delete the GitHub repository");
    expect(markup).not.toContain("Also delete the Convex project");
    expect(markup).not.toContain("Also delete the Cloudflare Worker");
  });

  it("names what removal keeps and links the destroy for a repository that its GitHub Actions set up", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialogContent
        {...baseProps}
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "ada/chess-merge",
          isSamebaseManaged: true,
          canRemoveGithubRepo: true,
          setupStack: { workerNames: ["chess-merge"], convexCodeLocations: ["convex.json"] },
        }}
      />,
    );

    expect(markup).toContain(
      "Samebase keeps the Worker chess-merge, the Convex project at convex.json. To delete what the setup stack in alchemy.run.ts created, first open the",
    );
    expect(markup).toContain(
      'href="https://github.com/ada/chess-merge/actions/workflows/destroy.yml"',
    );
    expect(markup).toContain(
      'workflow, click Run workflow, and type <span class="font-mono">delete stack and production data of ada/chess-merge</span> in its field.',
    );
  });

  it("shows the server block reason and disables removal", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialogContent
        {...baseProps}
        blockedReason="Repository setup is still running."
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "ada/demo",
          isSamebaseManaged: true,
          canRemoveGithubRepo: true,
          setupStack: null,
        }}
      />,
    );
    const removeButton = markup.match(/<button[^>]*>Remove from Samebase<\/button>/)?.[0];

    expect(markup).toContain("Repository setup is still running.");
    expect(removeButton).toBeDefined();
    expect(removeButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });
});
