import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import {
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteDialog,
  VaultDashboardVaultPickerPane,
  VaultDashboardView,
  VaultOverviewVaultPickerPane,
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { VaultDashboardCloudflareAccountDialog } from "./VaultDashboardCloudflareAccountDialog";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { VaultDefaultBranch } from "./VaultDefaultBranch";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
import { buildVaultProductionRoots } from "./vaultProductionRoots";
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

type CloudflareDialogWorker = Parameters<
  typeof VaultDashboardCloudflareDialog
>[0]["workers"][number];

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

type ResourceRailBuilderVault = Parameters<typeof buildVaultDashboardResourceRailState>[0]["vault"];
type ResourceRailCloudflareWorker = ResourceRailBuilderVault["cloudflareWorkers"][number];
type ResourceRailConvexProject = ResourceRailBuilderVault["convexProjects"][number];
type AvailableResourceRailCloudflareObservation = Extract<
  VaultCloudflareWorkerObservation,
  { state: "available" }
>;
type AvailableResourceRailCloudflareBuildsObservation = Extract<
  VaultCloudflareWorkerBuildsObservation,
  { state: "available" }
>;
type AvailableResourceRailCloudflareConvexBuildAccessObservation = Extract<
  VaultCloudflareWorkerConvexBuildAccessObservation,
  { state: "available" }
>;

function getResourceRailRootRow(
  state: ReturnType<typeof buildVaultDashboardResourceRailState>,
  rootDirectory: string,
  provider: "cloudflare" | "convex",
) {
  const root = state.roots.find((candidate) => candidate.rootDirectory === rootDirectory);
  if (!root) {
    throw new Error(`Expected ${rootDirectory} root group.`);
  }
  const row = root.rows.find((candidate) => candidate.provider === provider);
  if (!row) {
    throw new Error(`Expected ${provider} row in ${rootDirectory} root group.`);
  }
  return row;
}

function makeResourceRailCloudflareWorker(
  overrides: Partial<ResourceRailCloudflareWorker>,
): ResourceRailCloudflareWorker {
  return {
    workerId: fakeCloudflareWorkerId(),
    accountId: "account-1",
    workerName: "demo-worker",
    workerTag: "demo-worker-tag",
    ...overrides,
  };
}

function makeAvailableResourceRailCloudflareObservation(
  overrides: Partial<AvailableResourceRailCloudflareObservation> & {
    workerId: Id<"vaultCloudflareWorkers">;
  },
): AvailableResourceRailCloudflareObservation {
  return {
    state: "available",
    observedAt: 1,
    customDomains: [],
    workersDev: { state: "enabled", url: "https://demo-worker.ada.workers.dev" },
    ...overrides,
  };
}

function makeAvailableResourceRailCloudflareBuildsObservation(
  overrides: Partial<AvailableResourceRailCloudflareBuildsObservation> & {
    workerId: Id<"vaultCloudflareWorkers">;
  },
): AvailableResourceRailCloudflareBuildsObservation {
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

function makeLoadingCloudflareObservations(): VaultCloudflareProviderObservationState {
  return {
    workers: { state: "loading" },
    builds: { state: "loading" },
    convexBuildAccess: { state: "loading" },
  };
}

function makeResourceRailConvexProject(
  overrides: Partial<ResourceRailConvexProject>,
): ResourceRailConvexProject {
  return {
    convexProjectId: fakeConvexProjectId(),
    codeLocation: { kind: "config", convexConfigPath: "convex.json" },
    teamId: "team-1",
    projectId: "demo-project-id",
    ...overrides,
  };
}

function makeResourceRailBuilderVault(
  overrides: Partial<ResourceRailBuilderVault>,
): ResourceRailBuilderVault {
  const vault: ResourceRailBuilderVault = {
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

describe("VaultDefaultBranch", () => {
  it("keeps the durable default branch visible without provider observations", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultDefaultBranch
          convexProjects={[]}
          defaultBranch="release/2026 Q3"
          defaultBranchObservation={null}
          githubBranchUrl="https://github.com/ada/demo/tree/release/2026%20Q3"
          githubRepositoryUrl="https://github.com/ada/demo"
          owner="ada"
          productionRoots={[]}
          repoName="demo"
          samebaseEditorUrl="/vault/ada/demo/fs/release%2F2026%20Q3"
          schemaGraphAccessEnabled={false}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-vault-default-branch=""');
    expect(markup).toContain('aria-label="Default branch release/2026 Q3"');
    expect(markup).toContain('href="https://github.com/ada/demo/tree/release/2026%20Q3"');
    expect(markup).toContain('href="/vault/ada/demo/fs/release%2F2026%20Q3"');
    expect(markup).toContain("<span>Edit</span>");
    expect(markup).not.toContain("?compare");
    expect(markup).not.toContain("Pull request");
  });

  it("renders every live production root without turning one into a pull request", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultDefaultBranch
          convexProjects={[
            {
              convexProjectId: fakeConvexProjectId(),
              codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
              projectId: "demo-project-id",
            },
          ]}
          defaultBranch="main"
          defaultBranchObservation={{
            headCommitOid: "abc123",
            headCommitTitle: "Ship the provider model",
            headCommitCommittedAt: "2026-07-21T09:30:00Z",
            headCommitUrl: "https://github.com/ada/demo/commit/abc123",
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                totalCount: 1,
                checkRunCount: 1,
                statusContextCount: 0,
                checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
                statusContextCountsByState: [],
                nodes: [
                  {
                    kind: "check_run",
                    name: "checks (24.x)",
                    status: "COMPLETED",
                    conclusion: "SUCCESS",
                    detailsUrl: "https://github.com/ada/demo/actions/runs/1/job/1",
                    title: null,
                  },
                ],
              },
            },
            checks: {
              state: "success",
              totalCount: 1,
              successCount: 1,
              failureCount: 0,
              runningCount: 0,
              neutralCount: 0,
              unknownCount: 0,
            },
          }}
          githubBranchUrl="https://github.com/ada/demo/tree/main"
          githubRepositoryUrl="https://github.com/ada/demo"
          owner="ada"
          repoName="demo"
          samebaseEditorUrl="/vault/ada/demo/fs/main"
          schemaGraphAccessEnabled={true}
          productionRoots={[
            {
              rootDirectory: "apps/api",
              links: [
                {
                  href: "https://api.ada.workers.dev",
                  label: "api.ada.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app for apps/api",
                },
              ],
            },
            {
              rootDirectory: "apps/web",
              links: [
                {
                  href: "https://web.ada.workers.dev",
                  label: "web.ada.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app for apps/web",
                },
                {
                  href: "https://dashboard.convex.dev/t/ada/demo/calm-swan-123",
                  label: "calm-swan-123",
                  provider: "convex",
                  title: "Open production Convex deployment calm-swan-123",
                },
              ],
            },
          ]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("apps/api");
    expect(markup).toContain('href="https://api.ada.workers.dev"');
    expect(markup).toContain("apps/web");
    expect(markup).toContain('href="https://web.ada.workers.dev"');
    expect(markup).toContain('href="https://dashboard.convex.dev/t/ada/demo/calm-swan-123"');
    expect(markup).toContain(`href="/vault/ada/demo/db/main/project/${fakeConvexProjectId()}"`);
    expect(markup).toContain(`href="/vault/ada/demo/schema/main/project/${fakeConvexProjectId()}"`);
    expect(markup).toContain("Data: apps/web");
    expect(markup).toContain("Schema: apps/web");
    expect(markup).toContain('title="Show default branch checks"');
    expect(markup).toContain("1 passed");
    expect(markup).not.toContain("PR #");
  });

  it("keeps Schema gated while retaining Data", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultDefaultBranch
          convexProjects={[
            {
              convexProjectId: fakeConvexProjectId(),
              codeLocation: { kind: "config", convexConfigPath: "convex.json" },
              projectId: "demo-project-id",
            },
          ]}
          defaultBranch="main"
          defaultBranchObservation={null}
          githubBranchUrl="https://github.com/ada/demo/tree/main"
          githubRepositoryUrl="https://github.com/ada/demo"
          owner="ada"
          productionRoots={[]}
          repoName="demo"
          samebaseEditorUrl="/vault/ada/demo/fs/main"
          schemaGraphAccessEnabled={false}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`href="/vault/ada/demo/db/main/project/${fakeConvexProjectId()}"`);
    expect(markup).not.toContain("/schema/");
  });
});

describe("buildVaultProductionRoots", () => {
  it("joins direct attachments to matching live Worker and Convex observations", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const vault = makeResourceRailBuilderVault({
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ workerId })],
      convexProjects: [
        makeResourceRailConvexProject({
          convexProjectId,
          codeLocation: { kind: "config", convexConfigPath: "apps/web/convex.json" },
        }),
      ],
    });

    const roots = buildVaultProductionRoots({
      vault,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableResourceRailCloudflareObservation({
            workerId,
            customDomains: ["www.example.com", "app.example.com"],
          }),
        ],
        builds: [
          makeAvailableResourceRailCloudflareBuildsObservation({
            workerId,
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
    });

    expect(roots).toEqual([
      {
        rootDirectory: "apps/web",
        links: [
          {
            href: "https://app.example.com",
            label: "app.example.com",
            provider: "cloudflare",
            title: "Open production app for apps/web",
          },
          {
            href: "https://www.example.com",
            label: "www.example.com",
            provider: "cloudflare",
            title: "Open production app for apps/web",
          },
          {
            href: "https://demo-worker.ada.workers.dev",
            label: "demo-worker.ada.workers.dev",
            provider: "cloudflare",
            title: "Open production app for apps/web",
          },
          {
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
    const vault = makeResourceRailBuilderVault({
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ workerId })],
    });

    const roots = buildVaultProductionRoots({
      vault,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableResourceRailCloudflareObservation({
            workerId,
            customDomains: ["app.example.com"],
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [makeAvailableResourceRailCloudflareBuildsObservation({ workerId })],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        freshness: "current",
        refreshing: false,
        reload: () => {},
        observations: [],
      },
    });

    expect(roots).toEqual([
      {
        rootDirectory: "/",
        links: [
          {
            href: "https://app.example.com",
            label: "app.example.com",
            provider: "cloudflare",
            title: "Open production app",
          },
        ],
      },
    ]);
  });

  it("does not manufacture links from attachments when live resources are missing", () => {
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const vault = makeResourceRailBuilderVault({
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ workerId })],
      convexProjects: [makeResourceRailConvexProject({ convexProjectId })],
    });

    expect(
      buildVaultProductionRoots({
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
      }),
    ).toEqual([]);
  });
});

describe("VaultDashboardRepositoryCard", () => {
  it("renders the onboarding empty state when the loaded vault list is empty", () => {
    const rootRouteSearch = validateRootRouteSearch({});
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          schemaGraphAccessEnabled={false}
          cloudflareObservations={makeLoadingCloudflareObservations()}
          cloudflareWorkerConfigurationActionInFlight={null}
          convexObservations={{ state: "loading" }}
          isRemovingVault={false}
          providerAttachmentDetachmentInFlight={null}
          pullRequests={{ state: "not_requested" }}
          reconcilingConvexProjectId={null}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          viewModel={{ vaults: [] }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultPullRequestFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          rootRouteSearch={rootRouteSearch}
          onConfigureWorkersBuildsForGitHub={() => {}}
          onChangeConvexProjectConfigPath={() => {}}
          onReconcileConvexProjectTeam={() => {}}
          onRotateConvexDeployKeysForWorkersBuilds={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onDetachCloudflareWorker={() => {}}
          onDetachConvexProject={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultPullRequestFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="vault-dashboard-empty-state"');
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );
  });

  it("shows live pull requests while connected source setup is failed", () => {
    const rootRouteSearch = validateRootRouteSearch({});
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          schemaGraphAccessEnabled={false}
          cloudflareObservations={makeLoadingCloudflareObservations()}
          cloudflareWorkerConfigurationActionInFlight={null}
          convexObservations={{ state: "loading" }}
          isRemovingVault={false}
          providerAttachmentDetachmentInFlight={null}
          pullRequests={{
            state: "current",
            defaultBranch: null,
            pullRequests: [],
            allPullRequests: [],
            refreshing: false,
            resourceState: "current",
            resourcesByPullRequestId: new Map(),
            hasMore: false,
            isLoadingMore: false,
            canLoadMore: false,
            loadMoreFailed: false,
            loadMore: () => {},
          }}
          reconcilingConvexProjectId={null}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          viewModel={{
            vaults: [
              makeResourceRailBuilderVault({
                sourceSetup: {
                  status: "failed",
                  runId: fakeRunId(),
                  step: "sync_tree",
                  message: "Initial tree sync failed.",
                  updatedAt: 30,
                },
              }),
            ],
          }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultPullRequestFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          rootRouteSearch={rootRouteSearch}
          onConfigureWorkersBuildsForGitHub={() => {}}
          onChangeConvexProjectConfigPath={() => {}}
          onReconcileConvexProjectTeam={() => {}}
          onRotateConvexDeployKeysForWorkersBuilds={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onDetachCloudflareWorker={() => {}}
          onDetachConvexProject={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultPullRequestFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("Initial tree sync failed.");
    expect(markup).toContain('data-vault-default-branch=""');
    expect(markup).toContain('href="https://github.com/ada/demo/tree/main"');
    expect(markup).toContain('href="/vault/ada/demo/fs/main"');
    expect(markup.indexOf('data-vault-default-branch=""')).toBeLessThan(
      markup.indexOf('aria-label="Open pull requests"'),
    );
    expect(markup).toContain('aria-label="Open pull requests"');
    expect(markup).toContain("No open pull requests");
    expect(markup).not.toContain("bg-muted/30 opacity-75");
    expect(markup).not.toContain("/fs/main?compare");
  });

  it("renders the new root vault picker in the main pane", () => {
    const vault = makeResourceRailBuilderVault({
      cloudflareWorkers: [makeResourceRailCloudflareWorker({})],
      convexProjects: [makeResourceRailConvexProject({})],
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
            makeResourceRailBuilderVault({
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
            makeResourceRailBuilderVault({
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

  it("keeps the legacy root vault picker on legacy routes", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vaultold/"]}>
        <VaultDashboardVaultPickerPane
          vaults={[
            makeResourceRailBuilderVault({
              ghRepoName: "demo",
              ghRepoOwner: "ada",
              repositoryFullName: "ada/demo",
            }),
          ]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("ada/demo");
    expect(markup).toContain('href="/vaultold/ada/demo"');
    expect(markup).not.toContain("Status not loaded");
  });

  it("keeps the repository title passive when no title href is provided", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        muted
        repositoryName="samebase"
        repositoryLinksOpen={false}
        onRepositoryLinksOpenChange={() => {}}
        titleSuffix={
          <span className="shrink-0 text-xs font-normal text-muted-foreground">(deleting...)</span>
        }
      />,
    );

    expect(markup).toContain("samebase");
    expect(markup).not.toContain("samebase/");
    expect(markup).toContain("(deleting...)");
    expect(markup).not.toContain("<a");
  });

  it("keeps resource links collapsed behind a header trigger", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        muted={false}
        repositoryName="samebase"
        repositoryLinks={
          <nav aria-label="Repository resources">
            <a href="https://github.com/samebase/samebase">GitHub</a>
          </nav>
        }
        repositoryLinksOpen={false}
        onRepositoryLinksOpenChange={() => {}}
        topRightAction={<span>Delete</span>}
      />,
    );

    expect(markup).toContain("Show resource links");
    expect(markup).toContain("Delete");
    expect(markup).toContain("lucide-chevron-down");
    expect(markup).not.toContain("lucide-chevron-up");
    expect(markup).not.toContain("GitHub");
  });

  it("shows resource links when the persisted header state is open", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        muted={false}
        repositoryName="samebase"
        repositoryLinks={
          <nav aria-label="Repository resources">
            <a href="https://github.com/samebase/samebase">GitHub</a>
          </nav>
        }
        repositoryLinksOpen={true}
        onRepositoryLinksOpenChange={() => {}}
        topRightAction={<span>Delete</span>}
      />,
    );

    expect(markup).toContain("Hide resource links");
    expect(markup).toContain("lucide-chevron-up");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).toContain("GitHub");
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
    expect(formatVaultSourceSetupStep("connect_github")).toBe("connect GitHub");
    expect(formatVaultSourceSetupStep("fetch_github_repo")).toBe("fetch GitHub repo");
    expect(formatVaultSourceSetupStep("seed_starter")).toBe("seed starter");
    expect(formatVaultSourceSetupStep("sync_tree")).toBe("sync tree");
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
    } satisfies ResourceRailBuilderVault["providerSetup"];

    expect(resolveVaultProviderSetupStepProvider(providerSetup)).toBe("cloudflare");
    expect(resolveVaultProviderSetupStatus(providerSetup)).toEqual({
      status: "running",
      label: "Cloudflare: provisioning",
    });
  });
});

describe("VaultProviderSetupSection", () => {
  it("renders provider progress without the provisioning log", () => {
    const markup = renderToStaticMarkup(
      <VaultProviderSetupSection
        isRetrying={false}
        onRetry={() => {}}
        repositoryFullName="ada/demo"
        providerSetup={{
          status: "running",
          provider: "convex",
          runId: fakeRunId(),
          step: "attach_convex",
          updatedAt: 0,
        }}
      />,
    );

    expect(markup).toContain("Convex: provisioning");
    expect(markup).not.toContain("Provisioning log");
    expect(markup).not.toContain("Provision infra");
    expect(markup).not.toContain(">Retry<");
  });

  it("renders a short Cloudflare GitHub App authorization recovery message", () => {
    const markup = renderToStaticMarkup(
      <VaultProviderSetupSection
        isRetrying={false}
        onRetry={() => {}}
        repositoryFullName="ada/tmp-myapp1234"
        providerSetup={{
          status: "failed",
          provider: "cloudflare",
          runId: fakeRunId(),
          step: "attach_worker",
          message:
            "Cloudflare Workers and Pages GitHub App is not authorized for ada/tmp-myapp1234. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ada/tmp-myapp1234, then retry.",
          updatedAt: 0,
        }}
      />,
    );

    expect(markup).toContain("Cloudflare cannot access this GitHub repo.");
    expect(markup).toContain("Cloudflare&#x27;s recovery steps");
    expect(markup).toContain("uninstall the");
    expect(markup).toContain("first, then reconnect GitHub");
    expect(markup).toContain("Workers &amp; Pages");
    expect(markup).toContain("Create application");
    expect(markup).toContain("Include ada/tmp-myapp1234");
    expect(markup).toContain("Cloudflare Workers and Pages GitHub App");
    expect(markup).toContain(
      "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app",
    );
    expect(markup).toContain("https://github.com/apps/cloudflare-workers-and-pages");
    expect(markup).not.toContain("https://github.com/ada/tmp-myapp1234/settings/installations");
    expect(markup).not.toContain("Last failure:");
    expect(markup).toContain(">Retry<");
  });
});

describe("VaultDashboardDeleteDialog", () => {
  const baseProps = {
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
    isCommitting: false,
    isDeleting: false,
    onCommitBeforeRemove: () => {},
    onDeleteOptionChange: () => {},
    onOpenChange: () => {},
    onRemoveVault: () => {},
    open: true,
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
    stagedChangesCount: 0,
  } satisfies Omit<Parameters<typeof VaultDashboardDeleteDialog>[0], "vaultToDelete">;

  it("allows Cloudflare cleanup for provisioned Workers on connected repository vaults", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardDeleteDialog
        {...baseProps}
        vaultToDelete={{
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
      <VaultDashboardDeleteDialog
        {...baseProps}
        vaultToDelete={{
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

describe("VaultDashboardConvexDialog", () => {
  type ConvexDialogProps = Parameters<typeof VaultDashboardConvexDialog>[0];

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
      <VaultDashboardConvexDialog
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
        open
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
      <VaultDashboardConvexDialog
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
        open
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
        <VaultDashboardConvexDialog
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
          open
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
      <VaultDashboardConvexDialog
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
        open
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
      <VaultDashboardConvexDialog
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
        open
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

describe("VaultDashboardCloudflareDialog", () => {
  const vault = {
    id: fakeVaultId(),
    repositoryFullName: "ada/demo",
    repositoryName: "demo",
  };

  it("replaces disabled controls with a timed loading state while searching", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
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
        open
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
      <VaultDashboardCloudflareDialog
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
        open
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
      <VaultDashboardCloudflareDialog
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
        open
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
      <VaultDashboardCloudflareDialog
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
        open
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
      <VaultDashboardCloudflareDialog
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
        open
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
      <VaultDashboardCloudflareDialog
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
        open
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

describe("buildVaultDashboardResourceRailState", () => {
  it("keeps the GitHub connection available when source setup fails", () => {
    const state = buildVaultDashboardResourceRailState({
      vault: makeResourceRailBuilderVault({
        sourceSetup: {
          status: "failed",
          runId: fakeRunId(),
          step: "sync_tree",
          message: "Initial tree sync failed.",
          updatedAt: 30,
        },
      }),
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations: makeLoadingCloudflareObservations(),
      convexObservations: { state: "loading" },
    });

    expect(state.githubRow).toMatchObject({
      provider: "github",
      status: "available",
      href: "https://github.com/ada/demo",
    });
  });

  it("groups resources by observed roots and keeps unresolved Workers in attention", () => {
    const readyWorkerId = fakeCloudflareWorkerId("worker-ready");
    const unresolvedWorkerId = fakeCloudflareWorkerId("worker-unresolved");
    const convexProjectId = fakeConvexProjectId();
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableResourceRailCloudflareObservation({ workerId: readyWorkerId }),
          makeAvailableResourceRailCloudflareObservation({
            workerId: unresolvedWorkerId,
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [
          makeAvailableResourceRailCloudflareBuildsObservation({
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
      githubRepositoryUrl: "https://github.com/ada/demo",
      changeConvexProjectConfigPathOnClick: () => {},
      reconcileConvexProjectTeamOnClick: () => {},
      detachCloudflareWorkerOnClick: () => {},
      detachConvexProjectOnClick: () => {},
      vault: makeResourceRailBuilderVault({
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            workerId: readyWorkerId,
            workerName: "web-worker",
          }),
          makeResourceRailCloudflareWorker({
            workerId: unresolvedWorkerId,
            workerName: "unresolved-worker",
          }),
        ],
        convexProjects: [
          makeResourceRailConvexProject({
            convexProjectId,
            codeLocation: { kind: "config", convexConfigPath: "packages/api/convex.json" },
            projectId: "api-project",
          }),
        ],
      }),
    });

    expect(state.roots.map((root) => root.rootDirectory)).toEqual(["apps/web", "packages/api"]);
    expect(state.attentionRows).toHaveLength(1);
    expect(state.attentionRows[0]).toMatchObject({
      provider: "cloudflare",
      value: "unresolved-worker",
    });
    const convexRow = getResourceRailRootRow(state, "packages/api", "convex");
    expect(convexRow).toMatchObject({
      scope: "ada",
      status: "available",
      value: "api",
    });
    expect(
      convexRow.status === "available" ? convexRow.actions?.map((action) => action.label) : [],
    ).toEqual(["Change code location", "Use current team", "Remove from vault"]);
    expect(state.vaultActionRows.map((row) => row.rowId)).toEqual(["convex:add", "cloudflare:add"]);
  });

  it("names exact Convex targets and limits key repair to the observed attachment", () => {
    const workerId = fakeCloudflareWorkerId("worker-build-access");
    const alphaProjectId = fakeConvexProjectId("convex-alpha");
    const betaProjectId = fakeConvexProjectId("convex-beta");
    const rotate = vi.fn();
    const vaultWithBuildAccess = makeResourceRailBuilderVault({
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ workerId })],
      convexProjects: [
        makeResourceRailConvexProject({
          convexProjectId: alphaProjectId,
          projectId: "alpha-project-id",
          teamId: "team-alpha",
        }),
        makeResourceRailConvexProject({
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
      convexBuildAccess: AvailableResourceRailCloudflareConvexBuildAccessObservation["convexBuildAccess"],
    ) => {
      const state = buildVaultDashboardResourceRailState({
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [makeAvailableResourceRailCloudflareObservation({ workerId })],
          builds: [
            makeAvailableResourceRailCloudflareBuildsObservation({
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
        convexObservations,
        githubRepositoryUrl: "https://github.com/ada/demo",
        rotateConvexDeployKeysForWorkersBuildsOnClick: rotate,
        vault: vaultWithBuildAccess,
      });
      const row = getResourceRailRootRow(state, "/", "cloudflare");
      if (row.status !== "available") {
        throw new Error("Expected an available Cloudflare row.");
      }
      return row;
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
