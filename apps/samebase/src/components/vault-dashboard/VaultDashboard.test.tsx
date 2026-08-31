// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName, type FunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import type { VaultPullRequest, VaultPullRequestsState } from "@/hooks/useVaultPullRequests";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationContext } from "@/lib/organizationContext";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type VaultOrganization,
  VaultOverviewVaultPickerPane,
} from "./VaultOverviewVaultPickerPane";
import { VaultOverviewPage } from "./VaultOverviewPage";
import { type VaultFolderCallbacks, VaultOverviewSidebar } from "./VaultOverviewSidebar";
import { PullRequestsSection } from "./VaultPullRequestsSection";
import { RepositorySettings } from "./VaultRepositorySettings";
import { VaultCloudflareDialog, VaultCloudflareDialogContent } from "./VaultCloudflareDialog";
import { VaultConvexDialog, VaultConvexDialogContent } from "./VaultConvexDialog";
import { VaultDeleteDialogContent } from "./VaultDeleteDialog";
import { PullRequestResources, VaultEnvironmentTree } from "./VaultEnvironmentTree";
import {
  buildProductionEnvironmentRoots,
  buildPullRequestEnvironmentRoots,
} from "./vaultEnvironmentRoots";
import { buildVaultRepositorySettingsState } from "./vaultRepositorySettingsState";
import type {
  VaultCloudflareProviderObservationState,
  VaultCloudflareWorkerBuildsObservation,
  VaultCloudflareWorkerConvexBuildAccessObservation,
  VaultCloudflareWorkerObservation,
} from "./useVaultProviderObservations";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";

const useOrganizationGitHubIdentitiesMock = vi.hoisted(() => vi.fn(() => new Map()));
const useActionMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useOrganizationGitHubIdentity")>();
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
  onDeleteVaultFolder: async () => {},
  onMoveVaultFolder: async () => {},
  onMoveVaultToFolder: async () => {},
  onRenameVaultFolder: async () => {},
  onSetVaultFolderCollapsed: async () => {},
} satisfies VaultFolderCallbacks;

const VAULT_PICKER_FOLDER_PROPS = {
  ...FOLDER_CALLBACKS,
  folderState: { assignments: [], folders: [] },
  onCreateVaultFolder: async () => {},
  onSetVaultOrganizationCollapsed: async () => {},
  organizationTreeSettings: [],
};

function fakeVaultId(value = "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable vault id for the query args.
  return value;
}

function fakeOrganizationId(value = "organization-samebase"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable organization id.
  return value;
}

function fakeCloudflareWorkerId(value = "worker-root"): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeConvexProjectId(value = "convex-project-root"): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeRunId(): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable run id for component props.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeDeletionRunId(): Id<"workflow_vaultDeletion_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable run id for component props.
  return "mx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

type CloudflareDialogWorker = Parameters<typeof VaultCloudflareDialogContent>[0]["workers"][number];

function makeCloudflareDialogWorker(
  overrides: Partial<CloudflareDialogWorker>,
): CloudflareDialogWorker {
  return {
    workerName: "demo-worker",
    workerTag: "worker-tag-1",
    repository: { state: "not_connected" },
    convexBuildAccess: { state: "not_configured" },
    ...overrides,
  };
}

type RepositorySettingsBuilderVault = Parameters<
  typeof buildVaultRepositorySettingsState
>[0]["vault"];
type RepositorySettingsCloudflareWorker =
  RepositorySettingsBuilderVault["cloudflareWorkers"][number];
type RepositorySettingsConvexProject = RepositorySettingsBuilderVault["convexProjects"][number];
type AvailableRepositorySettingsCloudflareObservation = Extract<
  VaultCloudflareWorkerObservation,
  { state: "available" }
>;
type AvailableRepositorySettingsCloudflareBuildsObservation = Extract<
  VaultCloudflareWorkerBuildsObservation,
  { state: "available" }
>;
type AvailableRepositorySettingsCloudflareConvexBuildAccessObservation = Extract<
  VaultCloudflareWorkerConvexBuildAccessObservation,
  { state: "available" }
>;

function getRepositorySettingsResource(
  state: ReturnType<typeof buildVaultRepositorySettingsState>,
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
    workerId: Id<"vaultCloudflareWorkers">;
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
    workerId: Id<"vaultCloudflareWorkers">;
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
    ...overrides,
  };
}

function makeLoadedCloudflareObservations({
  workers,
  builds,
  convexBuildAccess,
}: {
  workers: readonly VaultCloudflareWorkerObservation[];
  builds: readonly VaultCloudflareWorkerBuildsObservation[];
  convexBuildAccess: readonly VaultCloudflareWorkerConvexBuildAccessObservation[];
}): VaultCloudflareProviderObservationState {
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

function makeRepositorySettingsBuilderVault(
  overrides: Partial<RepositorySettingsBuilderVault>,
): RepositorySettingsBuilderVault {
  const vault: RepositorySettingsBuilderVault = {
    _id: fakeVaultId(),
    organizationId: fakeOrganizationId(),
    convexTeamId: "team-1",
    cloudflareAccountId: "account-1",
    ghRepoOwner: "ada",
    ghRepoName: "demo",
    repositoryFullName: "ada/demo",
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
  return { ...vault, ...overrides };
}

describe("buildProductionEnvironmentRoots", () => {
  it("joins direct attachments to matching live Worker and Convex observations", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const vault = makeRepositorySettingsBuilderVault({
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
      vault,
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
              builds: {
                state: "available",
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
              },
            },
            builds: {
              state: "connected",
              productionTriggerUuid: "production-trigger",
              previewTriggerUuid: "preview-trigger",
              productionBuildTokenUuid: "build-token",
              previewBuildTokenUuid: "build-token",
              productionBuild: {
                state: "available",
                buildState: "success",
                logsUrl:
                  "https://dash.cloudflare.com/account-1/workers/services/view/demo-worker/production/builds/build-1",
              },
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
                href: `/vault/ada/demo/db/main/project/${convexProjectId}`,
                label: "Data",
              },
              {
                destination: "samebase",
                href: `/vault/ada/demo/schema/main/project/${convexProjectId}`,
                label: "Schema",
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

  it("keeps custom domains visible when workers.dev is disabled", () => {
    const workerId = fakeCloudflareWorkerId();
    const vault = makeRepositorySettingsBuilderVault({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      vault,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId,
            customDomains: ["app.example.com"],
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
              destination: {
                state: "available",
                href: "https://app.example.com",
                label: "app.example.com",
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
    const vault = makeRepositorySettingsBuilderVault({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
    });

    const roots = buildProductionEnvironmentRoots({
      branch: "main",
      vault,
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
    const vault = makeRepositorySettingsBuilderVault({
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
      vault,
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
              productionTriggerUuid: "samebase-production-trigger",
              previewTriggerUuid: "samebase-preview-trigger",
              productionBuildTokenUuid: "samebase-build-token",
              previewBuildTokenUuid: "samebase-build-token",
              productionBuild: {
                state: "available",
                buildState: "success",
                logsUrl: "https://dash.cloudflare.com/samebase-build",
              },
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

describe("vault environment roots", () => {
  it("keeps a Convex row under its known root while deployment details load", () => {
    const convexProjectId = fakeConvexProjectId();
    const vault = makeRepositorySettingsBuilderVault({
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
        vault,
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
    const vault = makeRepositorySettingsBuilderVault({
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
        vault,
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
                href: `/vault/ada/demo/db/main/project/${convexProjectId}`,
                label: "Data",
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

  it("shows an unavailable current build and a recovered branch preview independently", () => {
    const workerId = fakeCloudflareWorkerId();
    const previewUrl = "https://older-demo-web.example.workers.dev";

    expect(
      buildPullRequestEnvironmentRoots({
        resources: {
          pullRequestId: "pull-request-1",
          cloudflareBuilds: { state: "available" },
          workers: [
            {
              workerId,
              workerName: "demo-web",
              rootDirectory: "apps/web",
              cloudflareBuild: { state: "unavailable" },
              cloudflareBranchPreview: {
                state: "available",
                url: previewUrl,
              },
            },
          ],
          convexProjects: [],
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
              build: { state: "unavailable" },
              destination: {
                state: "available",
                href: previewUrl,
                label: "Branch preview",
                title: "older-demo-web.example.workers.dev",
              },
              actions: [],
            },
          },
        ],
      },
    ]);
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
        }}
        settingsHref="/vault/ada/demo/settings"
      />,
    );

    expect(markup).toContain("Could not load Cloudflare build status");
    expect(markup).not.toContain("Unavailable");
  });

  it("keeps an unavailable pull request head out of Cloudflare comment errors", () => {
    const markup = renderToStaticMarkup(
      <PullRequestResources
        resource={{ state: "failed" }}
        settingsHref="/vault/ada/demo/settings"
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
    rootElement.innerHTML = renderToStaticMarkup(<VaultEnvironmentTree roots={roots} />);
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
    } satisfies VaultPullRequest;
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
            },
          },
        ],
      ]),
      loadMore: { state: "exhausted" },
    } satisfies VaultPullRequestsState;
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
            <PullRequestsSection
              filesReadEnabled={false}
              pullRequests={pullRequests}
              vault={makeRepositorySettingsBuilderVault({})}
            />
          </TestRouterProvider>,
        );
      });

      expect(rootElement.querySelector("#vault-pull-requests-heading")?.textContent).toBe(
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
      expect(connectWorker?.getAttribute("href")).toBe("/vault/ada/demo/settings?add-cloudflare");
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

describe("VaultOverviewVaultPickerPane", () => {
  function organizationForVault(vault: RepositorySettingsBuilderVault): VaultOrganization {
    return {
      canCreateRepository: true,
      githubOwnerId: "github-owner-ada",
      githubOwnerLogin: vault.ghRepoOwner,
      githubOwnerType: "user",
      organizationId: vault.organizationId,
      role: "owner",
    };
  }

  it("shows positive resource counts and omits zero resource counts", () => {
    const vault = makeRepositorySettingsBuilderVault({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({})],
      convexProjects: [makeRepositorySettingsConvexProject({})],
      ghRepoName: "demo",
      ghRepoOwner: "ada",
      repositoryFullName: "ada/demo",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForVault(vault)]}
          sidebarSummaries={{
            state: "loaded",
            summaries: [
              {
                vaultId: vault._id,
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
          vaults={[vault]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('<nav aria-label="Vaults"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('href="/org/ada/vaults"');
    expect(markup).toContain("demo");
    expect(markup).toContain("1/1 passed");
    expect(markup).toContain("3 PRs");
    expect(markup).toContain("1 Cloudflare Worker");
    expect(markup).toContain("1 Convex project");
    expect(markup).not.toContain("Install GitHub App");
    expect(markup).toContain('href="/vault/ada/demo"');
    expect(markup).toMatch(/<a[^>]+href="\/vault\/ada\/demo"[^>]*>[\s\S]*1\/1 passed[\s\S]*<\/a>/);
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );

    const emptyVault = makeRepositorySettingsBuilderVault({
      cloudflareWorkers: [],
      convexProjects: [],
      ghRepoName: "empty",
      ghRepoOwner: "ada",
      repositoryFullName: "ada/empty",
    });
    const emptyMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForVault(emptyVault)]}
          sidebarSummaries={{
            state: "loaded",
            summaries: [
              {
                vaultId: emptyVault._id,
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
          vaults={[emptyVault]}
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
    const vault = makeRepositorySettingsBuilderVault({
      ghRepoName: "demo",
      ghRepoOwner: "ada",
      repositoryFullName: "ada/demo",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/ada/vaults"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory={false}
          organizations={[organizationForVault(vault)]}
          organizationTreeSettings={[{ collapsed: true, organizationId: vault.organizationId }]}
          sidebarSummaries={{ state: "loading" }}
          vaults={[vault]}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('data-slot="collapsible-trigger"');
    expect(markup).toContain(">ada</span>");
    expect(markup).toContain('href="/vault/ada/demo"');
  });

  it("preserves organization order and vault order while grouping in one pass", () => {
    const zedFirst = makeRepositorySettingsBuilderVault({
      _id: fakeVaultId("vault-zed-first"),
      ghRepoName: "first",
      ghRepoOwner: "zed",
      organizationId: fakeOrganizationId("organization-zed"),
      repositoryFullName: "zed/first",
    });
    const zedSecond = makeRepositorySettingsBuilderVault({
      ...zedFirst,
      _id: fakeVaultId("vault-zed-second"),
      ghRepoName: "second",
      repositoryFullName: "zed/second",
    });
    const adaFirst = makeRepositorySettingsBuilderVault({
      _id: fakeVaultId("vault-ada-first"),
      ghRepoName: "first",
      ghRepoOwner: "ada",
      organizationId: fakeOrganizationId("organization-ada"),
      repositoryFullName: "ada/first",
    });
    const adaSecond = makeRepositorySettingsBuilderVault({
      ...adaFirst,
      _id: fakeVaultId("vault-ada-second"),
      ghRepoName: "second",
      repositoryFullName: "ada/second",
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[organizationForVault(zedFirst), organizationForVault(adaFirst)]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          vaults={[adaSecond, zedFirst, adaFirst, zedSecond]}
        />
      </TestRouterProvider>,
    );
    const orderedMarkers = [
      ">zed</span>",
      'href="/vault/zed/first"',
      'href="/vault/zed/second"',
      ">ada</span>",
      'href="/vault/ada/second"',
      'href="/vault/ada/first"',
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

  it("prioritizes active vault workflows in the root vault picker", () => {
    const settingUpMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[
            organizationForVault(
              makeRepositorySettingsBuilderVault({
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
          vaults={[
            makeRepositorySettingsBuilderVault({
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
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[
            organizationForVault(
              makeRepositorySettingsBuilderVault({
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
          vaults={[
            makeRepositorySettingsBuilderVault({
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
    const vault = makeRepositorySettingsBuilderVault({
      sourceSetup: {
        status: "running",
        runId: fakeRunId(),
        step: "sync_tree",
        updatedAt: 30,
      },
    });
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={{ assignments: [], folders: [] }}
          organizationId={vault.organizationId}
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={[vault]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-label="ada/demo, Setting up"');
  });

  it("renders loading, zero-membership, and empty-organization states", () => {
    const emptyOrganization = organizationForVault(makeRepositorySettingsBuilderVault({}));
    const loadingMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={null}
        />
      </TestRouterProvider>,
    );
    const emptyMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory
          organizations={[]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          vaults={[]}
        />
      </TestRouterProvider>,
    );
    const emptyOrganizationMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/ada/vaults"]}>
        <VaultOverviewVaultPickerPane
          {...VAULT_PICKER_FOLDER_PROPS}
          globalInventory={false}
          organizations={[emptyOrganization]}
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          vaults={[]}
        />
      </TestRouterProvider>,
    );

    expect(loadingMarkup).toContain('aria-label="Loading vaults"');
    expect(emptyMarkup).toContain("No organizations");
    expect(emptyMarkup).toContain("Connect a GitHub account or organization to Samebase.");
    expect(emptyMarkup).toContain("Connect organization");
    expect(emptyMarkup).toContain('href="/connect-organization"');
    expect(emptyOrganizationMarkup).toContain("ada");
    expect(emptyOrganizationMarkup).toContain('<nav aria-label="Vaults"');
    expect(emptyOrganizationMarkup).toContain("No vaults");
    expect(emptyOrganizationMarkup).not.toContain("Connect organization");
  });
});

describe("VaultOverviewPage", () => {
  it("does not link an unconnected repository", () => {
    const vault = makeRepositorySettingsBuilderVault({
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
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultOverviewPage
          developerToolsVisible={false}
          isRetryingVaultAction={false}
          onOpenDeleteDialog={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          page="overview"
          settingsState={buildVaultRepositorySettingsState({
            cloudflareObservations,
            cloudflareAccount: undefined,
            cloudflareBuildTokens: { state: "not_available" },
            convexObservations,
            pendingAction: null,
            vault,
          })}
          workspace={{
            access: { state: "ready", accessKeys: [] },
            cloudflareConnection: { state: "loading" },
            cloudflareObservations,
            convexObservations,
            environmentRoots: [],
            githubRepositoryUrl: "https://github.com/ada/demo",
            pullRequests: { state: "not_requested" },
            vault,
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('href="https://github.com/ada/demo"');
  });

  it("shows first-time Cloudflare setup until a Worker is attached", () => {
    const vault = makeRepositorySettingsBuilderVault({
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
    const renderOverview = (currentVault: typeof vault) =>
      renderToStaticMarkup(
        <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
          <VaultOverviewPage
            developerToolsVisible={false}
            isRetryingVaultAction={false}
            onOpenDeleteDialog={() => {}}
            onRetryInfrastructureProvisioning={() => {}}
            onRetryVaultDeletion={() => {}}
            page="overview"
            settingsState={{
              addCloudflareWorker: { disabled: false },
              addConvexProject: { disabled: false },
              providerActionBlockReason: null,
              roots: [],
            }}
            workspace={{
              access: { state: "ready", accessKeys: [] },
              cloudflareConnection: { state: "loading" },
              cloudflareObservations,
              convexObservations,
              environmentRoots: [],
              githubRepositoryUrl: "https://github.com/ada/demo",
              pullRequests: { state: "not_requested" },
              vault: currentVault,
            }}
          />
        </TestRouterProvider>,
      );

    const incompleteMarkup = renderOverview(vault);
    const attachedMarkup = renderOverview({
      ...vault,
      hasCloudflareProvision: true,
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({})],
    });

    expect(incompleteMarkup).toContain("Finish Cloudflare setup");
    expect(incompleteMarkup).toContain('href="/docs/cloudflare-setup"');
    expect(attachedMarkup).not.toContain("Finish Cloudflare setup");
  });

  it("keeps safe provider links during setup and provider checks", () => {
    const vault = makeRepositorySettingsBuilderVault({});
    const workspace = {
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
      vault,
    };
    const queryClient = new QueryClient();
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TestRouterProvider initialEntries={["/vault/ada/demo/settings"]}>
          <RepositorySettings
            developerToolsVisible={false}
            onOpenDeleteDialog={() => {}}
            settingsState={{
              addCloudflareWorker: { disabled: true },
              addConvexProject: { disabled: true },
              providerActionBlockReason: "A provider operation is in progress.",
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
    const vault = makeRepositorySettingsBuilderVault({
      ghRepoName: "agent-plugins",
      repositoryFullName: "ada/agent-plugins",
    });
    const workspace = {
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
      vault,
    };
    useOrganizationGitHubIdentitiesMock.mockReturnValue(
      new Map([
        [
          vault.organizationId,
          {
            owner: { status: "current" },
            vaults: [
              {
                status: "renamed",
                vaultId: vault._id,
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
                  organizationId: vault.organizationId,
                  role,
                },
              ],
              surface: { kind: "allVaults" },
            }}
          >
            <TestRouterProvider initialEntries={["/vault/ada/agent-plugins/settings"]}>
              <RepositorySettings
                developerToolsVisible={false}
                onOpenDeleteDialog={() => {}}
                settingsState={{
                  addCloudflareWorker: { disabled: true },
                  addConvexProject: { disabled: true },
                  providerActionBlockReason: null,
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

describe("GitHubRepositoryNameSlashPreview", () => {
  it("shows the exact repository name slash replacement", () => {
    const markup = renderToStaticMarkup(<GitHubRepositoryNameSlashPreview rawName="field/notes" />);

    expect(markup).toContain("GitHub repo name:");
    expect(markup).toContain("<code");
    expect(markup).toContain("font-mono");
    expect(markup).toContain(">field-notes</code>");
    expect(markup).not.toContain("will be replaced");
    expect(markup).not.toContain("&quot;field-notes&quot;");
  });

  it("stays empty when the name has no slash replacement", () => {
    const markup = renderToStaticMarkup(<GitHubRepositoryNameSlashPreview rawName="field-notes" />);

    expect(markup).toBe("");
  });
});

describe("formatVaultSourceSetupStep", () => {
  it("uses dashboard labels for create-app setup steps", () => {
    expect(formatVaultSourceSetupStep("connect_github")).toBe("Connecting GitHub repository");
    expect(formatVaultSourceSetupStep("fetch_github_repo")).toBe("Reading GitHub repository");
    expect(formatVaultSourceSetupStep("seed_starter")).toBe("Adding starter files");
    expect(formatVaultSourceSetupStep("sync_tree")).toBe("Syncing repository files");
  });
});

describe("VaultDeleteDialogContent", () => {
  const baseProps = {
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
    onCommitBeforeRemove: () => {},
    onDeleteOptionChange: () => {},
    onOpenChange: () => {},
    onRemoveVault: () => {},
    progress: "idle",
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    stagedChangesCount: 0,
  } satisfies Omit<Parameters<typeof VaultDeleteDialogContent>[0], "target">;

  it("allows Cloudflare cleanup for provisioned Workers on connected repository vaults", () => {
    const markup = renderToStaticMarkup(
      <VaultDeleteDialogContent
        {...baseProps}
        target={{
          id: fakeVaultId(),
          repositoryFullName: "ada/existing-repo",
          isSamebaseManaged: false,
          canRemoveGithubRepo: false,
          hasConvexProvision: false,
          hasCloudflareProvision: true,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision: true,
        }}
      />,
    );

    expect(markup).toContain("Also remove Cloudflare Worker");
    expect(markup).not.toContain("Only available for Workers created from this app.");
  });

  it("shows Convex cleanup when a failed create left a removable project", () => {
    const markup = renderToStaticMarkup(
      <VaultDeleteDialogContent
        {...baseProps}
        target={{
          id: fakeVaultId(),
          repositoryFullName: "ada/existing-repo",
          isSamebaseManaged: false,
          canRemoveGithubRepo: false,
          hasConvexProvision: false,
          hasCloudflareProvision: false,
          canRemoveConvexProvision: true,
          canRemoveCloudflareProvision: false,
        }}
      />,
    );

    expect(markup).toContain("Also remove Convex project/deployment");
    expect(markup).not.toContain("Only available for infrastructure provisioned by Samebase.");
  });

  it("shows the server block reason and disables removal", () => {
    const markup = renderToStaticMarkup(
      <VaultDeleteDialogContent
        {...baseProps}
        blockedReason="Vault setup is still running."
        target={{
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          isSamebaseManaged: true,
          canRemoveGithubRepo: true,
          hasConvexProvision: false,
          hasCloudflareProvision: false,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision: false,
        }}
      />,
    );
    const removeButton = markup.match(/<button[^>]*>Remove Vault<\/button>/)?.[0];

    expect(markup).toContain("Vault setup is still running.");
    expect(removeButton).toBeDefined();
    expect(removeButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });
});

describe("VaultConvexDialog", () => {
  it("submits the live organization default when creating a project for an existing vault", async () => {
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
    const onSaved = vi.fn();
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.vault.convex.discoverProjects)) {
        return discoverProjects;
      }
      if (actionName === getFunctionName(api.vault.convex.createProject)) {
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
            <VaultConvexDialog
              blockedReason={null}
              onClose={() => {}}
              onSaved={onSaved}
              repairProjectId={null}
              vault={makeRepositorySettingsBuilderVault({})}
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
          expect(document.getElementById("vault-convex-production-region")).toBeInstanceOf(
            HTMLButtonElement,
          ),
        ),
      );
      const regionSelect = document.getElementById("vault-convex-production-region");
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
          vaultId: fakeVaultId(),
          projectName: "demo",
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

describe("VaultConvexDialogContent", () => {
  type ConvexDialogProps = Parameters<typeof VaultConvexDialogContent>[0];

  const vault = {
    id: fakeVaultId(),
    repositoryFullName: "ada/demo",
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
      <VaultConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
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
      <VaultConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
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
      <VaultConvexDialogContent
        blockedReason="A provider operation is in progress."
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
      />,
    );
    const addButton = markup.match(/<button[^>]*>Add 1 project<\/button>/)?.[0];

    expect(markup).toContain("A provider operation is in progress.");
    expect(addButton).toBeDefined();
    expect(addButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("keeps Cancel enabled when a pending submit needs recovery", () => {
    const markup = renderToStaticMarkup(
      <VaultConvexDialogContent
        blockedReason="Samebase could not confirm Convex project creation."
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
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
        <VaultConvexDialogContent
          codeLocations={codeLocations}
          createCodeLocationKey=""
          createDeploymentRegion={null}
          convexDeploymentRegionField={null}
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
          vault={vault}
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
      <VaultConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:apps/web/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
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
      <VaultConvexDialogContent
        codeLocations={[]}
        createCodeLocationKey=""
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
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
        vault={vault}
      />,
    );

    expect(markup).toContain("could not be fully scanned");
    expect(markup).not.toContain("No valid convex.json files were found");
  });
});

describe("VaultCloudflareDialogContent", () => {
  const vault = {
    id: fakeVaultId(),
    repositoryFullName: "ada/demo",
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
      if (actionName === getFunctionName(api.vault.cloudflare.configureWorkersBuildsForGitHub)) {
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
            <VaultCloudflareDialog
              blockedReason={null}
              onClose={() => {}}
              repairBuildTokenUuid="build-token"
              repairWorkerId={workerId}
              vault={makeRepositorySettingsBuilderVault({
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
        vaultId: fakeVaultId(),
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
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        createRootDirectory="/"
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
        vault={vault}
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
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        createRootDirectory="/"
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
        vault={vault}
        workerToConnect={null}
        workers={[
          makeCloudflareDialogWorker({
            workerName: "root-worker",
            workerTag: "root-tag",
            repository: {
              state: "ready",
              rootDirectory: "/",
              builds: { state: "not_available" },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "web-worker",
            workerTag: "web-tag",
            repository: {
              state: "ready",
              rootDirectory: "apps/web",
              builds: { state: "not_available" },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "portal-worker",
            workerTag: "portal-tag",
            repository: { state: "not_connected" },
          }),
          makeCloudflareDialogWorker({
            workerName: "other-repository",
            workerTag: "other-tag",
            repository: { state: "connected_elsewhere" },
          }),
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
    expect(markup).not.toContain("App root");
  });

  it("asks for one repository root before connecting and adding an unconnected Worker", async () => {
    const discoverWorkers = vi.fn(async () => ({
      inventoryState: "complete" as const,
      workers: [
        makeCloudflareDialogWorker({
          workerName: "portal-worker",
          workerTag: "portal-tag",
          repository: { state: "not_connected" },
        }),
      ],
    }));
    const listBuildTokens = vi.fn(async () => ({
      accountId: "account-1",
      lastUsedBuildTokenUuid: "build-token",
      tokens: [{ name: "Build token", uuid: "build-token" }],
    }));
    useActionMock.mockImplementation((action: FunctionReference<"action">) => {
      const actionName = getFunctionName(action);
      if (actionName === getFunctionName(api.vault.cloudflare.discoverWorkers)) {
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
            <VaultCloudflareDialog
              blockedReason={null}
              onClose={() => {}}
              repairBuildTokenUuid={null}
              repairWorkerId={null}
              vault={makeRepositorySettingsBuilderVault({ cloudflareWorkers: [] })}
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

  it("shows the repository root only when creating a Worker", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={<div>API token</div>}
        hasSelectedBuildToken={false}
        createRootDirectory="apps/web"
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
        vault={vault}
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

  it("rejects an invalid Worker name inline before submission", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        createRootDirectory="apps/web"
        createWorkerName="samebase app"
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
        vault={vault}
        workerToConnect={null}
        workers={[]}
      />,
    );
    const createButton = markup.match(/<button[^>]*>Create Worker<\/button>/)?.[0];

    expect(markup).toContain(
      "Cloudflare Worker name can use lowercase letters, numbers, underscores, and dashes, and cannot start with a dash.",
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="cloudflare-worker-name-error"');
    expect(markup).toContain('id="cloudflare-worker-name-error" role="alert"');
    expect(createButton).toBeDefined();
    expect(createButton).toMatch(/\sdisabled(?:=""|(?=[\s>]))/);
  });

  it("shows the operation block reason and disables confirmation", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        blockedReason="A provider operation is in progress."
        createRootDirectory="apps/web"
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
        vault={vault}
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
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        blockedReason="Samebase could not confirm the Cloudflare Worker connection."
        createRootDirectory="apps/web"
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
        vault={vault}
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
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={null}
        hasSelectedBuildToken
        createRootDirectory="/"
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
        vault={vault}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain("Worker list may be incomplete");
    expect(markup).not.toContain("No Workers connected to this repository were found");
  });
});

describe("buildVaultRepositorySettingsState", () => {
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
      const state = buildVaultRepositorySettingsState({
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
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
                productionBuildTokenUuid,
                previewBuildTokenUuid,
                productionBuild: { state: "unavailable", reasons: ["request_failed"] },
              },
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
        vault: makeRepositorySettingsBuilderVault({
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

  it("shows readable planned targets while managed setup is active", () => {
    const state = buildVaultRepositorySettingsState({
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
      vault: makeRepositorySettingsBuilderVault({
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
    const state = buildVaultRepositorySettingsState({
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
      vault: makeRepositorySettingsBuilderVault({
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
    const state = buildVaultRepositorySettingsState({
      cloudflareObservations: {
        workers: { state: "loading" },
        builds: { state: "loading" },
        convexBuildAccess: { state: "loading" },
      },
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      pendingAction: null,
      convexObservations: { state: "loading" },
      vault: makeRepositorySettingsBuilderVault({
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
    const state = buildVaultRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [],
        builds: [],
        convexBuildAccess: [],
      }),
      cloudflareAccount: undefined,
      cloudflareBuildTokens: { state: "not_available" },
      pendingAction: null,
      convexObservations: { state: "checking" },
      vault: makeRepositorySettingsBuilderVault({
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
    const state = buildVaultRepositorySettingsState({
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
      vault: makeRepositorySettingsBuilderVault({
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
      pendingAction: Parameters<typeof buildVaultRepositorySettingsState>[0]["pendingAction"],
    ) =>
      buildVaultRepositorySettingsState({
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
                  productionTriggerUuid: "production-trigger",
                  previewTriggerUuid: "preview-trigger",
                },
              },
              builds: {
                state: "connected",
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
                productionBuildTokenUuid: "build-token",
                previewBuildTokenUuid: "build-token",
                productionBuild: { state: "absent" },
              },
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
        vault: makeRepositorySettingsBuilderVault({
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
    const state = buildVaultRepositorySettingsState({
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
      vault: makeRepositorySettingsBuilderVault({
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
      "Remove from vault",
    );
    expect(unresolvedCloudflareResource.actions?.map((action) => action.label)).toContain(
      "Remove from vault",
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
      "Remove from vault",
    ]);
    expect(state.addCloudflareWorker.disabled).toBe(true);
    expect(state.addConvexProject.disabled).toBe(true);
  });

  it("names exact Convex targets and limits key repair to the observed attachment", () => {
    const workerId = fakeCloudflareWorkerId("worker-build-access");
    const alphaProjectId = fakeConvexProjectId("convex-alpha");
    const betaProjectId = fakeConvexProjectId("convex-beta");
    const rotate = vi.fn();
    const vaultWithBuildAccess = makeRepositorySettingsBuilderVault({
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
      const state = buildVaultRepositorySettingsState({
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
                  productionTriggerUuid: "production-trigger",
                  previewTriggerUuid: "preview-trigger",
                },
              },
              builds: {
                state: "connected",
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
                productionBuildTokenUuid: "build-token",
                previewBuildTokenUuid: "build-token",
                productionBuild: { state: "unavailable", reasons: ["request_failed"] },
              },
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
        vault: vaultWithBuildAccess,
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
