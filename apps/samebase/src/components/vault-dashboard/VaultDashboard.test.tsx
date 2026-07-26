import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import { VaultOverviewVaultPickerPane } from "./VaultOverviewVaultPickerPane";
import { VaultCloudflareDialogContent } from "./VaultCloudflareDialog";
import { VaultConvexDialogContent } from "./VaultConvexDialog";
import { VaultDeleteDialogContent } from "./VaultDeleteDialog";
import { VaultDashboardCloudflareAccountDialog } from "./VaultDashboardCloudflareAccountDialog";
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
import {
  resolveVaultProviderSetupStatus,
  resolveVaultProviderSetupStepProvider,
} from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: vi.fn(),
    useMutation: vi.fn(),
    useQuery: vi.fn(),
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

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable vault id for the query args.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
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
    observedAt: 1,
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
    observedAt: 1,
    repository: {
      state: "ready",
      rootDirectory: "/",
      builds: { state: "not_available" },
    },
    builds: { state: "not_connected" },
    ...overrides,
    productionBuild: overrides.productionBuild ?? { state: "unavailable" },
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
      freshness: "current",
      refreshing: false,
      reload: () => {},
      observations: workers,
    },
    builds: {
      state: "loaded",
      freshness: "current",
      refreshing: false,
      reload: () => {},
      observations: builds,
    },
    convexBuildAccess: {
      state: "loaded",
      freshness: "current",
      refreshing: false,
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
    _creationTime: 0,
    ghRepoOwner: "ada",
    ghRepoName: "demo",
    repositoryFullName: "ada/demo",
    defaultBranch: "main",
    fileCount: 0,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "not_applicable" },
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
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
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
            productionBuild: {
              state: "available",
              uuid: "build-1",
              buildState: "success",
            },
            repository: {
              state: "ready",
              rootDirectory: "apps/web",
              builds: { state: "not_available" },
            },
          }),
        ],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        freshness: "current",
        refreshing: false,
        reload: () => {},
        observations: [
          {
            observedAt: 1,
            convexProjectId,
            projectId: "demo-project-id",
            codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
            source: { kind: "config", state: "valid", blobSha: "blob-1" },
            provider: {
              state: "current",
              teamId: "team-1",
              projectName: "Demo",
              projectSlug: "demo",
              teamSlug: "ada",
              productionDeployment: {
                state: "available",
                deploymentName: "calm-swan-123",
                cloudUrl: "https://calm-swan-123.convex.cloud",
                siteUrl: "https://calm-swan-123.convex.site",
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
        freshness: "current",
        refreshing: false,
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
                title: "Open production app",
              },
              actions: [],
            },
          },
        ],
      },
    ]);
  });

  it("does not manufacture links from attachments when live resources are missing", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const vault = makeRepositorySettingsBuilderVault({
      cloudflareWorkers: [makeRepositorySettingsCloudflareWorker({ workerId })],
      convexProjects: [makeRepositorySettingsConvexProject({ convexProjectId })],
    });

    expect(
      buildProductionEnvironmentRoots({
        branch: "main",
        vault,
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [{ state: "missing", observedAt: 1, workerId }],
          builds: [],
          convexBuildAccess: [],
        }),
        convexObservations: {
          state: "loaded",
          freshness: "current",
          refreshing: false,
          reload: () => {},
          observations: [
            {
              observedAt: 1,
              convexProjectId,
              projectId: "demo-project-id",
              codeLocation: { kind: "config", convexConfigPath: "convex.json" },
              source: { kind: "config", state: "valid", blobSha: "blob-1" },
              provider: { state: "missing_ambiguous", teamId: "team-1" },
            },
          ],
        },
        owner: "ada",
        repoName: "demo",
        schemaGraphEnabled: true,
      }),
    ).toEqual([]);
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
          freshness: "current",
          refreshing: false,
          reload: () => {},
          observations: [
            {
              observedAt: 1,
              convexProjectId,
              projectId: "demo-project-id",
              codeLocation: { kind: "config", convexConfigPath: "packages/backend/convex.json" },
              source: { kind: "config", state: "valid", blobSha: "blob-1" },
              provider: {
                state: "current",
                teamId: "team-1",
                projectName: "Demo",
                projectSlug: "demo",
                teamSlug: "ada",
                productionDeployment: {
                  state: "available",
                  deploymentName: "calm-swan-123",
                  cloudUrl: "https://calm-swan-123.convex.cloud",
                  siteUrl: "https://calm-swan-123.convex.site",
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
            title: "Open production Convex deployment calm-swan-123",
          },
        ],
      },
    ]);
  });

  it("uses sibling Cloudflare and Convex rows for a pull request root", () => {
    const workerId = fakeCloudflareWorkerId();
    const worker = {
      state: "available" as const,
      workerId,
      rootDirectory: "apps/web",
      workerName: "demo-web",
      cloudflareBuild: {
        uuid: "build-1",
        state: "success" as const,
        logsUrl: "https://dash.cloudflare.com/build-1",
      },
      cloudflareBranchPreview: {
        state: "available" as const,
        url: "https://branch.demo.workers.dev",
      },
      convexPreview: {
        state: "available" as const,
        deploymentName: "calm-swan-123",
        dashboardUrl: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
      },
    };

    expect(
      buildPullRequestEnvironmentRoots({
        pullRequestId: "pull-request-1",
        workers: [worker],
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
                buildState: "success",
                logsUrl: "https://dash.cloudflare.com/build-1",
              },
              destination: {
                state: "available",
                href: "https://branch.demo.workers.dev",
                label: "Branch preview",
                title: "branch.demo.workers.dev",
              },
              actions: [],
            },
          },
          {
            kind: "destination",
            id: `convex:${workerId}`,
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
            title: "Open preview Convex deployment calm-swan-123",
          },
        ],
      },
    ]);
  });
});

describe("VaultOverviewVaultPickerPane", () => {
  it("renders the new root vault picker in the main pane", () => {
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

    expect(markup).toContain("Vaults");
    expect(markup).toContain("ada/");
    expect(markup).toContain("demo");
    expect(markup).toContain("1/1 passed");
    expect(markup).not.toContain("3 PRs");
    expect(markup).not.toContain("Cloudflare Workers");
    expect(markup).not.toContain("Convex projects");
    expect(markup).toContain('href="/vault/ada/demo"');
    expect(markup).toMatch(/<a[^>]+href="\/vault\/ada\/demo"[^>]*>[\s\S]*1\/1 passed[\s\S]*<\/a>/);
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );
  });

  it("prioritizes active vault workflows in the root vault picker", () => {
    const settingUpMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
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

  it("renders the new root vault picker loading and empty states", () => {
    const loadingMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane sidebarSummaries={{ state: "loading" }} vaults={null} />
      </TestRouterProvider>,
    );
    const emptyMarkup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
        <VaultOverviewVaultPickerPane
          sidebarSummaries={{ state: "loaded", summaries: [] }}
          vaults={[]}
        />
      </TestRouterProvider>,
    );

    expect(loadingMarkup).toContain('aria-label="Loading vaults"');
    expect(emptyMarkup).toContain("No vaults");
    expect(emptyMarkup).not.toContain("Samebase logo");
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

describe("resolveVaultProviderSetupStatus", () => {
  it("keeps provider setup states as progress, not manual actions", () => {
    expect(
      resolveVaultProviderSetupStatus({
        status: "running",
        provider: "convex",
        runId: fakeRunId(),
        step: "attach_convex",
        updatedAt: 0,
      }),
    ).toEqual({
      status: "running",
      label: "Convex: provisioning",
    });
    expect(resolveVaultProviderSetupStatus({ status: "ready" })).toBeNull();
  });

  it("uses the current workflow step to label the active provider", () => {
    const providerSetup = {
      status: "running",
      provider: "cloudflare",
      runId: fakeRunId(),
      step: "rotate_convex_deploy_keys_for_workers_builds",
      updatedAt: 0,
    } satisfies RepositorySettingsBuilderVault["providerSetup"];

    expect(resolveVaultProviderSetupStepProvider(providerSetup)).toBe("cloudflare");
    expect(resolveVaultProviderSetupStatus(providerSetup)).toEqual({
      status: "running",
      label: "Cloudflare: provisioning",
    });
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
});

describe("VaultDashboardCloudflareAccountDialog", () => {
  it("renders selectable Cloudflare accounts for the create flow", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareAccountDialog
        accounts={[{ accountId: "account-a", accountName: "Account A" }]}
        error={null}
        isLoading={false}
        isSubmitting={false}
        onAccountChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        selectedAccountId="account-a"
      />,
    );

    expect(markup).toContain("Select Cloudflare Account");
    expect(markup).toContain("Account A");
    expect(markup).toContain("Save Account");
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
      teamSlug: "ada",
      workerReferences: [],
    },
  ];

  it("supports selecting multiple existing projects with an explicit config for each", () => {
    const markup = renderToStaticMarkup(
      <VaultConvexDialogContent
        codeLocations={codeLocations}
        createCodeLocationKey="config:convex.json"
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
    expect(whileLoading).toContain("Elapsed search time");
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

  it("replaces disabled controls with a timed loading state while searching", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[]}
        createRootDirectory="/"
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading
        isSubmitting={false}
        inventoryState={null}
        mode="existing"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedAccountId=""
        selectedWorkerTags={[]}
        vault={vault}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Searching for Cloudflare Workers");
    expect(markup).toContain("Elapsed search time");
    expect(markup).not.toContain("Cloudflare account");
    expect(markup).not.toContain(">Existing<");
    expect(markup).not.toContain("Add Workers");
  });

  it("separates connected selections and keeps them pending after another Worker is added", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[{ accountId: "account-1", accountName: "Ada" }]}
        createRootDirectory="/"
        createWorkerName=""
        didAddWorker
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="existing"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedAccountId="account-1"
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

  it("asks for one repository root before connecting and adding an unconnected Worker", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[{ accountId: "account-1", accountName: "Ada" }]}
        createRootDirectory="apps/portal"
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={["apps", "apps/portal", "packages/shared"]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="connect"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedAccountId="account-1"
        selectedWorkerTags={[]}
        vault={vault}
        workerToConnect={{ workerName: "portal-worker", workerTag: "portal-tag" }}
        workers={[
          makeCloudflareDialogWorker({
            workerName: "portal-worker",
            workerTag: "portal-tag",
            repository: { state: "not_connected" },
          }),
        ]}
      />,
    );

    expect(markup).toContain("Connect a Worker");
    expect(markup).toContain("portal-worker");
    expect(markup).toContain("Repository root");
    expect(markup).toContain('value="apps/portal"');
    expect(markup).toContain("Connect and add");
    expect(markup).toContain("Back");
    expect(markup).not.toContain("Cloudflare account");
    expect(markup).not.toContain(">Existing<");
  });

  it("shows the repository root only when creating a Worker", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[{ accountId: "account-1", accountName: "Ada" }]}
        createRootDirectory="apps/web"
        createWorkerName="web-worker"
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="complete"
        mode="create"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedAccountId="account-1"
        selectedWorkerTags={[]}
        vault={vault}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("Repository root");
    expect(markup).toContain('value="apps/web"');
    expect(markup).toContain("Create Worker");
  });

  it("uses the same dialog to repair Builds when no live root exists", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[]}
        createRootDirectory="apps/web"
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState={null}
        mode="existing"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={{ workerName: "web-worker" }}
        selectedAccountId=""
        selectedWorkerTags={[]}
        vault={vault}
        workerToConnect={null}
        workers={[]}
      />,
    );

    expect(markup).toContain("Configure web-worker Builds");
    expect(markup).toContain("Choose the repository root Cloudflare should build");
    expect(markup).toContain("Repository root");
    expect(markup).toContain('value="apps/web"');
    expect(markup).toContain("Configure Workers Builds");
    expect(markup).not.toContain(">Existing<");
    expect(markup).not.toContain(">Create<");
    expect(markup).not.toContain("Cloudflare account");
  });

  it("does not claim that no Workers exist after a partial inventory", () => {
    const markup = renderToStaticMarkup(
      <VaultCloudflareDialogContent
        accounts={[{ accountId: "account-1", accountName: "Ada" }]}
        createRootDirectory="/"
        createWorkerName=""
        didAddWorker={false}
        error={null}
        folderSuggestions={[]}
        isLoading={false}
        isSubmitting={false}
        inventoryState="partial"
        mode="existing"
        onAccountChange={() => {}}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={null}
        selectedAccountId="account-1"
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
  it("groups resources by observed roots and keeps unresolved Workers in attention", () => {
    const readyWorkerId = fakeCloudflareWorkerId("worker-ready");
    const unresolvedWorkerId = fakeCloudflareWorkerId("worker-unresolved");
    const convexProjectId = fakeConvexProjectId();
    const state = buildVaultRepositorySettingsState({
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableRepositorySettingsCloudflareObservation({ workerId: readyWorkerId }),
          makeAvailableRepositorySettingsCloudflareObservation({
            workerId: unresolvedWorkerId,
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
            observedAt: 1,
            workerId: unresolvedWorkerId,
            reason: "request_failed",
          },
        ],
        convexBuildAccess: [],
      }),
      connectedCloudflareAccount: undefined,
      convexObservations: {
        state: "loaded",
        freshness: "current",
        refreshing: false,
        reload: () => {},
        observations: [
          {
            observedAt: 1,
            convexProjectId,
            projectId: "api-project",
            codeLocation: { kind: "config", convexConfigPath: "packages/api/convex.json" },
            source: { state: "missing" },
            provider: {
              state: "moved",
              previousTeamId: "team-old",
              currentTeamId: "team-new",
              projectName: "API",
              projectSlug: "api",
              teamSlug: "ada",
              productionDeployment: { state: "missing" },
            },
          },
        ],
      },
      changeConvexProjectConfigPathOnClick: () => {},
      reconcileConvexProjectTeamOnClick: () => {},
      detachCloudflareWorkerOnClick: () => {},
      detachConvexProjectOnClick: () => {},
      vault: makeRepositorySettingsBuilderVault({
        cloudflareWorkers: [
          makeRepositorySettingsCloudflareWorker({
            workerId: readyWorkerId,
            workerName: "web-worker",
          }),
          makeRepositorySettingsCloudflareWorker({
            workerId: unresolvedWorkerId,
            workerName: "unresolved-worker",
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

    expect(state.roots.map((root) => root.rootDirectory)).toEqual(["apps/web", "packages/api"]);
    expect(state.attentionResources).toHaveLength(1);
    expect(state.attentionResources[0]).toMatchObject({
      provider: "cloudflare",
      name: "unresolved-worker",
    });
    const convexResource = getRepositorySettingsResource(state, "packages/api", "convex");
    expect(convexResource).toMatchObject({
      owner: "ada",
      state: "available",
      name: "api",
    });
    expect(convexResource.actions?.map((action) => action.label) ?? []).toEqual([
      "Change code location",
      "Use current team",
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
      freshness: "current" as const,
      refreshing: false,
      reload: () => {},
      observations: [
        {
          observedAt: 1,
          convexProjectId: alphaProjectId,
          projectId: "alpha-project-id",
          codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
          source: { kind: "config" as const, state: "valid" as const, blobSha: "alpha-blob" },
          provider: {
            state: "current" as const,
            teamId: "team-alpha",
            projectName: "Alpha",
            projectSlug: "alpha",
            teamSlug: "ada",
            productionDeployment: { state: "missing" as const },
          },
        },
        {
          observedAt: 1,
          convexProjectId: betaProjectId,
          projectId: "beta-project-id",
          codeLocation: { kind: "config" as const, convexConfigPath: "convex.json" },
          source: { kind: "config" as const, state: "valid" as const, blobSha: "beta-blob" },
          provider: {
            state: "current" as const,
            teamId: "team-beta",
            projectName: "Beta",
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
              },
            }),
          ],
          convexBuildAccess: [
            {
              state: "available",
              observedAt: 1,
              workerId,
              convexBuildAccess,
            },
          ],
        }),
        connectedCloudflareAccount: undefined,
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
