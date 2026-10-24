// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
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
import {
  RepositoryCloudflareDialog,
  RepositoryCloudflareDialogContent,
} from "./RepositoryCloudflareDialog";
import { RepositoryConvexDialog, RepositoryConvexDialogContent } from "./RepositoryConvexDialog";
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
  buildAlchemyEnvironmentRoots,
  buildProductionEnvironmentRoots,
  buildPullRequestEnvironmentRoots,
} from "./repositoryEnvironmentRoots";
import { buildRepositorySettingsState } from "./repositorySettingsState";
import type {
  RepositoryAlchemyStacks,
  RepositoryCloudflareProviderObservationState,
  RepositoryCloudflareWorkerBuildsObservation,
  RepositoryCloudflareWorkerConvexBuildAccessObservation,
  RepositoryCloudflareWorkerObservation,
} from "./useRepositoryProviderObservations";
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

type RepositorySettingsBuilderRepository = Parameters<
  typeof buildRepositorySettingsState
>[0]["repository"];
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
type AvailableRepositorySettingsCloudflareConvexBuildAccessObservation = Extract<
  RepositoryCloudflareWorkerConvexBuildAccessObservation,
  { state: "available" }
>;

function getRepositorySettingsResource(
  state: ReturnType<typeof buildRepositorySettingsState>,
  rootDirectory: string,
  provider: "cloudflare" | "convex",
) {
  const root = state.roots.find((candidate) => candidate.rootDirectory === rootDirectory);
  if (!root) {
    throw new Error(`Expected ${rootDirectory} root group.`);
  }
  const resource = root.resources.find((candidate) => candidate.provider === provider);
  if (!resource) {
    throw new Error(`Expected ${provider} resource in ${rootDirectory} root group.`);
  }
  return resource;
}

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
    canRemoveConvexProvision: false,
    canRemoveCloudflareProvision: false,
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
captured `pr-1768` row holds. The sidebars stack has no row yet, so its Worker is the captured
PosthogProxy row renamed. The captured `prod` Workers sit at the root: Alchemy's Worker has no rootDir.
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
              proxy,
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

describe("repository environment roots", () => {
  it.each([
    ["alchemy.run.ts", "/"],
    ["infrastructure/alchemy.run.ts", "infrastructure"],
  ])(
    "places R2 buckets beside %s and links their Cloudflare dashboard",
    (stackFile, rootDirectory) => {
      const stacks = observedBaseAlchemyStack();
      const roots = buildAlchemyEnvironmentRoots({
        branch: "main",
        owner: "samebase",
        repoName: "scout",
        schemaGraphEnabled: false,
        repository: makeRepositorySettingsBuilderRepository({}),
        stacks: {
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
      });

      expect(roots.map((root) => root.rootDirectory)).toEqual([rootDirectory]);
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
      expect(container.textContent.match(/R2 bucket/g)).toHaveLength(3);
      expect(
        [...container.querySelectorAll("a")].map((link) => [link.textContent, link.href]),
      ).toEqual([
        [
          "scout-public-media",
          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-public-media",
        ],
        [
          "scout-workspaces",
          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-workspaces",
        ],
        [
          "scout-workspaces-prod",
          "https://dash.cloudflare.com/fe57d01d7ab41f60d00ba1aade20eb33/r2/default/buckets/scout-workspaces-prod",
        ],
      ]);
    },
  );

  it("builds the default-branch block from the stage prod of the stack in the team store", () => {
    // Like the preview deployment of Samebase: the repository has no attachment rows.
    const repository = makeRepositorySettingsBuilderRepository({
      githubOwnerLogin: "samebase",
      githubRepositoryName: "base-alchemy",
      githubRepositoryFullName: "samebase/base-alchemy",
      convexTeamId: "38516",
    });
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "base-alchemy",
      schemaGraphEnabled: false,
      repository,
      stacks: observedBaseAlchemyStack(),
    });

    expect(roots).toEqual([
      {
        rootDirectory: "/",
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
            provenance: "production",
            region: "aws-us-east-1",
            title: "Open production Convex deployment ideal-dolphin-15",
          },
        ],
      },
    ]);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    expect(container.textContent).toBe("ideal-dolphin-15Convex deployment🇺🇸 US East (N. Virginia)");
  });

  it("renders the production stacks of the team store while the GitHub pull-request query loads", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      githubOwnerLogin: "samebase",
      githubRepositoryName: "base-alchemy",
      githubRepositoryFullName: "samebase/base-alchemy",
      convexTeamId: "38516",
    });
    const stacks = observedBaseAlchemyStack();
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/base-alchemy"]}>
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
            environmentRoots: buildAlchemyEnvironmentRoots({
              branch: "main",
              owner: "samebase",
              repoName: "base-alchemy",
              schemaGraphEnabled: false,
              repository,
              stacks,
            }),
            githubRepositoryUrl: "https://github.com/samebase/base-alchemy",
            pullRequests: { state: "loading" },
            repository,
          }}
        />
      </TestRouterProvider>,
    );

    expect(container.querySelector("section")?.getAttribute("aria-label")).toBe(
      "Default branch main",
    );
    expect(container.querySelectorAll('[aria-label="Loading default branch commit"]')).toHaveLength(
      1,
    );
    expect(
      [...container.querySelectorAll("a")].map((link) => [link.textContent, link.href]),
    ).toEqual([
      ["main", "https://github.com/samebase/base-alchemy/tree/main"],
      ["ideal-dolphin-15", "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15"],
    ]);
  });

  it("places the resources of every stack of samebase/samebase by stack file and rootDir", () => {
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "samebase",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({
        githubOwnerLogin: "samebase",
        githubRepositoryName: "samebase",
        githubRepositoryFullName: "samebase/samebase",
        convexTeamId: "38516",
      }),
      stacks: samebaseStacksAfterTheMove(),
    });

    expect(
      roots.map((root) => ({
        rootDirectory: root.rootDirectory,
        resources: root.resources.map((resource) =>
          resource.kind === "cloudflare_worker" ? resource.worker.workerName : resource.id,
        ),
      })),
    ).toEqual([
      { rootDirectory: "/", resources: ["samebase-domains", "samebase-posthog-proxy"] },
      { rootDirectory: "apps/samebase", resources: ["alchemy:samebase/samebase:Site"] },
      {
        rootDirectory: "apps/sidebars-example",
        resources: ["samebase-monorepo-sidebars-example"],
      },
    ]);
  });

  it("links the Workers of samebase/samebase without URLs to their routes", () => {
    // The captured Domains and PosthogProxy rows: no custom domain and no workers.dev URL.
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "samebase",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      stacks: samebaseStacksAfterTheMove(),
    });
    const rootWorkers = roots.filter((root) => root.rootDirectory === "/");

    expect(
      rootWorkers.flatMap((root) =>
        root.resources.flatMap((resource) =>
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
          provenance: "production",
          title: "Open production app",
        },
        actions: [],
      },
    ]);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={rootWorkers} />);
    expect(container.textContent).toBe(
      "samebase-domainsWorker*.json.mdsamebase-posthog-proxyWorkere.samebase.com",
    );
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://e.samebase.com/",
    ]);
  });

  it("links a route that covers a path of its host to that path", () => {
    // The captured PosthogProxy row with a second route on a path of its host. Alchemy gives every
    // route of the host the same url, the origin.
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "samebase",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      stacks: samebaseStacksWithRows((value) =>
        value.replace(
          '"url":"https://e.samebase.com"}]',
          '"url":"https://e.samebase.com"},{"id":"static","pattern":"e.samebase.com/static/*","zoneId":"2f2e7713e926a7282b25796b02826f02","url":"https://e.samebase.com"}]',
        ),
      ),
    });

    expect(
      roots.flatMap((root) =>
        root.resources.flatMap((resource) =>
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
    // show, in the directory of the stack file.
    const [, , prod] = observedSamebaseStackReply.value.stages;
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "samebase",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      stacks: {
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
    });

    expect(
      roots.map((root) => [root.rootDirectory, root.resources.map((resource) => resource.kind)]),
    ).toEqual([["apps/samebase", ["cloudflare_worker", "cloudflare_worker"]]]);
  });

  it("routes a Convex deployment of the store through its attachment row when one exists", () => {
    const convexProjectId = fakeConvexProjectId("convex-project-base-alchemy");
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "base-alchemy",
      schemaGraphEnabled: true,
      repository: makeRepositorySettingsBuilderRepository({
        convexTeamId: "38516",
        convexProjects: [
          makeRepositorySettingsConvexProject({
            convexProjectId,
            teamId: "38516",
            projectId: "3245938",
          }),
        ],
      }),
      stacks: observedBaseAlchemyStack(),
    });

    expect(
      roots.flatMap((root) =>
        root.resources.flatMap((resource) =>
          resource.kind === "destination" ? resource.actions.map((action) => action.href) : [],
        ),
      ),
    ).toEqual([
      "/repo/samebase/base-alchemy/db/main/project/convex-project-base-alchemy",
      "/repo/samebase/base-alchemy/schema/main/project/convex-project-base-alchemy",
      "/repo/samebase/base-alchemy/components/ideal-dolphin-15",
    ]);
  });

  it("shows a Worker of the store without a build state", () => {
    // The `main` Worker row measured in research/2026-10-21-alchemy-state-rows-for-workers-and-convex.md.
    const worker =
      '{"status":"created","fqn":"Worker","logicalId":"Worker","instanceId":"4fb5acd8a74d8a46633a8e57084e0bc1","resourceType":"Cloudflare.Worker","props":{"name":"tmp-k7m2-rows","main":"./worker.ts","env":{"CONVEX_URL":"https://modest-guanaco-252.convex.cloud"},"isExternal":true},"attr":{"workerId":"6d2434039c4343a9a02300ba85841b70","workerName":"tmp-k7m2-rows","logpush":false,"url":"https://tmp-k7m2-rows.pfp.workers.dev","urls":["https://tmp-k7m2-rows.pfp.workers.dev"],"tags":["alchemy:stack:samebase/tmp-k7m2-rows","alchemy:stage:main","alchemy:id:Worker"],"durableObjectNamespaces":{},"accountId":"fe57d01d7ab41f60d00ba1aade20eb33","routes":[],"crons":[],"tailConsumers":[],"hash":{"bundle":"b132832cbda33e15a9cffc4ff168139206ddccf97b0a7c2230801d3710200e85","metadata":"6692e8262512d066c344158cd4e091a1287954eb8b43208b87b336715b99bb65"}},"bindings":[{"sid":"CONVEX_URL","data":{"bindings":[{"type":"plain_text","name":"CONVEX_URL","text":"https://modest-guanaco-252.convex.cloud"}]}}],"providerVersion":0,"downstream":[],"removalPolicy":"destroy","providerMode":"live"}';
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "tmp-k7m2-rows",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({}),
      stacks: {
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
                resources: [{ fqn: "Worker", value: worker }],
                output: "{}",
              },
            ],
          },
        ],
      },
    });

    const markup = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    const container = document.createElement("div");
    container.innerHTML = markup;
    expect(container.textContent).toBe("tmp-k7m2-rowsWorkertmp-k7m2-rows.pfp.workers.dev");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://tmp-k7m2-rows.pfp.workers.dev",
    );
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
    const roots = buildAlchemyEnvironmentRoots({
      branch: "main",
      owner: "samebase",
      repoName: "convex-cloudflare-email-inbox",
      schemaGraphEnabled: false,
      repository: makeRepositorySettingsBuilderRepository({ convexTeamId: "38516" }),
      stacks: {
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
      },
    });

    expect(
      roots.map((root) => ({
        rootDirectory: root.rootDirectory,
        resources: root.resources.map((resource) =>
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
      })),
    ).toEqual([
      {
        rootDirectory: "apps/mail",
        resources: [
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
      },
    ]);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    const deployment = container.querySelector('[aria-label="Convex deployment ideal-dolphin-15"]');
    expect(deployment?.querySelector('[aria-label="Convex component mail"]')?.textContent).toBe(
      "mailConvex componentsamebase-posthog-proxyWorkere.samebase.comscout-workspacesR2 bucket",
    );
    expect(
      deployment?.querySelector('[aria-label="Cloudflare Worker samebase-domains"]'),
    ).toBeNull();
    expect(container.textContent).toBe(
      "apps/mailsamebase-domainsWorker*.json.mdideal-dolphin-15Convex deployment🇺🇸 US East (N. Virginia)mailConvex componentsamebase-posthog-proxyWorkere.samebase.comscout-workspacesR2 bucket",
    );
  });

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
        alchemyPreview: { state: "absent" },
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

  it("shows the preview of a pull request from the Alchemy state of the team", () => {
    // The preview of samebase/base-alchemy#24, read from the captured stage pr-24.
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PullRequestResources
        resource={{
          state: "current",
          resources: {
            pullRequestId: "pull-request-24",
            cloudflareBuilds: { state: "available" },
            workers: [],
            convexProjects: [],
            hostingPreviews: {
              cloudflare: { state: "available", previews: [] },
              netlify: { state: "available", previews: [] },
            },
            alchemyPreview: {
              state: "available",
              convexDeployments: [
                {
                  name: "nautical-eagle-647",
                  href: "https://nautical-eagle-647.convex.site",
                  rootDirectory: "/",
                  headCommit: null,
                },
              ],
              workers: [],
            },
          },
        }}
        settingsHref="/repo/samebase/base-alchemy/settings"
      />,
    );

    const deployment = container.querySelector(
      '[role="group"][aria-label="Convex deployment nautical-eagle-647"]',
    );
    expect(deployment?.querySelector("a")?.getAttribute("href")).toBe(
      "https://nautical-eagle-647.convex.site",
    );
    expect(deployment?.textContent).toBe(
      "nautical-eagle-647Convex deploymentMay be from an earlier commit",
    );
  });

  it("shows the head commit in place of the note when the run record names the head", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PullRequestResources
        resource={{
          state: "current",
          resources: {
            pullRequestId: "pull-request-23",
            cloudflareBuilds: { state: "available" },
            workers: [],
            convexProjects: [],
            hostingPreviews: {
              cloudflare: { state: "available", previews: [] },
              netlify: { state: "available", previews: [] },
            },
            alchemyPreview: {
              state: "available",
              convexDeployments: [
                {
                  name: "nautical-eagle-647",
                  href: "https://nautical-eagle-647.convex.site",
                  rootDirectory: "/",
                  headCommit: "e63be559a98682f3b67090f9d9e294694e87fad2",
                },
              ],
              workers: [
                {
                  name: "tmp-k7m2-rows-pr-1",
                  url: "https://tmp-k7m2-rows-pr-1.pfp.workers.dev",
                  rootDirectory: "/",
                  headCommit: "e63be559a98682f3b67090f9d9e294694e87fad2",
                },
              ],
            },
          },
        }}
        settingsHref="/repo/samebase/base-alchemy/settings"
      />,
    );

    expect(
      container.querySelector('[role="group"][aria-label="Convex deployment nautical-eagle-647"]')
        ?.textContent,
    ).toBe("nautical-eagle-647Convex deploymente63be55");
    expect(
      container.querySelector('[role="group"][aria-label="Cloudflare Worker tmp-k7m2-rows-pr-1"]')
        ?.textContent,
    ).toBe("tmp-k7m2-rows-pr-1WorkerBranch previewe63be55");
    expect(container.textContent).not.toContain("May be from an earlier commit");
  });

  it("shows a Worker preview of a pull request from the Alchemy state of the team", () => {
    // The `pr-1` Worker URL measured in research/2026-10-21-alchemy-state-rows-for-workers-and-convex.md.
    const roots = buildPullRequestEnvironmentRoots({
      resources: {
        pullRequestId: "pull-request-1",
        cloudflareBuilds: { state: "available" },
        workers: [],
        convexProjects: [],
        hostingPreviews: {
          cloudflare: { state: "available", previews: [] },
          netlify: { state: "available", previews: [] },
        },
        alchemyPreview: {
          state: "available",
          convexDeployments: [],
          workers: [
            {
              name: "tmp-k7m2-rows-pr-1",
              url: "https://tmp-k7m2-rows-pr-1.pfp.workers.dev",
              rootDirectory: "/",
              headCommit: null,
            },
          ],
        },
      },
    });

    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<RepositoryEnvironmentTree roots={roots} />);
    expect(container.textContent).toBe(
      "tmp-k7m2-rows-pr-1WorkerBranch previewMay be from an earlier commit",
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://tmp-k7m2-rows-pr-1.pfp.workers.dev",
    );
  });

  it("places a preview of the Alchemy state in its directory of the repository", () => {
    // The preview of samebase/samebase#1768, as buildPullRequestAlchemyPreview reads the captured
    // stage pr-1768.
    const roots = buildPullRequestEnvironmentRoots({
      resources: {
        pullRequestId: "pull-request-1768",
        cloudflareBuilds: { state: "available" },
        workers: [],
        convexProjects: [],
        hostingPreviews: {
          cloudflare: { state: "available", previews: [] },
          netlify: { state: "available", previews: [] },
        },
        alchemyPreview: {
          state: "available",
          convexDeployments: [
            {
              name: "aware-bobcat-542",
              href: "https://aware-bobcat-542.convex.site",
              rootDirectory: "apps/samebase",
              headCommit: "429c1218a16d2ee74b9da68d684dc460a0a67ce8",
            },
          ],
          workers: [],
        },
      },
    });

    expect(roots.map((root) => root.rootDirectory)).toEqual(["apps/samebase"]);
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
          alchemyPreview: { state: "absent" },
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
      alchemyPreview: { state: "absent" as const },
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
            alchemyPreview: { state: "absent" },
          },
        }}
        settingsHref="/repo/ada/demo/settings"
      />,
    );

    expect(markup).toContain("Could not load Cloudflare build status");
    expect(markup).not.toContain("Unavailable");
  });

  it("keeps an unavailable pull request head out of Cloudflare comment errors", () => {
    const markup = renderToStaticMarkup(
      <PullRequestResources
        resource={{ state: "failed" }}
        settingsHref="/repo/ada/demo/settings"
      />,
    );

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
        alchemyPreview: { state: "absent" },
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
  it("shows rootless hosting previews and only offers setup for Cloudflare Workers", async () => {
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
      resourcesStale: false,
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
              alchemyPreview: { state: "absent" },
            },
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
      const connectWorker = otherPreviews?.querySelector(
        'a[aria-label="Connect Cloudflare Worker comment-worker in repository settings"]',
      );
      expect(connectWorker?.getAttribute("href")).toBe("/repo/ada/demo/settings?add-cloudflare");
      expect(
        otherPreviews?.querySelector(
          'a[aria-label="Connect comment-pages in repository settings"]',
        ),
      ).toBeNull();

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
          settingsState={buildRepositorySettingsState({
            cloudflareObservations,
            cloudflareAccount: undefined,
            cloudflareBuildTokens: { state: "not_available" },
            convexObservations,
            pendingAction: null,
            repository,
          })}
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
            environmentRoots: [],
            githubRepositoryUrl: "https://github.com/ada/demo",
            pullRequests: { state: "not_requested" },
            repository,
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('href="https://github.com/ada/demo"');
  });

  it("shows first-time Cloudflare setup until a Worker is attached", () => {
    const repository = makeRepositorySettingsBuilderRepository({
      providerPlan: {
        convexConfigPath: "convex.json",
        convex: {
          state: "created",
          deploymentRegion: "aws-us-east-1",
          projectName: "demo-convex",
          projectId: "demo-project-id",
          teamId: "team-1",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          buildTokenUuid: null,
          workerName: "demo-worker",
          rootDirectory: "/",
        },
      },
      providerSetup: { status: "not_applicable" },
      hasConvexProvision: true,
      convexProjects: [makeRepositorySettingsConvexProject({})],
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
    const renderOverview = (currentRepository: typeof repository) =>
      renderToStaticMarkup(
        <TestRouterProvider initialEntries={["/repo/ada/demo"]}>
          <RepositoryOverviewPage
            developerToolsVisible={false}
            isRetryingRepositoryAction={false}
            onOpenDeleteDialog={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryRepositoryDeletion={() => {}}
            page="overview"
            settingsState={{
              addCloudflareWorker: { disabled: false },
              addConvexProject: { disabled: false },
              providerActionBlockReason: null,
              providerSettingsOwner: null,
              roots: [],
            }}
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
              environmentRoots: [],
              githubRepositoryUrl: "https://github.com/ada/demo",
              pullRequests: { state: "not_requested" },
              repository: currentRepository,
            }}
          />
        </TestRouterProvider>,
      );

    const incompleteMarkup = renderOverview(repository);
    const attachedMarkup = renderOverview({
      ...repository,
      hasCloudflareProvision: true,
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({})],
    });

    expect(incompleteMarkup).toContain("Finish Cloudflare setup");
    expect(incompleteMarkup).toContain('href="/docs/cloudflare-setup"');
    expect(attachedMarkup).not.toContain("Finish Cloudflare setup");
  });

  it("keeps safe provider links during setup and provider checks", () => {
    const repository = makeRepositorySettingsBuilderRepository({});
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
      environmentRoots: [],
      githubRepositoryUrl: "https://github.com/ada/demo",
      pullRequests: { state: "not_requested" as const },
      repository,
    };
    const queryClient = new QueryClient();
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TestRouterProvider initialEntries={["/repo/ada/demo/settings"]}>
          <RepositorySettings
            developerToolsVisible={false}
            onOpenDeleteDialog={() => {}}
            settingsState={{
              addCloudflareWorker: { disabled: true },
              addConvexProject: { disabled: true },
              providerActionBlockReason: "A provider operation is in progress.",
              providerSettingsOwner: null,
              roots: [
                {
                  rootDirectory: "/",
                  resources: [
                    {
                      href: "https://dash.cloudflare.com/example",
                      name: "demo-worker",
                      provider: "cloudflare",
                      resourceId: "worker",
                      state: "setting_up",
                      warning: "Cloudflare now uses the name renamed-worker.",
                    },
                    {
                      href: "https://dashboard.convex.dev/example",
                      name: "demo-convex",
                      provider: "convex",
                      resourceId: "project",
                      state: "checking",
                    },
                  ],
                },
              ],
            }}
            workspace={workspace}
          />
        </TestRouterProvider>
      </QueryClientProvider>,
    );

    expect(markup).toContain('href="https://dash.cloudflare.com/example"');
    expect(markup).toContain('href="https://dashboard.convex.dev/example"');
    expect(markup).toContain('role="status">Cloudflare now uses the name renamed-worker.</div>');
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
      environmentRoots: [],
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
                settingsState={{
                  addCloudflareWorker: { disabled: true },
                  addConvexProject: { disabled: true },
                  providerActionBlockReason: null,
                  providerSettingsOwner: null,
                  roots: [],
                }}
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
    onDeleteOptionChange: () => {},
    onOpenChange: () => {},
    onRemoveRepository: () => {},
    progress: "idle",
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    stagedChangesCount: 0,
  } satisfies Omit<Parameters<typeof RepositoryDeleteDialogContent>[0], "target">;

  it("allows Cloudflare cleanup for provisioned Workers on connected repositories", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialogContent
        {...baseProps}
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "ada/existing-repo",
          isSamebaseManaged: false,
          canRemoveGithubRepo: false,
          hasConvexProvision: false,
          hasCloudflareProvision: true,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision: true,
          setupStack: null,
        }}
      />,
    );

    expect(markup).toContain("Also delete the Cloudflare Worker");
    expect(markup).not.toContain("Only available for Workers created from this app.");
  });

  it("shows Convex cleanup when a failed create left a removable project", () => {
    const markup = renderToStaticMarkup(
      <RepositoryDeleteDialogContent
        {...baseProps}
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "ada/existing-repo",
          isSamebaseManaged: false,
          canRemoveGithubRepo: false,
          hasConvexProvision: false,
          hasCloudflareProvision: false,
          canRemoveConvexProvision: true,
          canRemoveCloudflareProvision: false,
          setupStack: null,
        }}
      />,
    );

    expect(markup).toContain("Also delete the Convex project and deployment");
    expect(markup).not.toContain("Only available for infrastructure provisioned by Samebase.");
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
          hasConvexProvision: true,
          hasCloudflareProvision: true,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision: false,
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
      'workflow, click Run workflow, and type <span class="font-mono">delete ada/chess-merge</span> in its field.',
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
          hasConvexProvision: false,
          hasCloudflareProvision: false,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision: false,
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

describe("RepositoryConvexDialog", () => {
  it("uses the live region and resolves a public project name conflict", async () => {
    const discoverProjects = vi.fn(async () => ({
      source: {
        completeness: "complete" as const,
        defaultBranch: "main",
        commitSha: "commit-root",
        treeSha: "tree-root",
        locations: [
          {
            kind: "config" as const,
            convexConfigPath: "convex.json",
            rootDirectory: "/",
            blobSha: "blob-root",
          },
        ],
      },
      projects: [],
    }));
    const createProject = vi.fn(async () => fakeConvexProjectId());
    createProject.mockRejectedValueOnce(
      new ConvexError("A Convex project named demo already exists."),
    );
    const onSaved = vi.fn();
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.repository.convex.findProjects)) {
        return discoverProjects;
      }
      if (actionName === getFunctionName(api.repository.convex.createProject)) {
        return createProject;
      }
      return vi.fn();
    });
    useQueryMock.mockImplementation((query: FunctionReference<"query">, args: unknown) =>
      getFunctionName(query) === getFunctionName(api.convexDeploymentRegions.getDefault) &&
      args !== "skip"
        ? "aws-eu-west-1"
        : undefined,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } },
    });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <RepositoryConvexDialog
              blockedReason={null}
              onClose={() => {}}
              onSaved={onSaved}
              repairProjectId={null}
              repository={makeRepositorySettingsBuilderRepository({})}
            />
          </QueryClientProvider>,
        );
      });

      const createButton = await act(() =>
        vi.waitFor(() => {
          const button = [...rootElement.querySelectorAll("button")].find(
            (candidate) => candidate.textContent === "Create",
          );
          if (!button) {
            throw new Error("Expected the Create project mode button.");
          }
          return button;
        }),
      );
      await act(async () => createButton.click());
      await act(() =>
        vi.waitFor(() =>
          expect(document.getElementById("repository-convex-production-region")).toBeInstanceOf(
            HTMLButtonElement,
          ),
        ),
      );
      const regionSelect = document.getElementById("repository-convex-production-region");
      if (!(regionSelect instanceof HTMLButtonElement)) {
        throw new Error("Expected the Convex production region selector.");
      }

      expect(regionSelect.textContent).toContain("EU West (Ireland)");
      const submitButton = [...rootElement.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Create project",
      );
      if (!submitButton) {
        throw new Error("Expected the Create project button.");
      }
      await act(async () => submitButton.click());

      await vi.waitFor(() =>
        expect(createProject).toHaveBeenCalledWith({
          repositoryId: fakeRepositoryId(),
          projectName: "demo",
          deploymentRegion: "aws-eu-west-1",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "blob-root",
          },
        }),
      );
      await vi.waitFor(() =>
        expect(rootElement.textContent).toContain(
          "A Convex project named demo already exists. Choose another name.",
        ),
      );
      expect(onSaved).not.toHaveBeenCalled();
      expect(submitButton.disabled).toBe(true);
      const useSuggestionButton = [...rootElement.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Use demo-2",
      );
      if (!useSuggestionButton) {
        throw new Error("Expected the Convex project name suggestion.");
      }
      await act(async () => useSuggestionButton.click());
      const projectNameInput = rootElement.querySelector<HTMLInputElement>(
        "input[placeholder='Project name']",
      );
      expect(projectNameInput?.value).toBe("demo-2");
      expect(submitButton.disabled).toBe(false);
      await act(async () => submitButton.click());
      await vi.waitFor(() =>
        expect(createProject).toHaveBeenLastCalledWith({
          repositoryId: fakeRepositoryId(),
          projectName: "demo-2",
          deploymentRegion: "aws-eu-west-1",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "blob-root",
          },
        }),
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      rootElement.remove();
      useActionMock.mockReset();
      useQueryMock.mockReset();
    }
  });
});

describe("RepositoryConvexDialogContent", () => {
  type ConvexDialogProps = Parameters<typeof RepositoryConvexDialogContent>[0];

  const repository = {
    id: fakeRepositoryId(),
    githubRepositoryFullName: "ada/demo",
    repositoryName: "demo",
  };

  const codeLocations = [
    {
      state: "valid" as const,
      kind: "config" as const,
      convexConfigPath: "convex.json",
      rootDirectory: "/",
      blobSha: "blob-root",
    },
    {
      state: "valid" as const,
      kind: "config" as const,
      convexConfigPath: "apps/web/convex.json",
      rootDirectory: "apps/web",
      blobSha: "blob-web",
    },
    {
      state: "valid" as const,
      kind: "directory" as const,
      convexDirectoryPath: "apps/api/convex",
      rootDirectory: "apps/api",
      convexDirectoryTreeSha: "tree-api",
      packageJsonPath: "apps/api/package.json",
      packageJsonBlobSha: "blob-api-package",
    },
  ];

  const projects = [
    {
      attachment: "attachable" as const,
      teamId: "team-1",
      projectId: "project-1",
      projectName: "Web",
      projectSlug: "web",
      productionDeployment: { state: "available" as const, region: "aws-eu-west-1" as const },
      teamSlug: "ada",
      workerReferences: [
        {
          accountId: "account-1",
          workerName: "web-worker",
          workerTag: "worker-tag",
          rootDirectory: "apps/web",
          markerTeamId: "team-1",
          access: "configured" as const,
        },
      ],
    },
    {
      attachment: "attachable" as const,
      teamId: "team-1",
      projectId: "project-2",
      projectName: "API",
      projectSlug: "api",
      productionDeployment: { state: "missing" as const },
      teamSlug: "ada",
      workerReferences: [],
    },
  ];

  it("supports selecting multiple existing projects with an explicit config for each", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={[projects[1], projects[0]]}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={{
          "project-1": "config:apps/web/convex.json",
          "project-2": "config:convex.json",
        }}
        sourceCompleteness="complete"
        repository={repository}
      />,
    );

    expect(markup).toContain("Add Convex to ada/demo");
    expect(markup).toContain("Web");
    expect(markup).toContain("API");
    expect(markup).toContain("Production: 🇪🇺 EU West (Ireland)");
    expect(markup).toContain("No production deployment");
    expect(markup).toContain("Used by web-worker");
    expect(markup).toContain("Add 2 projects");
    expect(markup.indexOf(">Web<")).toBeLessThan(markup.indexOf(">API<"));
    expect(markup).not.toContain("App root");
  });

  it("keeps the discovered selection retryable after a submit error", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={projects}
        error="Could not attach the selected Convex project."
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={{ "project-1": "config:apps/web/convex.json" }}
        sourceCompleteness="complete"
        repository={repository}
      />,
    );
    const addButton = markup.match(/<button[^>]*>Add 1 project<\/button>/)?.[0];

    expect(markup).toContain("Could not attach the selected Convex project.");
    expect(markup).toContain(">Web<");
    expect(addButton).toBeDefined();
    expect(addButton).not.toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("shows the operation block reason and disables confirmation", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        blockedReason="A provider operation is in progress."
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={projects}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={{
          "project-1": "config:apps/web/convex.json",
        }}
        sourceCompleteness="complete"
        repository={repository}
      />,
    );
    const addButton = markup.match(/<button[^>]*>Add 1 project<\/button>/)?.[0];

    expect(markup).toContain("A provider operation is in progress.");
    expect(addButton).toBeDefined();
    expect(addButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("keeps Cancel enabled when a pending submit needs recovery", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        blockedReason="Samebase could not confirm Convex project creation."
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={projects}
        error={null}
        isLoading={false}
        isSubmitting
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={{
          "project-1": "config:apps/web/convex.json",
        }}
        sourceCompleteness="complete"
        repository={repository}
      />,
    );
    const cancelButton = markup.match(/<button[^>]*>Cancel<\/button>/)?.[0];

    expect(cancelButton).toBeDefined();
    expect(cancelButton).not.toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("shows empty discovery messages only after a successful complete scan", () => {
    const renderDiscoveryState = ({
      codeLocations,
      error,
      isLoading,
      sourceCompleteness,
    }: Pick<ConvexDialogProps, "codeLocations" | "error" | "isLoading" | "sourceCompleteness">) =>
      renderToStaticMarkup(
        <RepositoryConvexDialogContent
          codeLocations={codeLocations}
          createCodeLocationKey=""
          createDeploymentRegion={null}
          convexDeploymentRegionField={null}
          createProjectNameConflict={null}
          createProjectName=""
          projects={[]}
          error={error}
          isLoading={isLoading}
          isSubmitting={false}
          mode="existing"
          onCreateCodeLocationKeyChange={() => {}}
          onCreateProjectNameChange={() => {}}
          onModeChange={() => {}}
          onOpenChange={() => {}}
          onProjectCodeLocationKeyChange={() => {}}
          onProjectToggle={() => {}}
          onSubmit={() => {}}
          repairProject={null}
          selectedProjectCodeLocationKeys={{}}
          sourceCompleteness={sourceCompleteness}
          repository={repository}
        />,
      );

    const beforeDiscoveryStarts = renderDiscoveryState({
      codeLocations: [],
      error: null,
      isLoading: false,
      sourceCompleteness: null,
    });
    const whileLoading = renderDiscoveryState({
      codeLocations: [],
      error: null,
      isLoading: true,
      sourceCompleteness: null,
    });
    const afterFailure = renderDiscoveryState({
      codeLocations: [],
      error: "Could not discover Convex projects.",
      isLoading: false,
      sourceCompleteness: null,
    });
    const completeWithoutCodeLocations = renderDiscoveryState({
      codeLocations: [],
      error: null,
      isLoading: false,
      sourceCompleteness: "complete",
    });
    const completeWithoutProjects = renderDiscoveryState({
      codeLocations,
      error: null,
      isLoading: false,
      sourceCompleteness: "complete",
    });

    for (const markup of [beforeDiscoveryStarts, whileLoading, afterFailure]) {
      expect(markup).not.toContain("No valid convex.json files were found");
      expect(markup).not.toContain("No unattached Convex projects are available");
    }
    expect(whileLoading).toContain('role="status"');
    expect(whileLoading).toContain("Searching for Convex code and projects");
    expect(whileLoading).not.toContain(">Existing<");
    expect(whileLoading).not.toContain("Add projects");
    expect(afterFailure).toContain("Could not discover Convex projects.");
    expect(completeWithoutCodeLocations).toContain(
      "No convex.json or package.json with a sibling convex/ directory was found",
    );
    expect(completeWithoutProjects).toContain("No unattached Convex projects are available");
  });

  it("uses the same closed selector to repair a moved code location", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={projects}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={{
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          projectId: "project-1",
        }}
        selectedProjectCodeLocationKeys={{}}
        sourceCompleteness="complete"
        repository={repository}
      />,
    );

    expect(markup).toContain("Change project-1 code location");
    expect(markup).toContain("Current location: convex.json");
    expect(markup).toContain("Change code location");
    expect(markup).not.toContain(">Existing<");
    expect(markup).not.toContain(">Create<");
  });

  it("does not claim that no configs exist after a partial source scan", () => {
    const markup = renderToStaticMarkup(
      <RepositoryConvexDialogContent
        codeLocations={[]}
        createCodeLocationKey=""
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectNameConflict={null}
        createProjectName=""
        projects={[]}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={{}}
        sourceCompleteness="partial"
        repository={repository}
      />,
    );

    expect(markup).toContain("could not be fully scanned");
    expect(markup).not.toContain("No valid convex.json files were found");
  });
});

describe("RepositoryCloudflareDialogContent", () => {
  const repository = {
    id: fakeRepositoryId(),
    githubRepositoryFullName: "ada/demo",
    repositoryName: "demo",
  };

  it("configures Builds with the stored root", async () => {
    const workerId = fakeCloudflareWorkerId("worker-builds-repair");
    const configureWorkersBuilds = vi.fn(async () => null);
    const listBuildTokens = vi.fn(async () => ({
      accountId: "account-1",
      lastUsedBuildTokenUuid: "last-used-build-token",
      tokens: [
        { name: "Build token", uuid: "build-token" },
        { name: "Last used build token", uuid: "last-used-build-token" },
      ],
    }));
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.cloudflareBuildTokens.list)) {
        return listBuildTokens;
      }
      if (actionName === getFunctionName(api.repository.cloudflare.configureBuilds)) {
        return configureWorkersBuilds;
      }
      return vi.fn();
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <RepositoryCloudflareDialog
              blockedReason={null}
              convexObservations={{ state: "loading" }}
              onClose={() => {}}
              repairBuildTokenUuid="build-token"
              repairWorkerId={workerId}
              repository={makeRepositorySettingsBuilderRepository({
                cloudflareWorkers: [
                  makeRepositorySettingsCloudflareWorker({
                    workerId,
                    rootDirectory: "apps/saved",
                  }),
                ],
              })}
            />
          </QueryClientProvider>,
        );
      });

      let submitButton: HTMLButtonElement | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        submitButton = [...rootElement.querySelectorAll("button")].find(
          (button) => button.textContent === "Configure Workers Builds" && !button.disabled,
        );
        if (submitButton) {
          break;
        }
        await act(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
        });
      }
      if (!submitButton) {
        throw new Error("Expected the enabled Configure Workers Builds button.");
      }
      await act(async () => {
        submitButton.click();
      });
      for (
        let attempt = 0;
        attempt < 100 && configureWorkersBuilds.mock.calls.length === 0;
        attempt += 1
      ) {
        await act(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 5));
        });
      }

      expect(configureWorkersBuilds).toHaveBeenCalledWith({
        buildTokenUuid: "build-token",
        rootDirectory: "apps/saved",
        repositoryId: fakeRepositoryId(),
        workerId,
      });
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      rootElement.remove();
      useActionMock.mockReset();
    }
  });

  it("replaces disabled controls with a timed loading state while searching", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        createRootDirectory="/"
        createWorkerNameConflict={null}
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading
        isSubmitting={false}
        inventoryState={null}
        mode="existing"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Searching for Cloudflare Workers");
    expect(markup).not.toContain("Cloudflare account");
    expect(markup).not.toContain(">Existing<");
    expect(markup).not.toContain("Add Workers");
  });

  it("separates connected selections and keeps them pending after another Worker is added", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        createRootDirectory="/"
        createWorkerNameConflict={null}
        createWorkerName=""
        didAddWorker
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="existing"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={["root-tag", "web-tag"]}
        repository={repository}
        workerToConnect={null}
        workers={[
          {
            attachment: "attachable",
            workerName: "root-worker",
            workerTag: "root-tag",
            rootDirectory: "/",
          },
          {
            attachment: "attachable",
            workerName: "web-worker",
            workerTag: "web-tag",
            rootDirectory: "apps/web",
          },
          { attachment: "connectable", workerName: "portal-worker", workerTag: "portal-tag" },
          {
            attachment: "connected_elsewhere",
            workerName: "other-repository",
            workerTag: "other-tag",
          },
          { attachment: "attached", workerName: "attached-worker", workerTag: "attached-tag" },
          {
            attachment: "attached_elsewhere",
            workerName: "other-app-worker",
            workerTag: "other-app-tag",
          },
          {
            attachment: "unavailable",
            workerName: "unverified-worker",
            workerTag: "unverified-tag",
          },
        ]}
      />,
    );

    expect(markup).toContain("Add Cloudflare to ada/demo");
    expect(markup).toContain("root-worker");
    expect(markup).toContain("apps/web");
    expect(markup).toContain("web-worker");
    expect(markup).toContain("Add 2 Workers");
    expect(markup).toContain("Close");
    expect(markup).toContain("Connect another Worker");
    expect(markup).not.toContain("Done");
    expect(markup).not.toContain("portal-worker");
    expect(markup).not.toContain("other-repository");
    expect(markup).not.toContain("attached-worker");
    expect(markup).not.toContain("other-app-worker");
    expect(markup).not.toContain("unverified-worker");
    expect(markup).not.toContain("App root");
  });

  it("asks for one repository root before connecting and adding an unconnected Worker", async () => {
    const discoverWorkers = vi.fn(async () => ({
      inventoryState: "complete" as const,
      workers: [
        {
          attachment: "connectable" as const,
          workerName: "portal-worker",
          workerTag: "portal-tag",
        },
      ],
    }));
    const listBuildTokens = vi.fn(async () => ({
      accountId: "account-1",
      lastUsedBuildTokenUuid: "build-token",
      tokens: [{ name: "Build token", uuid: "build-token" }],
    }));
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.repository.cloudflare.findWorkers)) {
        return discoverWorkers;
      }
      if (actionName === getFunctionName(api.cloudflareBuildTokens.list)) {
        return listBuildTokens;
      }
      return vi.fn();
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <RepositoryCloudflareDialog
              blockedReason={null}
              convexObservations={{ state: "loading" }}
              onClose={() => {}}
              repairBuildTokenUuid={null}
              repairWorkerId={null}
              repository={makeRepositorySettingsBuilderRepository({ cloudflareWorkers: [] })}
            />
          </QueryClientProvider>,
        );
      });

      const connectAnotherButton = await act(() =>
        vi.waitFor(() => {
          const button = [...rootElement.querySelectorAll("button")].find(
            (candidate) => candidate.textContent === "Connect another Worker",
          );
          if (!button) {
            throw new Error("Expected the Connect another Worker button.");
          }
          return button;
        }),
      );
      await act(async () => {
        connectAnotherButton.click();
      });

      const repositoryRootLabel = [...rootElement.querySelectorAll("label")].find(
        (label) => label.textContent === "Repository root",
      );
      const repositoryRootInput = repositoryRootLabel
        ? document.getElementById(repositoryRootLabel.htmlFor)
        : null;
      if (!(repositoryRootInput instanceof HTMLInputElement)) {
        throw new Error("Expected the repository root input.");
      }
      expect(repositoryRootInput.value).toBe("/");

      const workerSelect = [
        ...rootElement.querySelectorAll<HTMLButtonElement>('[role="combobox"]'),
      ].find((button) => button.textContent.includes("Choose a Worker"));
      if (!workerSelect) {
        throw new Error("Expected the Worker select.");
      }
      await act(async () => {
        workerSelect.click();
      });
      const workerOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent === "portal-worker",
      );
      if (!workerOption) {
        throw new Error("Expected the portal-worker option.");
      }
      await act(async () => {
        workerOption.click();
      });

      expect(repositoryRootInput.value).toBe("/");
      const connectAndAddButton = [
        ...rootElement.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.textContent === "Connect and add");
      expect(connectAndAddButton?.disabled).toBe(false);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      rootElement.remove();
      useActionMock.mockReset();
    }
  });

  it("names each deploy-key Convex project by its slug when two share convex.json", async () => {
    const siteProjectId = fakeConvexProjectId("site-project-attachment");
    const adminProjectId = fakeConvexProjectId("admin-project-attachment");
    const discoverWorkers = vi.fn(async () => ({
      inventoryState: "complete" as const,
      workers: [],
    }));
    const listBuildTokens = vi.fn(async () => ({
      accountId: "account-1",
      lastUsedBuildTokenUuid: "build-token",
      tokens: [{ name: "Build token", uuid: "build-token" }],
    }));
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.repository.cloudflare.findWorkers)) {
        return discoverWorkers;
      }
      if (actionName === getFunctionName(api.cloudflareBuildTokens.list)) {
        return listBuildTokens;
      }
      return vi.fn();
    });
    const observation = (convexProjectId: typeof siteProjectId, projectSlug: string) => ({
      convexProjectId,
      projectId: `${projectSlug}-project-id`,
      codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
      source: { kind: "config" as const, state: "valid" as const },
      provider: {
        state: "current" as const,
        projectSlug,
        teamSlug: "ada",
        productionDeployment: { state: "missing" as const },
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <RepositoryCloudflareDialog
              blockedReason={null}
              convexObservations={{
                state: "loaded",
                observations: [
                  observation(siteProjectId, "site"),
                  observation(adminProjectId, "admin"),
                ],
                refreshFailed: false,
                reload: () => {},
              }}
              onClose={() => {}}
              repairBuildTokenUuid={null}
              repairWorkerId={null}
              repository={makeRepositorySettingsBuilderRepository({
                convexProjects: [
                  makeRepositorySettingsConvexProject({ convexProjectId: siteProjectId }),
                  makeRepositorySettingsConvexProject({ convexProjectId: adminProjectId }),
                ],
              })}
            />
          </QueryClientProvider>,
        );
      });

      const createButton = await act(() =>
        vi.waitFor(() => {
          const button = [...rootElement.querySelectorAll("button")].find(
            (candidate) => candidate.textContent === "Create" && !candidate.disabled,
          );
          if (!button) {
            throw new Error("Expected the Create button.");
          }
          return button;
        }),
      );
      await act(async () => {
        createButton.click();
      });
      const projectSelect = [
        ...rootElement.querySelectorAll<HTMLButtonElement>('[role="combobox"]'),
      ].find((button) => button.textContent.includes("Choose a Convex project"));
      if (!projectSelect) {
        throw new Error("Expected the Convex project select.");
      }
      await act(async () => {
        projectSelect.click();
      });

      expect(
        [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
          (option) => option.textContent,
        ),
      ).toEqual(["site (convex.json)", "admin (convex.json)"]);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      rootElement.remove();
      useActionMock.mockReset();
    }
  });

  it("keeps the deploy-key Convex project choice closed until the slugs tell two projects at convex.json apart", async () => {
    const siteProjectId = fakeConvexProjectId("site-project-attachment");
    const adminProjectId = fakeConvexProjectId("admin-project-attachment");
    const discoverWorkers = vi.fn(async () => ({
      inventoryState: "complete" as const,
      workers: [],
    }));
    const listBuildTokens = vi.fn(async () => ({
      accountId: "account-1",
      lastUsedBuildTokenUuid: "build-token",
      tokens: [{ name: "Build token", uuid: "build-token" }],
    }));
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.repository.cloudflare.findWorkers)) {
        return discoverWorkers;
      }
      if (actionName === getFunctionName(api.cloudflareBuildTokens.list)) {
        return listBuildTokens;
      }
      return vi.fn();
    });
    const repository = makeRepositorySettingsBuilderRepository({
      convexProjects: [
        makeRepositorySettingsConvexProject({ convexProjectId: siteProjectId }),
        makeRepositorySettingsConvexProject({ convexProjectId: adminProjectId }),
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const render = (
      convexObservations: ComponentProps<typeof RepositoryCloudflareDialog>["convexObservations"],
    ) =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <RepositoryCloudflareDialog
            blockedReason={null}
            convexObservations={convexObservations}
            onClose={() => {}}
            repairBuildTokenUuid={null}
            repairWorkerId={null}
            repository={repository}
          />
        </QueryClientProvider>,
      );
    const findButton = (label: string) =>
      [...rootElement.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === label,
      );
    const findProjectSelect = () =>
      [...rootElement.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].find((button) =>
        button.textContent.includes("Choose a Convex project"),
      );

    try {
      await act(async () => {
        render({ state: "loading" });
      });
      const createButton = await act(() =>
        vi.waitFor(() => {
          const button = findButton("Create");
          if (!button || button.disabled) {
            throw new Error("Expected the Create button.");
          }
          return button;
        }),
      );
      await act(async () => {
        createButton.click();
      });

      expect(findProjectSelect()?.disabled).toBe(true);
      expect(findButton("Create Worker")?.disabled).toBe(true);
      expect(rootElement.textContent).not.toContain("could not load the Convex project slugs");

      await act(async () => {
        render({ state: "failed", reload: () => {} });
      });

      expect(findProjectSelect()?.disabled).toBe(true);
      expect(findButton("Create Worker")?.disabled).toBe(true);
      expect(rootElement.textContent).toContain(
        "Samebase could not load the Convex project slugs, so it cannot tell apart the projects that share a code location.",
      );
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      rootElement.remove();
      useActionMock.mockReset();
    }
  });

  it("shows the repository root only when creating a Worker", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={<div>API token</div>}
        convexProjectField={null}
        hasSelectedBuildToken={false}
        hasSelectedConvexProject
        createRootDirectory="apps/web"
        createWorkerNameConflict={null}
        createWorkerName="samebase-app"
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="create"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );
    const createButton = markup.match(/<button[^>]*>Create Worker<\/button>/)?.[0];

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Repository root");
    expect(markup).toContain('value="apps/web"');
    expect(markup).toContain("API token");
    expect(markup).toContain("Create Worker");
    expect(createButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
    expect(markup).not.toContain("cloudflare-worker-name-error");
  });

  it("shows a normalized Worker name without blocking submission", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        createRootDirectory="apps/web"
        createWorkerNameConflict={null}
        createWorkerName="samebase_app"
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="create"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );
    const createButton = markup.match(/<button[^>]*>Create Worker<\/button>/)?.[0];

    expect(markup).toContain("Samebase will use");
    expect(markup).toContain('aria-label="Use samebase-app"');
    expect(markup).toContain(">samebase-app</code>");
    expect(markup).not.toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="cloudflare-worker-name-notice"');
    expect(markup).toContain('id="cloudflare-worker-name-notice" role="status"');
    expect(createButton).toBeDefined();
    expect(createButton).not.toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("disables Create Worker until the deploy-key Convex project is chosen", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={<div>Convex project for deploy keys</div>}
        hasSelectedBuildToken
        hasSelectedConvexProject={false}
        createRootDirectory="/"
        createWorkerNameConflict={null}
        createWorkerName="samebase-app"
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="create"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );
    const createButton = markup.match(/<button[^>]*>Create Worker<\/button>/)?.[0];

    expect(markup).toContain("Convex project for deploy keys");
    expect(createButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("shows the operation block reason and disables confirmation", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        blockedReason="A provider operation is in progress."
        createRootDirectory="apps/web"
        createWorkerNameConflict={null}
        createWorkerName="web-worker"
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="create"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );
    const createButton = markup.match(/<button[^>]*>Create Worker<\/button>/)?.[0];

    expect(markup).toContain("A provider operation is in progress.");
    expect(createButton).toBeDefined();
    expect(createButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("shows an enabled Close action when a pending connection needs recovery", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        blockedReason="Samebase could not confirm the Cloudflare Worker connection."
        createRootDirectory="apps/web"
        createWorkerNameConflict={null}
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting
        inventoryState="complete"
        mode="connect"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={{ workerName: "web-worker", workerTag: "worker-tag" }}
        workers={[]}
      />,
    );
    const closeButton = markup.match(/<button[^>]*>Close<\/button>/)?.[0];

    expect(closeButton).toBeDefined();
    expect(closeButton).not.toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
    expect(markup).not.toContain(">Back</button>");
  });

  it("does not claim that no Workers exist after a partial inventory", () => {
    const markup = renderToStaticMarkup(
      <RepositoryCloudflareDialogContent
        cloudflareBuildTokenField={null}
        convexProjectField={null}
        hasSelectedBuildToken
        hasSelectedConvexProject
        createRootDirectory="/"
        createWorkerNameConflict={null}
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="partial"
        mode="existing"
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedWorkerTags={[]}
        repository={repository}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain("Worker list may be incomplete");
    expect(markup).not.toContain("No Workers connected to this repository were found");
  });
});

describe("buildRepositorySettingsState", () => {
  it("shows migration guidance instead of failing repair actions for legacy previews", () => {
    const workerId = fakeCloudflareWorkerId("worker-legacy-previews");
    const state = buildRepositorySettingsState({
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [makeAvailableRepositorySettingsCloudflareObservation({ workerId })],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId,
            repository: {
              state: "ready",
              rootDirectory: "/",
              builds: { state: "legacy_previews" },
            },
            productionBuild: {
              state: "available",
              buildState: "success",
              commitHash: null,
              logsUrl: "https://dash.cloudflare.com/legacy-build",
            },
          }),
        ],
        convexBuildAccess: [],
      }),
      configureWorkersBuildsForGitHubOnClick: vi.fn(),
      rotateConvexDeployKeysForWorkersBuildsOnClick: vi.fn(),
      detachCloudflareWorkerOnClick: vi.fn(),
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      pendingAction: null,
      repository: makeRepositorySettingsBuilderRepository({
        cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
      }),
    });
    const row = getRepositorySettingsResource(state, "/", "cloudflare");
    expect(row).toMatchObject({
      state: "available",
      workerPreviewsMigrationRequired: true,
      href: "https://dash.cloudflare.com/?to=/account-1/workers/services/view/demo-worker/production/settings",
    });
    expect(row.description).toBeUndefined();
    expect(row.actions?.map((action) => action.label)).toEqual(["Remove from repository"]);
  });

  it("reports the live Workers Builds token binding without claiming token health", () => {
    const workerId = fakeCloudflareWorkerId("worker-build-token");
    const changeBuildToken = vi.fn();
    const readRow = ({
      buildTokenListState,
      previewBuildTokenUuid,
      productionBuildTokenUuid,
      tokens,
    }: {
      buildTokenListState?: "failed";
      previewBuildTokenUuid: string | null;
      productionBuildTokenUuid: string | null;
      tokens: readonly { name: string; uuid: string }[];
    }) => {
      const state = buildRepositorySettingsState({
        cloudflareAccount: undefined,
        cloudflareBuildTokens:
          buildTokenListState === "failed"
            ? { state: "failed", reload: () => {} }
            : { state: "loaded", tokens },
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [makeAvailableRepositorySettingsCloudflareObservation({ workerId })],
          builds: [
            makeAvailableRepositorySettingsCloudflareBuildsObservation({
              workerId,
              builds: {
                state: "connected",
                productionBuildTokenUuid,
                previewBuildTokenUuid,
              },
              productionBuild: { state: "unavailable", reasons: ["request_failed"] },
            }),
          ],
          convexBuildAccess: [
            {
              state: "available",
              workerId,
              convexBuildAccess: { state: "not_configured" },
            },
          ],
        }),
        configureWorkersBuildsForGitHubOnClick: changeBuildToken,
        convexObservations: {
          state: "loaded",
          refreshFailed: false,
          reload: () => {},
          observations: [],
        },
        pendingAction: null,
        repository: makeRepositorySettingsBuilderRepository({
          cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
        }),
      });
      return getRepositorySettingsResource(state, "/", "cloudflare");
    };

    const listedRow = readRow({
      productionBuildTokenUuid: "12345678-token",
      previewBuildTokenUuid: "12345678-token",
      tokens: [{ name: "Workers Builds - 2026-08-14 01:54", uuid: "12345678-token" }],
    });
    expect(listedRow.description).toContain(
      "API token: Workers Builds - 2026-08-14 01:54 (12345678).",
    );
    expect(listedRow.description).not.toContain("healthy");
    expect(listedRow.actions?.map((action) => action.label)).toEqual(["Change API token"]);
    listedRow.actions?.[0].onClick?.();
    expect(changeBuildToken).toHaveBeenCalledWith(workerId);

    const missingRow = readRow({
      productionBuildTokenUuid: "12345678-token",
      previewBuildTokenUuid: "12345678-token",
      tokens: [],
    });
    expect(missingRow).toMatchObject({
      state: "failed",
      description: expect.stringContaining("API token (12345678) is not in Cloudflare's list."),
    });

    const listFailedRow = readRow({
      buildTokenListState: "failed",
      productionBuildTokenUuid: "12345678-token",
      previewBuildTokenUuid: "12345678-token",
      tokens: [],
    });
    expect(listFailedRow.description).toContain("Could not load API token (12345678).");

    const mismatchedRow = readRow({
      productionBuildTokenUuid: "production-token",
      previewBuildTokenUuid: "preview-token",
      tokens: [],
    });
    expect(mismatchedRow).toMatchObject({
      state: "failed",
      description: expect.stringContaining(
        "Production and preview use different API tokens: production (producti), preview (preview-).",
      ),
    });
  });

  it("leaves the Builds token and deploy keys of a setup stack repository to its stack", () => {
    const workerId = fakeCloudflareWorkerId("worker-setup-stack");
    const buildState = (providerPlan: RepositorySettingsBuilderRepository["providerPlan"]) =>
      buildRepositorySettingsState({
        addCloudflareWorkerOnClick: vi.fn(),
        cloudflareAccount: undefined,
        cloudflareBuildTokens: {
          state: "loaded",
          tokens: [{ name: "alchemy-samebase_tmp-alchemy-v2", uuid: "12345678-token" }],
        },
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [makeAvailableRepositorySettingsCloudflareObservation({ workerId })],
          builds: [
            makeAvailableRepositorySettingsCloudflareBuildsObservation({
              workerId,
              builds: {
                state: "connected",
                productionBuildTokenUuid: "12345678-token",
                previewBuildTokenUuid: "12345678-token",
              },
              productionBuild: { state: "unavailable", reasons: ["request_failed"] },
            }),
          ],
          convexBuildAccess: [
            { state: "available", workerId, convexBuildAccess: { state: "not_configured" } },
          ],
        }),
        configureWorkersBuildsForGitHubOnClick: vi.fn(),
        convexObservations: {
          state: "loaded",
          refreshFailed: false,
          reload: () => {},
          observations: [],
        },
        pendingAction: null,
        repository: makeRepositorySettingsBuilderRepository({
          cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
          providerPlan,
        }),
        rotateConvexDeployKeysForWorkersBuildsOnClick: vi.fn(),
      });

    const samebaseState = buildState(null);
    expect(samebaseState.providerSettingsOwner).toBeNull();
    expect(
      getRepositorySettingsResource(samebaseState, "/", "cloudflare").actions?.map(
        (action) => action.label,
      ),
    ).toEqual(["Change API token"]);

    const stackState = buildState({
      provisioning: "repository_actions",
      convexConfigPath: "convex.json",
      ciSecrets: { state: "written", writtenAt: 1, credentialRevision: 1 },
    });
    expect(stackState.providerSettingsOwner).toContain("The setup stack in alchemy.run.ts");
    expect(getRepositorySettingsResource(stackState, "/", "cloudflare").actions).toBeUndefined();
    expect(stackState.addCloudflareWorker.disabled).toBe(false);
  });

  it("shows readable planned targets while managed setup is active", () => {
    const state = buildRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [],
        builds: [],
        convexBuildAccess: [],
      }),
      cloudflareAccount: {
        accountId: "account-1",
        accountName: "Ada Cloud",
      },
      cloudflareBuildTokens: { state: "not_available" },
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      pendingAction: null,
      repository: makeRepositorySettingsBuilderRepository({
        providerPlan: {
          convexConfigPath: "convex.json",
          convex: {
            state: "planned",
            deploymentRegion: "aws-eu-west-1",
            projectName: "demo-convex",
            teamId: "team-1",
          },
          cloudflare: {
            state: "planned",
            accountId: "account-1",
            buildTokenUuid: "build-token",
            workerName: "demo-worker",
            rootDirectory: "/",
          },
        },
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          runId: fakeRunId(),
          step: "attach_worker",
          updatedAt: 20,
        },
        providerWrite: {
          status: "active",
          owner: { kind: "managed_run" },
          lastWriteAt: {},
        },
      }),
    });

    expect(state.roots).toHaveLength(1);
    expect(state.roots[0]?.resources).toMatchObject([
      {
        description: "Setting up in 🇪🇺 EU West (Ireland)",
        name: "demo-convex",
        owner: "team-1",
        provider: "convex",
        state: "setting_up",
      },
      {
        description: "Setting up",
        name: "demo-worker",
        owner: "Ada Cloud",
        provider: "cloudflare",
        state: "setting_up",
      },
    ]);
    expect(state.roots[0]?.resources.every((resource) => !resource.href && !resource.actions)).toBe(
      true,
    );
    expect(state.addCloudflareWorker.disabled).toBe(true);
    expect(state.addConvexProject.disabled).toBe(true);
  });

  it("keeps planned targets after managed provider setup fails", () => {
    const state = buildRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [],
        builds: [],
        convexBuildAccess: [],
      }),
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      pendingAction: null,
      repository: makeRepositorySettingsBuilderRepository({
        providerPlan: {
          convexConfigPath: "apps/web/convex.json",
          convex: {
            state: "planned",
            deploymentRegion: "aws-eu-west-1",
            projectName: "demo-convex",
            teamId: "team-1",
          },
          cloudflare: {
            state: "planned",
            accountId: "account-1",
            buildTokenUuid: "build-token",
            workerName: "demo-worker",
            rootDirectory: "apps/web",
          },
        },
        providerSetup: {
          status: "failed",
          provider: "convex",
          runId: fakeRunId(),
          step: "attach_convex",
          message: "Convex project setup failed.",
          updatedAt: 30,
        },
        providerWrite: { status: "idle", lastWriteAt: {} },
      }),
    });

    expect(state.roots).toHaveLength(1);
    expect(state.roots[0]).toMatchObject({
      rootDirectory: "apps/web",
      resources: [
        {
          description: "Convex project setup failed.",
          name: "demo-convex",
          owner: "team-1",
          provider: "convex",
          state: "failed",
        },
        {
          description: "Convex project setup failed.",
          name: "demo-worker",
          provider: "cloudflare",
          state: "failed",
        },
      ],
    });
  });

  it("keeps saved Worker roots while provider data loads", () => {
    const workerId = fakeCloudflareWorkerId("worker-loading");
    const state = buildRepositorySettingsState({
      cloudflareObservations: {
        workers: { state: "loading" },
        builds: { state: "loading" },
        convexBuildAccess: { state: "loading" },
      },
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      pendingAction: null,
      convexObservations: { state: "loading" },
      repository: makeRepositorySettingsBuilderRepository({
        cloudflareWorkers: [
          makeRepositorySettingsCloudflareWorker({
            workerId,
            workerName: "loading-worker",
            rootDirectory: "apps/web",
          }),
        ],
      }),
    });

    expect(getRepositorySettingsResource(state, "apps/web", "cloudflare")).toMatchObject({
      name: "loading-worker",
      provider: "cloudflare",
      state: "loading",
    });
  });

  it("does not show raw Convex identifiers while fresh provider data is loading", () => {
    const convexProjectId = fakeConvexProjectId("convex-checking");
    const rawProjectId = "raw-convex-project-id";
    const rawTeamId = "raw-convex-team-id";
    const state = buildRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [],
        builds: [],
        convexBuildAccess: [],
      }),
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      pendingAction: null,
      convexObservations: { state: "checking" },
      repository: makeRepositorySettingsBuilderRepository({
        providerPlan: {
          convexConfigPath: "convex.json",
          convex: {
            state: "created",
            deploymentRegion: "aws-us-east-1",
            projectName: "readable-convex-name",
            teamId: rawTeamId,
            projectId: rawProjectId,
          },
          cloudflare: {
            state: "created",
            accountId: "cloudflare-account",
            buildTokenUuid: "build-token",
            workerName: "readable-worker-name",
            workerTag: "readable-worker-tag",
            rootDirectory: "/",
          },
        },
        convexProjects: [
          makeRepositorySettingsConvexProject({
            convexProjectId,
            projectId: rawProjectId,
            teamId: rawTeamId,
          }),
        ],
      }),
    });
    const resource = getRepositorySettingsResource(state, "/", "convex");

    expect(resource).toMatchObject({
      description: "Checking",
      name: "readable-convex-name",
      provider: "convex",
      state: "checking",
    });
    expect(resource.owner).toBeUndefined();
    expect(JSON.stringify(resource)).not.toContain(rawProjectId);
    expect(JSON.stringify(resource)).not.toContain(rawTeamId);
  });

  it("disables every provider write while a local provider action is pending", () => {
    const workerId = fakeCloudflareWorkerId("worker-pending");
    const state = buildRepositorySettingsState({
      addCloudflareWorkerOnClick: () => {},
      addConvexOnClick: () => {},
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId,
            workerName: "pending-worker",
          }),
        ],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId,
            repository: {
              state: "ready",
              rootDirectory: "/",
              builds: { state: "not_available" },
            },
          }),
        ],
        convexBuildAccess: [],
      }),
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [],
      },
      detachCloudflareWorkerOnClick: () => {},
      pendingAction: { kind: "detach_cloudflare_worker", workerId },
      repository: makeRepositorySettingsBuilderRepository({
        cloudflareWorkers: [
          makeRepositorySettingsCloudflareWorker({
            workerId,
            workerName: "pending-worker",
            rootDirectory: "/",
          }),
        ],
      }),
    });
    const resource = getRepositorySettingsResource(state, "/", "cloudflare");

    expect(state.addCloudflareWorker.disabled).toBe(true);
    expect(state.addConvexProject.disabled).toBe(true);
    expect(resource.actions?.every((action) => action.disabled)).toBe(true);
    expect(resource.actions?.map((action) => action.label)).toContain("Removing...");
  });

  it("keeps saved Worker coordinates until each provider change is approved", () => {
    const workerId = fakeCloudflareWorkerId("worker-drift");
    const updateName = vi.fn();
    const updateRoot = vi.fn();
    const readState = (
      pendingAction: Parameters<typeof buildRepositorySettingsState>[0]["pendingAction"],
    ) =>
      buildRepositorySettingsState({
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [
            makeAvailableRepositorySettingsCloudflareObservation({
              workerId,
              workerName: "renamed-worker",
            }),
          ],
          builds: [
            makeAvailableRepositorySettingsCloudflareBuildsObservation({
              workerId,
              repository: {
                state: "ready",
                rootDirectory: "apps/new-web",
                builds: {
                  state: "available",
                },
              },
              builds: {
                state: "connected",
                productionBuildTokenUuid: "build-token",
                previewBuildTokenUuid: "build-token",
              },
              productionBuild: { state: "absent" },
            }),
          ],
          convexBuildAccess: [
            {
              state: "available",
              workerId,
              convexBuildAccess: { state: "not_configured" },
            },
          ],
        }),
        cloudflareAccount: undefined,
        cloudflareBuildTokens: {
          state: "loaded",
          tokens: [{ name: "Build token", uuid: "build-token" }],
        },
        convexObservations: {
          state: "loaded",
          refreshFailed: false,
          reload: () => {},
          observations: [],
        },
        pendingAction,
        updateCloudflareWorkerNameOnClick: updateName,
        updateCloudflareWorkerRootDirectoryOnClick: updateRoot,
        repository: makeRepositorySettingsBuilderRepository({
          cloudflareWorkers: [
            makeRepositorySettingsCloudflareWorker({
              workerId,
              workerName: "saved-worker",
              rootDirectory: "apps/web",
            }),
          ],
        }),
      });

    const resource = getRepositorySettingsResource(readState(null), "apps/web", "cloudflare");
    expect(resource).toMatchObject({
      name: "saved-worker",
      state: "available",
      href: "https://dash.cloudflare.com/?to=/account-1/workers/services/view/renamed-worker/production/settings",
    });
    expect(resource.warning).toContain("Cloudflare now uses the name renamed-worker.");
    expect(resource.warning).toContain("Cloudflare now builds from apps/new-web.");
    expect(resource.actions?.map((action) => action.label)).toEqual(["Update name", "Update root"]);
    resource.actions?.[0].onClick?.();
    resource.actions?.[1].onClick?.();
    expect(updateName).toHaveBeenCalledWith(workerId, "renamed-worker");
    expect(updateRoot).toHaveBeenCalledWith(workerId, "apps/new-web");

    const pendingResource = getRepositorySettingsResource(
      readState({ kind: "update_cloudflare_worker_name", workerId }),
      "apps/web",
      "cloudflare",
    );
    expect(pendingResource.actions?.map((action) => action.label)).toEqual([
      "Updating name...",
      "Update root",
    ]);
    expect(pendingResource.actions?.every((action) => action.disabled)).toBe(true);
  });

  it("keeps resources under saved roots when provider checks fail", () => {
    const readyWorkerId = fakeCloudflareWorkerId("worker-ready");
    const unresolvedWorkerId = fakeCloudflareWorkerId("worker-unresolved");
    const convexProjectId = fakeConvexProjectId();
    const detachCloudflareWorker = vi.fn();
    const state = buildRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId: readyWorkerId,
            workerName: "web-worker",
          }),
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId: unresolvedWorkerId,
            workerName: "unresolved-worker",
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [
          makeAvailableRepositorySettingsCloudflareBuildsObservation({
            workerId: readyWorkerId,
            repository: {
              state: "ready",
              rootDirectory: "apps/web",
              builds: { state: "not_available" },
            },
          }),
          {
            state: "failed",
            workerId: unresolvedWorkerId,
            reason: "request_failed",
          },
        ],
        convexBuildAccess: [],
      }),
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      pendingAction: null,
      convexObservations: {
        state: "loaded",
        refreshFailed: false,
        reload: () => {},
        observations: [
          {
            convexProjectId,
            projectId: "api-project",
            codeLocation: { kind: "config", convexConfigPath: "packages/api/convex.json" },
            source: { state: "missing" },
            provider: {
              state: "current",
              projectSlug: "api",
              teamSlug: "ada",
              productionDeployment: {
                state: "available",
                deploymentName: "calm-mink-456",
                dashboardUrl: "https://dashboard.convex.dev/t/ada/api/calm-mink-456",
                region: "aws-eu-west-1",
              },
            },
          },
        ],
      },
      changeConvexProjectConfigPathOnClick: () => {},
      detachCloudflareWorkerOnClick: detachCloudflareWorker,
      detachConvexProjectOnClick: () => {},
      repository: makeRepositorySettingsBuilderRepository({
        cloudflareWorkers: [
          makeRepositorySettingsCloudflareWorker({
            workerId: readyWorkerId,
            workerName: "web-worker",
            rootDirectory: "apps/web",
          }),
          makeRepositorySettingsCloudflareWorker({
            workerId: unresolvedWorkerId,
            workerName: "unresolved-worker",
            rootDirectory: "packages/worker",
          }),
        ],
        convexProjects: [
          makeRepositorySettingsConvexProject({
            convexProjectId,
            codeLocation: { kind: "config", convexConfigPath: "packages/api/convex.json" },
            projectId: "api-project",
          }),
        ],
      }),
    });

    expect(state.roots.map((root) => root.rootDirectory)).toEqual([
      "apps/web",
      "packages/api",
      "packages/worker",
    ]);
    const readyCloudflareResource = getRepositorySettingsResource(state, "apps/web", "cloudflare");
    const unresolvedCloudflareResource = getRepositorySettingsResource(
      state,
      "packages/worker",
      "cloudflare",
    );
    expect(unresolvedCloudflareResource).toMatchObject({
      provider: "cloudflare",
      name: "unresolved-worker",
    });
    expect(readyCloudflareResource.actions?.map((action) => action.label)).toContain(
      "Remove from repository",
    );
    expect(unresolvedCloudflareResource.actions?.map((action) => action.label)).toContain(
      "Remove from repository",
    );
    readyCloudflareResource.actions?.find((action) => action.kind === "remove")?.onClick?.();
    expect(detachCloudflareWorker).toHaveBeenCalledWith(readyWorkerId);
    const convexResource = getRepositorySettingsResource(state, "packages/api", "convex");
    expect(convexResource).toMatchObject({
      description: expect.stringContaining("Production: 🇪🇺 EU West (Ireland)"),
      owner: "ada",
      state: "available",
      name: "api",
    });
    expect(convexResource.actions?.map((action) => action.label) ?? []).toEqual([
      "Change code location",
      "Remove from repository",
    ]);
    expect(state.addCloudflareWorker.disabled).toBe(true);
    expect(state.addConvexProject.disabled).toBe(true);
  });

  it("names exact Convex targets and limits key repair to the observed attachment", () => {
    const workerId = fakeCloudflareWorkerId("worker-build-access");
    const alphaProjectId = fakeConvexProjectId("convex-alpha");
    const betaProjectId = fakeConvexProjectId("convex-beta");
    const rotate = vi.fn();
    const repositoryWithBuildAccess = makeRepositorySettingsBuilderRepository({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
      convexProjects: [
        makeRepositorySettingsConvexProject({
          convexProjectId: alphaProjectId,
          projectId: "alpha-project-id",
          teamId: "team-alpha",
        }),
        makeRepositorySettingsConvexProject({
          convexProjectId: betaProjectId,
          projectId: "beta-project-id",
          teamId: "team-beta",
        }),
      ],
    });
    const convexObservations = {
      state: "loaded" as const,
      refreshFailed: false,
      reload: () => {},
      observations: [
        {
          convexProjectId: alphaProjectId,
          projectId: "alpha-project-id",
          codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
          source: { kind: "config" as const, state: "valid" as const },
          provider: {
            state: "current" as const,
            projectSlug: "alpha",
            teamSlug: "ada",
            productionDeployment: { state: "missing" as const },
          },
        },
        {
          convexProjectId: betaProjectId,
          projectId: "beta-project-id",
          codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
          source: { kind: "config" as const, state: "valid" as const },
          provider: {
            state: "current" as const,
            projectSlug: "beta",
            teamSlug: "ada",
            productionDeployment: { state: "missing" as const },
          },
        },
      ],
    };
    const readCloudflareRow = (
      convexBuildAccess: AvailableRepositorySettingsCloudflareConvexBuildAccessObservation["convexBuildAccess"],
    ) => {
      const state = buildRepositorySettingsState({
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [makeAvailableRepositorySettingsCloudflareObservation({ workerId })],
          builds: [
            makeAvailableRepositorySettingsCloudflareBuildsObservation({
              workerId,
              repository: {
                state: "ready",
                rootDirectory: "/",
                builds: {
                  state: "available",
                },
              },
              builds: {
                state: "connected",
                productionBuildTokenUuid: "build-token",
                previewBuildTokenUuid: "build-token",
              },
              productionBuild: { state: "unavailable", reasons: ["request_failed"] },
            }),
          ],
          convexBuildAccess: [
            {
              state: "available",
              workerId,
              convexBuildAccess,
            },
          ],
        }),
        pendingAction: null,
        cloudflareAccount: undefined,
        cloudflareBuildTokens: {
          state: "loaded",
          tokens: [{ name: "Workers Builds token", uuid: "build-token" }],
        },
        convexObservations,
        rotateConvexDeployKeysForWorkersBuildsOnClick: rotate,
        repository: repositoryWithBuildAccess,
      });
      const resource = getRepositorySettingsResource(state, "/", "cloudflare");
      if (resource.state !== "available") {
        throw new Error("Expected an available Cloudflare row.");
      }
      return resource;
    };

    const unconfiguredRow = readCloudflareRow({ state: "not_configured" });
    expect(unconfiguredRow.actions?.map((action) => action.label)).toEqual([
      "Use alpha for Workers Builds",
      "Use beta for Workers Builds",
    ]);
    unconfiguredRow.actions?.[0].onClick?.();
    expect(rotate).toHaveBeenLastCalledWith(workerId, alphaProjectId);

    const attachedProject = {
      state: "attached" as const,
      convexProjectId: alphaProjectId,
      teamId: "team-alpha",
      attachedTeamId: "team-alpha",
      teamState: "matches" as const,
      projectId: "alpha-project-id",
    };
    const incompleteRow = readCloudflareRow({
      state: "incomplete",
      convexProject: attachedProject,
    });
    expect(incompleteRow.actions?.map((action) => action.label)).toEqual(["Repair keys for alpha"]);
    incompleteRow.actions?.[0].onClick?.();
    expect(rotate).toHaveBeenLastCalledWith(workerId, alphaProjectId);

    const healthyRow = readCloudflareRow({
      state: "configured",
      convexProject: attachedProject,
    });
    expect(healthyRow.actions).toBeUndefined();

    const staleTeamRow = readCloudflareRow({
      state: "configured",
      convexProject: {
        ...attachedProject,
        teamId: "team-old",
        teamState: "differs",
      },
    });
    expect(staleTeamRow.description).toContain("still use team-old/alpha-project-id");
    expect(staleTeamRow.actions?.map((action) => action.label)).toEqual(["Repair keys for alpha"]);
  });
});
