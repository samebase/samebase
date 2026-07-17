import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import {
  VaultDashboardAppDialog,
  VaultDashboardCloudflareBuildsDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteDialog,
  VaultDashboardVaultPickerPane,
  VaultDashboardView,
  VaultBranchLinkContent,
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { VaultDashboardCloudflareAccountDialog } from "./VaultDashboardCloudflareAccountDialog";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { VaultResourceRail } from "./VaultResourceRail";
import { readDefaultCloudflareWorkerSelection } from "./vaultDashboardCloudflareWorkerSelection";
import { buildVaultBranchRowViewModel } from "./vaultDashboardBranchRowViewModel";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
import {
  resolveVaultProviderSetupStatus,
  resolveVaultProviderSetupStepProvider,
} from "./vaultProviderSetup";
import { buildVaultProductionApps } from "./vaultProductionApps";
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

function fakeAppId(): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable app id.
  return "a17f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeSecondAppId(): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a second stable app id.
  return "a27f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeThirdAppId(): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a third stable app id.
  return "a37f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeCloudflareWorkerId(): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable Worker id.
  return "w17f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeSecondCloudflareWorkerId(): Id<"vaultCloudflareWorkers"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a second stable Worker id.
  return "w27f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeConvexDeploymentId(): Id<"vaultConvexDeployments"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable deployment id.
  return "c17f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeWorkerDeploymentDependencyId(): Id<"vaultWorkerDeploymentDependencies"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable dependency id.
  return "d17f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeSecondWorkerDeploymentDependencyId(): Id<"vaultWorkerDeploymentDependencies"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a second stable dependency id.
  return "d27f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeRunId(): Id<"appProvisioningRuns"> {
  // @ts-expect-error Convex ids are strings at runtime; this static render
  // test only needs a stable run id for component props.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
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
    discovery: {
      classification: "available",
      evidence: { state: "none" },
    },
    ...overrides,
  };
}

type ResourceRailBuilderVault = Parameters<typeof buildVaultDashboardResourceRailState>[0]["vault"];
type ResourceRailCloudflareWorker = ResourceRailBuilderVault["cloudflareWorkers"][number];
type ResourceRailConvexDeployment = ResourceRailBuilderVault["convexDeployments"][number];
type ResourceRailWorkerDeploymentDependency =
  ResourceRailBuilderVault["workerDeploymentDependencies"][number];

function getResourceRailAppRow(
  state: ReturnType<typeof buildVaultDashboardResourceRailState>,
  rootDirectory: string,
  provider: "cloudflare" | "convex",
) {
  const app = state.apps.find((candidate) => candidate.rootDirectory === rootDirectory);
  if (!app) {
    throw new Error(`Expected ${rootDirectory} app group.`);
  }
  const row = app.rows.find((candidate) => candidate.provider === provider);
  if (!row) {
    throw new Error(`Expected ${provider} row in ${rootDirectory} app group.`);
  }
  return row;
}

function makeResourceRailCloudflareWorker(
  overrides: Partial<ResourceRailCloudflareWorker>,
): ResourceRailCloudflareWorker {
  return {
    appId: fakeAppId(),
    githubRepositoryConnection: { state: "connected" },
    upstream: { state: "present" },
    lastObservedAt: 0,
    workerId: fakeCloudflareWorkerId(),
    workerName: "demo-worker",
    ...overrides,
  };
}

function makeResourceRailConvexDeployment(
  overrides: Partial<ResourceRailConvexDeployment>,
): ResourceRailConvexDeployment {
  return {
    appId: fakeAppId(),
    convexDeploymentId: fakeConvexDeploymentId(),
    projectId: "demo-project-id",
    projectSlug: "demo-project",
    teamSlug: "demo-team",
    deploymentName: "demo-production",
    upstream: { state: "present" },
    cloudUrl: "https://demo-production.convex.cloud",
    siteUrl: "https://demo-production.convex.site",
    ...overrides,
  };
}

function makeResourceRailWorkerDeploymentDependency(
  overrides: Partial<ResourceRailWorkerDeploymentDependency>,
): ResourceRailWorkerDeploymentDependency {
  return {
    dependencyId: fakeWorkerDeploymentDependencyId(),
    workerId: fakeCloudflareWorkerId(),
    convexDeploymentId: fakeConvexDeploymentId(),
    wiring: { state: "wired" },
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
    fileCount: 0,
    state: "ready",
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
    apps: [],
    cloudflareWorkers: [],
    convexDeployments: [],
    workerDeploymentDependencies: [],
  };
  return { ...vault, ...overrides };
}

describe("VaultBranchLinkContent", () => {
  it("models checks as commit data without requiring a pull request", () => {
    const viewModel = buildVaultBranchRowViewModel({
      repositoryFullName: "samebase/samebase",
      branch: {
        name: "main",
        headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
        commits: [
          {
            sha: "abcdef1234567890abcdef1234567890abcdef12",
            title: "Build dashboard branch rows from commits",
            checks: {
              state: "success",
              totalCount: 4,
              checkRunCount: 4,
              statusContextCount: 0,
              successCount: 4,
              failureCount: 0,
              runningCount: 0,
              neutralCount: 0,
              unknownCount: 0,
              primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/123",
              syncedAt: 1,
            },
          },
        ],
        isDefault: true,
        isProtected: false,
        lastSyncedAt: 0,
        remoteState: "active",
      },
    });

    expect(viewModel.pullRequest).toBeUndefined();
    expect(viewModel.commits).toMatchObject([
      {
        shortSha: "abcdef1",
        title: "Build dashboard branch rows from commits",
        checks: {
          state: "success",
          primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/123",
        },
        isHead: true,
      },
    ]);
  });

  it("renders commit checks for default branches without pull request metadata", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "main",
            headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
            commits: [
              {
                sha: "abcdef1234567890abcdef1234567890abcdef12",
                title: "Run checks on main",
                checks: {
                  state: "failure",
                  totalCount: 4,
                  checkRunCount: 4,
                  statusContextCount: 0,
                  successCount: 2,
                  failureCount: 2,
                  runningCount: 0,
                  neutralCount: 0,
                  unknownCount: 0,
                  primaryTargetUrl: "https://github.com/samebase/samebase/actions/runs/456",
                  syncedAt: 1,
                },
              },
            ],
            previewUrl: "https://preview-branch.example.workers.dev",
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="https://github.com/samebase/samebase/actions/runs/456"');
    expect(markup).toContain('href="https://preview-branch.example.workers.dev"');
    expect(markup).toContain(">2 failed<");
    expect(markup).toContain(">Preview<");
    expect(markup).not.toContain("Pull request");
  });

  it("keeps a visible commit link when a branch has no checks and no ahead-behind delta", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "main",
            headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
            commits: [{ sha: "abcdef1234567890abcdef1234567890abcdef12" }],
            aheadBy: 0,
            behindBy: 0,
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(
      'href="https://github.com/samebase/samebase/commit/abcdef1234567890abcdef1234567890abcdef12"',
    );
    expect(markup).toContain(">Head abcdef1<");
  });

  it("shows when the visible branch commits are only a history window", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "codex/history-window",
            headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
            commits: [
              {
                sha: "abcdef1234567890abcdef1234567890abcdef12",
                checks: {
                  state: "running",
                  totalCount: 2,
                  checkRunCount: 2,
                  statusContextCount: 0,
                  successCount: 0,
                  failureCount: 0,
                  runningCount: 2,
                  neutralCount: 0,
                  unknownCount: 0,
                  syncedAt: 1,
                },
              },
              {
                sha: "654321abcdef1234567890abcdef1234567890ab",
                checks: {
                  state: "success",
                  totalCount: 3,
                  checkRunCount: 3,
                  statusContextCount: 0,
                  successCount: 3,
                  failureCount: 0,
                  runningCount: 0,
                  neutralCount: 0,
                  unknownCount: 0,
                  syncedAt: 1,
                },
              },
            ],
            aheadBy: 5,
            behindBy: 2,
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(">Head abcdef1<");
    expect(markup).toContain(">654321a<");
    expect(markup).toContain(">↑5 ↓2<");
    expect(markup).toContain(">+3 more<");
    expect(markup).toContain('aria-label="3 more ahead commits not shown"');
  });

  it("labels zero-check summaries as no checks", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "codex/no-checks",
            headCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
            commits: [
              {
                sha: "abcdef1234567890abcdef1234567890abcdef12",
                checks: {
                  state: "unknown",
                  totalCount: 0,
                  checkRunCount: 0,
                  statusContextCount: 0,
                  successCount: 0,
                  failureCount: 0,
                  runningCount: 0,
                  neutralCount: 0,
                  unknownCount: 0,
                  syncedAt: 1,
                },
              },
            ],
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(">No checks<");
    expect(markup).not.toContain(">0 unknown<");
    expect(markup).toContain('aria-label="No checks"');
  });

  it("links the visible branch label to the GitHub branch tree", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "codex/dashboard branch-link",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(
      'href="https://github.com/samebase/samebase/tree/codex/dashboard%20branch-link"',
    );
    expect(markup).toContain('title="Open branch on GitHub"');
  });

  it("keeps the default branch Samebase link pointed at the branch editor", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/vault/samebase/samebase/fs/main"');
    expect(markup).toContain('title="Open branch in Samebase"');
    expect(markup).toContain(">Edit<");
    expect(markup).not.toContain(">View changes<");
    expect(markup).not.toContain("?compare");
  });

  it("links default branch Convex tools to their app routes", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          apps={[{ appId: fakeAppId(), rootDirectory: "/" }]}
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
          convexDeployments={[
            {
              appId: fakeAppId(),
              convexDeploymentId: fakeConvexDeploymentId(),
              projectId: "project-1",
              projectSlug: "samebase",
              teamSlug: "samebase",
              deploymentName: "samebase-production",
              cloudUrl: "https://samebase-production.convex.cloud",
              siteUrl: "https://samebase-production.convex.site",
              upstream: { state: "present" },
            },
          ]}
          schemaGraphAccessEnabled
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`href="/vault/samebase/samebase/db/main/${fakeConvexDeploymentId()}"`);
    expect(markup).toContain('title="Open production data for samebase-production"');
    expect(markup).toContain(">Data<");
    expect(markup).toContain(
      `href="/vault/samebase/samebase/schema/main/${fakeConvexDeploymentId()}"`,
    );
    expect(markup).toContain('title="Open Convex schema for samebase-production"');
    expect(markup).toContain(">Schema<");
  });

  it("hides default branch schema tools without schema graph access", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          apps={[{ appId: fakeAppId(), rootDirectory: "/" }]}
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
          convexDeployments={[
            {
              appId: fakeAppId(),
              convexDeploymentId: fakeConvexDeploymentId(),
              projectId: "project-1",
              projectSlug: "samebase",
              teamSlug: "samebase",
              deploymentName: "samebase-production",
              cloudUrl: "https://samebase-production.convex.cloud",
              siteUrl: "https://samebase-production.convex.site",
              upstream: { state: "present" },
            },
          ]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(`href="/vault/samebase/samebase/db/main/${fakeConvexDeploymentId()}"`);
    expect(markup).toContain(">Data<");
    expect(markup).not.toContain("/schema/main/");
    expect(markup).not.toContain(">Schema<");
  });

  it("links non-default branch Samebase actions to changed files", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          branch={{
            name: "codex/view changes",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/vault/samebase/samebase/fs/codex%2Fview%20changes?compare"');
    expect(markup).toContain('title="View changes in Samebase"');
    expect(markup).toContain(">View changes<");
    expect(markup).not.toContain(">Edit<");
    expect(markup).not.toContain(">Data<");
  });

  it("links the default branch to the production app URL", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          productionApps={[
            {
              appId: fakeAppId(),
              links: [
                {
                  href: "https://tmp-flow.nicuchiciuc.workers.dev",
                  label: "tmp-flow.nicuchiciuc.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app",
                },
              ],
              rootDirectory: "/",
            },
          ]}
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="https://tmp-flow.nicuchiciuc.workers.dev"');
    expect(markup).toContain('title="Open production app"');
    expect(markup).toContain(">tmp-flow.nicuchiciuc.workers.dev<");
    expect(markup.indexOf(">tmp-flow.nicuchiciuc.workers.dev<")).toBeLessThan(
      markup.indexOf(">main<"),
    );
  });

  it("links the default branch to every monorepo production app URL", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="samebase/samebase"
          productionApps={[
            {
              appId: fakeAppId(),
              links: [
                {
                  href: "https://api.pfp.workers.dev",
                  label: "api.pfp.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app for apps/api",
                },
              ],
              rootDirectory: "apps/api",
            },
            {
              appId: fakeSecondAppId(),
              links: [
                {
                  href: "https://samebase.pfp.workers.dev",
                  label: "samebase.pfp.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app for apps/samebase",
                },
                {
                  href: "https://dashboard.convex.dev/t/samebase/samebase/calm-swan-123",
                  label: "Production: calm-swan-123",
                  provider: "convex",
                  title: "Open production Convex deployment calm-swan-123",
                },
              ],
              rootDirectory: "apps/samebase",
            },
          ]}
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            commits: [{ sha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123" }],
            isDefault: true,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("apps/api");
    expect(markup).toContain('href="https://api.pfp.workers.dev"');
    expect(markup).toContain("apps/samebase");
    expect(markup).toContain('href="https://samebase.pfp.workers.dev"');
    expect(markup).toContain(
      'href="https://dashboard.convex.dev/t/samebase/samebase/calm-swan-123"',
    );
    expect(markup).toContain(">Production: calm-swan-123<");
    expect(markup.indexOf("apps/api")).toBeLessThan(markup.indexOf("apps/samebase"));
    expect(markup.indexOf("apps/samebase")).toBeLessThan(
      markup.indexOf("Production: calm-swan-123"),
    );
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
          cloudflareWorkerRepairActionInFlight={null}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={0}
          viewModel={{
            vaults: [],
            remoteBranchCatalogByVaultId: new Map(),
            remoteBranchPagesByVaultId: new Map(),
            stagedBranchSummariesByVaultId: new Map(),
          }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultBranchFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          schemaGraphAccessEnabled={false}
          rootRouteSearch={rootRouteSearch}
          onConnectCloudflareGithubRepository={() => {}}
          onDeployCloudflareConvex={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onManualRepositoryRefresh={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultBranchFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
          onSetCloudflareConvexDeployKeys={() => {}}
          onVerifyCloudflareInfrastructure={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="vault-dashboard-empty-state"');
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );
  });

  it("omits production links for provider resources marked missing upstream", () => {
    const vault = makeResourceRailBuilderVault({
      apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
      cloudflareWorkers: [
        makeResourceRailCloudflareWorker({
          upstream: {
            state: "missing_upstream",
            nextAction: "connect_cloudflare_worker",
          },
          workersDevUrl: "https://stale-worker.ada.workers.dev",
        }),
      ],
      convexDeployments: [
        makeResourceRailConvexDeployment({
          upstream: {
            state: "missing_upstream",
            nextAction: "connect_convex_deployment",
          },
          deploymentDashboardUrl: "https://dashboard.convex.dev/t/ada/demo/demo-production",
        }),
      ],
    });

    expect(buildVaultProductionApps(vault)).toEqual([]);
  });

  it("renders the root dashboard vault picker in the main pane", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/"]}>
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

    expect(markup).toContain("Vaults");
    expect(markup).toContain("ada/demo");
    expect(markup).toContain('href="/vault/ada/demo"');
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );
  });

  it("keeps the repository title passive when no title href is provided", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        isReady={false}
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
        isReady={true}
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
        isReady={true}
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
    expect(formatVaultSourceSetupStep("create_vault")).toBe("connect GitHub");
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
        source: "managed",
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
      source: "managed",
      runId: fakeRunId(),
      step: "wire_convex_build_access",
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
        repositoryFullName="ada/demo"
        providerSetup={{
          status: "running",
          provider: "convex",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_convex",
          updatedAt: 0,
        }}
      />,
    );

    expect(markup).toContain("Convex: provisioning");
    expect(markup).not.toContain("Provisioning log");
    expect(markup).not.toContain("Provision infra");
    expect(markup).not.toContain("Retry infra");
  });

  it("renders a short Cloudflare GitHub App authorization recovery message", () => {
    const markup = renderToStaticMarkup(
      <VaultProviderSetupSection
        repositoryFullName="ada/tmp-myapp1234"
        providerSetup={{
          status: "failed",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_worker",
          message:
            "Cloudflare Workers and Pages GitHub App is not authorized for ada/tmp-myapp1234. Follow Cloudflare's recovery steps at https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages and include ada/tmp-myapp1234, then retry.",
          updatedAt: 0,
          nextAction: "retry_infrastructure_provisioning",
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
  });
});

describe("VaultDashboardDeleteDialog", () => {
  const baseProps = {
    commitError: null,
    connectedCodespacesCount: 0,
    deleteError: null,
    didAttemptCommit: false,
    isCommitting: false,
    isDeleting: false,
    onCommitBeforeRemove: () => {},
    onDeleteOptionChange: () => {},
    onOpenChange: () => {},
    onRemoveVault: () => {},
    open: true,
    removeCodespaces: false,
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

describe("VaultDashboardAppDialog", () => {
  it("renders the first app at the repository root", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppDialog
        rootDirectory="/"
        error={null}
        folderSuggestions={[]}
        isSubmitting={false}
        location="repository_root"
        onRootDirectoryChange={vi.fn()}
        onLocationChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasApps: false,
          hasRepositoryRootApp: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("Choose whether this app uses the repository root or a folder.");
    expect(markup).toContain("Repository root");
    expect(markup).toContain("Folder");
    expect(markup).not.toContain('aria-label="Root directory"');
    expect(markup).toContain("Add app");
    expect(markup).toContain('type="submit"');
  });

  it("renders the first app in a folder with an editable root directory", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppDialog
        rootDirectory="apps/domain-router"
        error={null}
        folderSuggestions={[]}
        isSubmitting={false}
        location="folder"
        onRootDirectoryChange={vi.fn()}
        onLocationChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasApps: false,
          hasRepositoryRootApp: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("Add app ada/demo");
    expect(markup).toContain("apps/domain-router");
    expect(markup).not.toContain("readOnly");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('type="submit"');
  });

  it("still offers the repository root after a folder app was created first", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppDialog
        rootDirectory="apps/domain-router"
        error={null}
        folderSuggestions={[]}
        isSubmitting={false}
        location="folder"
        onRootDirectoryChange={vi.fn()}
        onLocationChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasApps: true,
          hasRepositoryRootApp: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("Choose whether this app uses the repository root or a folder.");
    expect(markup).toContain("Add app ada/demo");
    expect(markup).toContain("App location");
    expect(markup).toContain("apps/domain-router");
    expect(markup).toContain("Add app");
  });

  it("requires a folder once the repository-root app exists", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppDialog
        rootDirectory="apps/domain-router"
        error={null}
        folderSuggestions={[]}
        isSubmitting={false}
        location="folder"
        onRootDirectoryChange={vi.fn()}
        onLocationChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasApps: true,
          hasRepositoryRootApp: true,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("Choose the folder for this app.");
    expect(markup).not.toContain("App location");
    expect(markup).toContain("apps/domain-router");
  });
});

describe("VaultDashboardCloudflareBuildsDialog", () => {
  const target = {
    allowWorkerOnly: true,
    mode: "connect_repository" as const,
    workerName: "demo-worker",
    convexDeployments: [
      {
        convexDeploymentId: fakeConvexDeploymentId(),
        projectSlug: "demo-project",
        rootDirectory: "packages/backend",
        teamSlug: "demo-team",
      },
    ],
  };

  it("requires an explicit Worker-only or Convex deployment choice", () => {
    const unselectedMarkup = renderToStaticMarkup(
      <VaultDashboardCloudflareBuildsDialog
        isSubmitting={false}
        onConvexDeploymentChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        selection={{ state: "unselected" }}
        target={target}
      />,
    );
    expect(unselectedMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Connect<\/button>/);
    expect(unselectedMarkup).toContain("Convex deployment");

    const workerOnlyMarkup = renderToStaticMarkup(
      <VaultDashboardCloudflareBuildsDialog
        isSubmitting={false}
        onConvexDeploymentChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        selection={{ state: "worker_only" }}
        target={target}
      />,
    );
    expect(workerOnlyMarkup).not.toMatch(/<button[^>]*disabled=""[^>]*>Connect<\/button>/);
    expect(workerOnlyMarkup).toContain("No Convex deployment");

    const deploymentMarkup = renderToStaticMarkup(
      <VaultDashboardCloudflareBuildsDialog
        isSubmitting={false}
        onConvexDeploymentChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        selection={{
          state: "deploys_convex",
          convexDeploymentId: fakeConvexDeploymentId(),
        }}
        target={target}
      />,
    );
    expect(deploymentMarkup).toContain("packages/backend · demo-team/demo-project");
  });

  it("shows an existing dependency without offering a false Worker-only transition", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareBuildsDialog
        isSubmitting={false}
        onConvexDeploymentChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        selection={{
          state: "deploys_convex",
          convexDeploymentId: fakeConvexDeploymentId(),
        }}
        target={{ ...target, allowWorkerOnly: false }}
      />,
    );

    expect(markup).toContain("packages/backend · demo-team/demo-project");
    expect(markup).not.toContain("No Convex deployment");
  });
});

describe("VaultDashboardConvexDialog", () => {
  it("hides the root directory input for the repository root app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardConvexDialog
        rootDirectory="/"
        rootDirectoryReadOnly={true}
        createProjectName="demo"
        projects={[
          {
            projectId: "project-1",
            projectName: "Demo",
            projectSlug: "demo",
            teamSlug: "ada-team",
          },
        ]}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onRootDirectoryChange={vi.fn()}
        onCreateProjectNameChange={vi.fn()}
        onProjectChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        selectedProjectId="project-1"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "/",
        }}
      />,
    );

    expect(markup).toContain("Connect Convex ada/demo");
    expect(markup).toContain("Demo");
    expect(markup).not.toContain('placeholder="Root directory"');
    expect(markup).not.toContain("readOnly");
    expect(markup).toContain("Connect Project");
  });

  it("renders the root directory for a folder app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardConvexDialog
        rootDirectory="apps/samebase"
        rootDirectoryReadOnly={true}
        createProjectName="demo"
        projects={[
          {
            projectId: "project-1",
            projectName: "Demo",
            projectSlug: "demo",
            teamSlug: "ada-team",
          },
        ]}
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onRootDirectoryChange={vi.fn()}
        onCreateProjectNameChange={vi.fn()}
        onProjectChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        selectedProjectId="project-1"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "apps/samebase",
        }}
      />,
    );

    expect(markup).toContain("apps/samebase");
    expect(markup).toContain('aria-label="Root directory"');
    expect(markup).toContain('placeholder="Root directory"');
    expect(markup).toContain("readOnly");
    expect(markup).toContain("Connect Project");
  });
});

describe("VaultDashboardCloudflareDialog", () => {
  it("preselects the only recommended Cloudflare Worker", () => {
    expect(
      readDefaultCloudflareWorkerSelection(
        [
          makeCloudflareDialogWorker({
            workerName: "samebase",
            discovery: {
              classification: "recommended",
              evidence: {
                state: "matching_repo",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/samebase",
              },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "available-worker",
            workerTag: "worker-tag-2",
          }),
        ],
        "",
      ),
    ).toBe("samebase");
  });

  it("does not preselect when multiple Cloudflare Workers are recommended", () => {
    expect(
      readDefaultCloudflareWorkerSelection(
        [
          makeCloudflareDialogWorker({
            workerName: "samebase",
            discovery: {
              classification: "recommended",
              evidence: {
                state: "matching_repo",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/samebase",
              },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "samebase-domains",
            workerTag: "worker-tag-2",
            discovery: {
              classification: "recommended",
              evidence: {
                state: "matching_repo",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/samebase",
              },
            },
          }),
        ],
        "",
      ),
    ).toBe("");
  });

  it("clears a stale selected Cloudflare Worker when discovery blocks it", () => {
    expect(
      readDefaultCloudflareWorkerSelection(
        [
          makeCloudflareDialogWorker({
            workerName: "admin-worker",
            discovery: {
              classification: "blocked",
              evidence: {
                state: "same_repo_different_root",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/admin",
                expectedRootDirectory: "apps/web",
              },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "available-worker",
            workerTag: "worker-tag-2",
          }),
        ],
        "admin-worker",
      ),
    ).toBe("");
  });

  it("keeps a manually selected selectable Cloudflare Worker", () => {
    expect(
      readDefaultCloudflareWorkerSelection(
        [
          makeCloudflareDialogWorker({
            workerName: "manual-worker",
          }),
          makeCloudflareDialogWorker({
            workerName: "samebase",
            workerTag: "worker-tag-2",
            discovery: {
              classification: "recommended",
              evidence: {
                state: "matching_repo",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/samebase",
              },
            },
          }),
        ],
        "manual-worker",
      ),
    ).toBe("manual-worker");
  });

  it("hides the root directory input for the repository root app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        rootDirectory="/"
        rootDirectoryReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onRootDirectoryChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "/",
        }}
        workers={[makeCloudflareDialogWorker({})]}
      />,
    );

    expect(markup).toContain("Connect Cloudflare ada/demo");
    expect(markup).toContain("demo-worker");
    expect(markup).not.toContain('placeholder="Root directory"');
    expect(markup).not.toContain("readOnly");
  });

  it("renders the root directory for a folder app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        rootDirectory="apps/samebase"
        rootDirectoryReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onRootDirectoryChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "apps/samebase",
        }}
        workers={[makeCloudflareDialogWorker({})]}
      />,
    );

    expect(markup).toContain("apps/samebase");
    expect(markup).toContain('aria-label="Root directory"');
    expect(markup).toContain('placeholder="Root directory"');
    expect(markup).toContain("readOnly");
  });

  it("shows selected Worker discovery evidence", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        rootDirectory="/"
        rootDirectoryReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onRootDirectoryChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "/",
        }}
        workers={[
          makeCloudflareDialogWorker({
            discovery: {
              classification: "recommended",
              evidence: {
                state: "matching_repo",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "/",
              },
            },
          }),
          makeCloudflareDialogWorker({
            workerName: "other-worker",
            workerTag: "worker-tag-2",
            discovery: {
              classification: "blocked",
              evidence: {
                state: "different_repo",
                repoId: "999",
                repoName: "ada/other",
                triggerName: "Production Deploy",
              },
            },
          }),
        ]}
      />,
    );

    expect(markup).toContain("Recommended: Builds repo ada/demo (123), root /");
  });

  it("surfaces same-repo different-root Workers without enabling submit", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        rootDirectory="apps/web"
        rootDirectoryReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onRootDirectoryChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="admin-worker"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "apps/web",
        }}
        workers={[
          makeCloudflareDialogWorker({
            workerName: "available-worker",
            workerTag: "worker-tag-3",
          }),
          makeCloudflareDialogWorker({
            workerName: "admin-worker",
            workerTag: "worker-tag-2",
            discovery: {
              classification: "blocked",
              evidence: {
                state: "same_repo_different_root",
                repoId: "123",
                repoName: "ada/demo",
                triggerName: "Production Deploy",
                rootDirectory: "apps/admin",
                expectedRootDirectory: "apps/web",
              },
            },
          }),
        ]}
      />,
    );

    expect(markup).toContain(
      "Same repo, different root: Builds root apps/admin, expected apps/web",
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Connect Worker<\/button>/);
  });

  it("disables submit when stale state selects a different-repo Worker", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        rootDirectory="/"
        rootDirectoryReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onRootDirectoryChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="other-worker"
        vault={{
          appId: fakeAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "/",
        }}
        workers={[
          makeCloudflareDialogWorker({
            workerName: "other-worker",
            workerTag: "worker-tag-2",
            discovery: {
              classification: "blocked",
              evidence: {
                state: "different_repo",
                repoId: "999",
                repoName: "ada/other",
                triggerName: "Production Deploy",
              },
            },
          }),
        ]}
      />,
    );

    expect(markup).toContain("Different repo: Builds repo ada/other (999)");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Connect Worker<\/button>/);
  });
});

describe("buildVaultDashboardResourceRailState", () => {
  it("puts the add-app action on the GitHub row", () => {
    const addApp = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddAppHref: () => "/vault/ada/demo?add-app",
      addAppOnClick: addApp,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({}),
    });

    expect(state.githubRow).toMatchObject({
      provider: "github",
      status: "ready",
      actions: [
        {
          kind: "add",
          label: "?add-app",
          ariaLabel: "Add app",
          href: "/vault/ada/demo?add-app",
        },
      ],
    });
    if (state.githubRow.status !== "ready" || !state.githubRow.actions) {
      throw new Error("Expected GitHub add-app action.");
    }
    state.githubRow.actions[0].onClick?.();
    expect(addApp).toHaveBeenCalledOnce();
    expect(state.apps).toEqual([]);
  });

  it("keeps vault-level provisioning status out of app resource rows", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "running",
          provider: "convex",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_convex",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "pending",
      value: "demo",
    });
    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("ensure Convex");
    expect(markup).not.toContain("Convex: Convex");
    expect(markup).not.toContain("Create Worker");
  });

  it("keeps manual connection progress in the vault-level setup surface", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        isSamebaseManaged: false,
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "attach_worker",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "pending",
      value: "demo",
    });
    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare");
    expect(markup).not.toContain("Connect Cloudflare");
  });

  it("does not attribute failed manual Cloudflare setup to an app row", () => {
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "attach_worker",
          message: "Cloudflare Worker connection failed.",
          updatedAt: 30,
          nextAction: "connect_cloudflare_worker",
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("?add-cloudflare");
  });

  it("keeps failed managed Cloudflare setup in the vault-level setup surface", () => {
    const retryInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      githubRepositoryUrl: "https://github.com/ada/demo",
      retryInfrastructureOnClick: retryInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_worker",
          message: "Cloudflare Workers and Pages GitHub App is not authorized.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });
    expect(retryInfrastructure).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("Retry");
    expect(markup).not.toContain("?add-cloudflare");
  });

  it("keeps failed managed Convex setup in the vault-level setup surface", () => {
    const retryInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      retryInfrastructureOnClick: retryInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "failed",
          provider: "convex",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_convex",
          message: "Convex setup failed.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
        },
      }),
    });

    const convexRow = getResourceRailAppRow(state, "/", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "pending",
      value: "demo",
    });
    expect(retryInfrastructure).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("Retry");
    expect(markup).not.toContain("?add-convex");
  });

  it("does not duplicate vault-level retry state on an app row", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      isRetryingInfrastructure: true,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "attach_worker",
          message: "Cloudflare setup failed.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("Retrying...");
  });

  it("does not attribute failed manual Convex setup to an app row", () => {
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        providerSetup: {
          status: "failed",
          provider: "convex",
          source: "manual",
          runId: fakeRunId(),
          step: "attach_convex",
          message: "Convex deployment connection failed.",
          updatedAt: 30,
          nextAction: "connect_convex_deployment",
        },
      }),
    });

    const convexRow = getResourceRailAppRow(state, "/", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("?add-convex");
  });

  it("lets missing-upstream manual Convex deployments reopen the deployment dialog", () => {
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      addConvexOnClick: addConvex,
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          makeResourceRailConvexDeployment({
            upstream: {
              state: "missing_upstream",
              nextAction: "connect_convex_deployment",
            },
          }),
        ],
      }),
    });

    const convexRow = getResourceRailAppRow(state, "/", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "failed",
      value: "demo-project",
      actions: [
        {
          kind: "add",
          label: "?add-convex",
          disabled: false,
          href: "/vault/ada/demo?add-convex",
        },
      ],
    });
    if (convexRow.status !== "failed") {
      throw new Error("Expected failed Convex row.");
    }
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith({ appId: fakeAppId(), rootDirectory: "/" });
  });

  it("lets missing-upstream manual Cloudflare Workers reopen the Worker dialog", () => {
    const addCloudflareWorker = vi.fn();
    const connectCloudflareGithubRepo = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      addCloudflareWorkerOnClick: addCloudflareWorker,
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      connectCloudflareGithubRepoOnClick: connectCloudflareGithubRepo,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
            upstream: {
              state: "missing_upstream",
              nextAction: "connect_cloudflare_worker",
            },
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "failed",
      value: "demo-worker",
      actions: [
        {
          kind: "add",
          label: "?add-cloudflare",
          disabled: false,
          href: "/vault/ada/demo?add-cloudflare",
        },
      ],
    });
    if (cloudflareRow.status !== "failed") {
      throw new Error("Expected failed Cloudflare row.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(addCloudflareWorker).toHaveBeenCalledWith({ appId: fakeAppId(), rootDirectory: "/" });
    expect(connectCloudflareGithubRepo).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("?add-cloudflare");
    expect(markup).not.toContain("Connect GitHub repo");
  });

  it("lets missing-upstream managed Cloudflare Workers retry infrastructure", () => {
    const retryInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      retryInfrastructureOnClick: retryInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            upstream: {
              state: "missing_upstream",
              nextAction: "retry_infrastructure_provisioning",
            },
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "failed",
      value: "demo-worker",
      actions: [{ kind: "retry", label: "Retry", disabled: false }],
    });
    if (cloudflareRow.status !== "failed") {
      throw new Error("Expected failed Cloudflare row.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(retryInfrastructure).toHaveBeenCalledOnce();
  });

  it("shows missing provider actions after setup is idle", () => {
    const addCloudflareWorker = vi.fn();
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      addCloudflareWorkerOnClick: addCloudflareWorker,
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        { kind: "add", label: "?add-convex", disabled: false, href: "/vault/ada/demo?add-convex" },
      ],
    });
    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "action_required",
      actions: [
        {
          kind: "add",
          label: "?add-cloudflare",
          disabled: false,
          href: "/vault/ada/demo?add-cloudflare",
        },
      ],
    });

    const convexRow = getResourceRailAppRow(state, "/", "convex");
    if (convexRow.status !== "action_required") {
      throw new Error("Expected Convex action row.");
    }
    expect(convexRow.actions).toHaveLength(1);
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith({ appId: fakeAppId(), rootDirectory: "/" });
    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    if (cloudflareRow.status !== "action_required") {
      throw new Error("Expected Cloudflare action row.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(addCloudflareWorker).toHaveBeenCalledWith({ appId: fakeAppId(), rootDirectory: "/" });
  });

  it("keeps vault-level Convex wiring progress separate from the Worker row", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "ada-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
        workerDeploymentDependencies: [
          makeResourceRailWorkerDeploymentDependency({
            wiring: { state: "not_wired", nextAction: "wire_convex_build_access" },
          }),
        ],
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "wire_convex_build_access",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
    });
    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
      description: "Deploys Convex ada-team/demo-project from /.",
    });
  });

  it("qualifies provider resource names when the provider exposes a scope", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "ada-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
            projectSettingsDashboardUrl:
              "https://dashboard.convex.dev/t/ada-team/demo-project/settings",
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
            projectDashboardUrl:
              "https://dash.cloudflare.com/?to=/account/workers/services/view/demo-worker/production/deployments",
          }),
        ],
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      scope: "ada-team",
      value: "demo-project",
    });
    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      scope: "ada",
      value: "demo-worker",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Open Convex: ada-team/demo-project");
    expect(markup).toContain("Open Cloudflare: ada/demo-worker");
  });

  it("shows a Cloudflare action when the worker is not connected to the GitHub repo", () => {
    const connectCloudflareGithubRepo = vi.fn();
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      connectCloudflareGithubRepoOnClick: connectCloudflareGithubRepo,
      githubRepositoryUrl: "https://github.com/ada/demo",
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      description: "Cloudflare is not connected to this GitHub repository.",
      actions: [
        { kind: "connect", label: "Connect GitHub repo", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with GitHub connection action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(connectCloudflareGithubRepo).toHaveBeenCalledWith(fakeCloudflareWorkerId());
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare is not connected to this GitHub repository.");
    expect(markup).toContain("Connect GitHub repo");
    expect(markup).toContain("Verify infrastructure");
  });

  it("shows a Cloudflare action when Convex deploy keys are missing", () => {
    const setCloudflareConvexDeployKeys = vi.fn();
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      setCloudflareConvexDeployKeysOnClick: setCloudflareConvexDeployKeys,
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "demo-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
        workerDeploymentDependencies: [
          makeResourceRailWorkerDeploymentDependency({
            wiring: { state: "not_wired", nextAction: "wire_convex_build_access" },
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      description:
        "Cloudflare does not have this Convex deployment's deploy keys. Deploys Convex demo-team/demo-project from /.",
      actions: [
        { kind: "set", label: "Set Convex deploy keys", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with Convex deploy-key action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(setCloudflareConvexDeployKeys).toHaveBeenCalledWith({
      workerId: fakeCloudflareWorkerId(),
      convexDeploymentId: fakeConvexDeploymentId(),
    });
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare does not have this Convex deployment&#x27;s deploy keys.");
    expect(markup).toContain("Set Convex deploy keys");
    expect(markup).toContain("Verify infrastructure");
  });

  it("shows a Cloudflare verification action for an attached Worker", () => {
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "connected" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      actions: [{ kind: "verify", label: "Verify infrastructure", disabled: false }],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with verification action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Verify infrastructure");
  });

  it("offers an explicit Convex deployment choice for a connected Worker", () => {
    const deployCloudflareConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      deployCloudflareConvexOnClick: deployCloudflareConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [
          { appId: fakeAppId(), rootDirectory: "apps/web" },
          { appId: fakeSecondAppId(), rootDirectory: "packages/backend" },
        ],
        convexDeployments: [makeResourceRailConvexDeployment({ appId: fakeSecondAppId() })],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "connected" },
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "apps/web", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      actions: [{ kind: "connect", label: "Deploy Convex", disabled: false }],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with Convex deployment action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(deployCloudflareConvex).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Deploy Convex");
    expect(markup).toContain("packages/backend");
    expect(markup).toContain("demo-team");
    expect(markup).toContain("demo-project");
  });

  it("keeps the Cloudflare Worker row repairable after Convex build access fails before Builds are connected", () => {
    const connectCloudflareGithubRepo = vi.fn();
    const setCloudflareConvexDeployKeys = vi.fn();
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      connectCloudflareGithubRepoOnClick: connectCloudflareGithubRepo,
      githubRepositoryUrl: "https://github.com/ada/demo",
      setCloudflareConvexDeployKeysOnClick: setCloudflareConvexDeployKeys,
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "demo-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
        workerDeploymentDependencies: [
          makeResourceRailWorkerDeploymentDependency({
            wiring: { state: "not_wired", nextAction: "wire_convex_build_access" },
          }),
        ],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "wire_convex_build_access",
          message:
            "Cannot connect Cloudflare Worker worker-tag to ada/demo: Cloudflare did not return the existing production Workers Builds trigger. Retry Workers Builds wiring or choose another Worker.",
          updatedAt: 30,
          nextAction: "wire_convex_build_access",
        },
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
    });
    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
      description:
        "Cloudflare's saved Workers Builds trigger is missing. Deploys Convex demo-team/demo-project from /.",
      actions: [
        { kind: "connect", label: "Connect GitHub repo", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with GitHub connection action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(connectCloudflareGithubRepo).toHaveBeenCalledWith(fakeCloudflareWorkerId());
    expect(setCloudflareConvexDeployKeys).not.toHaveBeenCalled();
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare&#x27;s saved Workers Builds trigger is missing.");
    expect(markup).toContain("Connect GitHub repo");
    expect(markup).toContain("Verify infrastructure");
    expect(markup).not.toContain("?add-convex");
  });

  it("offers Convex deploy-key repair when stale Builds-trigger failure remains after Builds connect", () => {
    const connectCloudflareGithubRepo = vi.fn();
    const setCloudflareConvexDeployKeys = vi.fn();
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      connectCloudflareGithubRepoOnClick: connectCloudflareGithubRepo,
      githubRepositoryUrl: "https://github.com/ada/demo",
      setCloudflareConvexDeployKeysOnClick: setCloudflareConvexDeployKeys,
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "demo-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
        workerDeploymentDependencies: [
          makeResourceRailWorkerDeploymentDependency({
            wiring: { state: "not_wired", nextAction: "wire_convex_build_access" },
          }),
        ],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "wire_convex_build_access",
          message:
            "Cannot connect Cloudflare Worker worker-tag to ada/demo: Cloudflare did not return the existing production Workers Builds trigger. Retry Workers Builds wiring or choose another Worker.",
          updatedAt: 30,
          nextAction: "wire_convex_build_access",
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
      description:
        "Cloudflare does not have this Convex deployment's deploy keys. Deploys Convex demo-team/demo-project from /.",
      actions: [
        { kind: "set", label: "Set Convex deploy keys", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with Convex deploy-key action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(connectCloudflareGithubRepo).not.toHaveBeenCalled();
    expect(setCloudflareConvexDeployKeys).toHaveBeenCalledWith({
      workerId: fakeCloudflareWorkerId(),
      convexDeploymentId: fakeConvexDeploymentId(),
    });
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(fakeCloudflareWorkerId());

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare does not have this Convex deployment&#x27;s deploy keys.");
    expect(markup).toContain("Set Convex deploy keys");
    expect(markup).toContain("Verify infrastructure");
    expect(markup).not.toContain("Connect GitHub repo");
  });

  it("keeps an existing Worker and offers adding another Worker to the same app", () => {
    const addCloudflareWorker = vi.fn();
    const buildAddCloudflareWorkerHref = vi.fn((app: ResourceRailBuilderVault["apps"][number]) =>
      app.rootDirectory === "/"
        ? "/vault/ada/demo?add-cloudflare"
        : `/vault/ada/demo?add-cloudflare&root-directory=${app.rootDirectory}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref,
      addCloudflareWorkerOnClick: addCloudflareWorker,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
    });
    const cloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    if (cloudflareRow.status !== "ready") {
      throw new Error("Expected Cloudflare ready row.");
    }
    expect(cloudflareRow.actions).toBeUndefined();
    const addWorkerRow = state.apps[0]?.rows.find(
      (row) => row.provider === "cloudflare" && row.status === "action_required",
    );
    if (addWorkerRow?.status !== "action_required") {
      throw new Error("Expected an add Worker row.");
    }
    addWorkerRow.actions[0].onClick?.();
    expect(addCloudflareWorker).toHaveBeenCalledWith({
      appId: fakeAppId(),
      rootDirectory: "/",
    });
    expect(buildAddCloudflareWorkerHref).toHaveBeenCalledWith({
      appId: fakeAppId(),
      rootDirectory: "/",
    });
  });

  it("keeps real root resources with explicit repository and folder locations", () => {
    const addCloudflareWorker = vi.fn();
    const buildAddCloudflareWorkerHref = vi.fn((app: ResourceRailBuilderVault["apps"][number]) =>
      app.rootDirectory === "/"
        ? "/vault/ada/demo?add-cloudflare"
        : `/vault/ada/demo?add-cloudflare&root-directory=${app.rootDirectory}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref,
      addCloudflareWorkerOnClick: addCloudflareWorker,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [
          { appId: fakeAppId(), rootDirectory: "/" },
          { appId: fakeSecondAppId(), rootDirectory: "apps/admin" },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
          makeResourceRailCloudflareWorker({
            appId: fakeSecondAppId(),
            workerId: fakeSecondCloudflareWorkerId(),
            workerName: "admin-worker",
            workersDevUrl: "https://admin-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const rootCloudflareRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(rootCloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
    });
    if (rootCloudflareRow.status !== "ready") {
      throw new Error("Expected root Cloudflare ready row.");
    }
    expect(rootCloudflareRow.actions).toBeUndefined();
    expect(getResourceRailAppRow(state, "apps/admin", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "admin-worker",
    });
    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "action_required",
    });
    expect(buildAddCloudflareWorkerHref).toHaveBeenCalledWith({
      appId: fakeAppId(),
      rootDirectory: "/",
    });
    expect(buildAddCloudflareWorkerHref).toHaveBeenCalledWith({
      appId: fakeSecondAppId(),
      rootDirectory: "apps/admin",
    });
  });

  it("uses the Convex deployment row as the ready resource", () => {
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        convexDeployments: [
          {
            appId: fakeAppId(),
            convexDeploymentId: fakeConvexDeploymentId(),
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "demo-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            upstream: { state: "present" },
          },
        ],
      }),
    });

    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
      scope: "demo-team",
    });
    const convexRow = getResourceRailAppRow(state, "/", "convex");
    if (convexRow.status !== "ready") {
      throw new Error("Expected Convex ready row.");
    }
    expect(convexRow.actions).toBeUndefined();
    expect(addConvex).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("demo-project");
    expect(markup).toContain("demo-team/");
  });

  it("scopes missing provider add actions to their root directory", () => {
    const addConvex = vi.fn();
    const buildAddConvexHref = vi.fn((app: ResourceRailBuilderVault["apps"][number]) =>
      app.rootDirectory === "/"
        ? "/vault/ada/demo?add-convex"
        : `/vault/ada/demo?add-convex&root-directory=${app.rootDirectory}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref,
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "apps/samebase" }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appId: fakeAppId(),
            workerName: "samebase-worker",
            workersDevUrl: "https://samebase-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const convexRow = getResourceRailAppRow(state, "apps/samebase", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        {
          kind: "add",
          label: "?add-convex",
          href: "/vault/ada/demo?add-convex&root-directory=apps/samebase",
        },
      ],
    });
    if (convexRow.status !== "action_required") {
      throw new Error("Expected root-directory Convex add row.");
    }
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith({
      appId: fakeAppId(),
      rootDirectory: "apps/samebase",
    });
    expect(buildAddConvexHref).toHaveBeenCalledWith({
      appId: fakeAppId(),
      rootDirectory: "apps/samebase",
    });
    expect(state.apps.map((app) => app.rootDirectory)).toEqual(["apps/samebase"]);
  });

  it("preserves empty apps, multiple Workers, and one shared Convex resource", () => {
    const setCloudflareConvexDeployKeys = vi.fn();
    const vault = makeResourceRailBuilderVault({
      apps: [
        { appId: fakeAppId(), rootDirectory: "apps/web" },
        { appId: fakeSecondAppId(), rootDirectory: "apps/mobile" },
        { appId: fakeThirdAppId(), rootDirectory: "packages/backend" },
      ],
      cloudflareWorkers: [
        makeResourceRailCloudflareWorker({
          appId: fakeAppId(),
          workerId: fakeCloudflareWorkerId(),
          workerName: "web-worker",
          workersDevUrl: "https://web-worker.ada.workers.dev",
        }),
        makeResourceRailCloudflareWorker({
          appId: fakeAppId(),
          workerId: fakeSecondCloudflareWorkerId(),
          workerName: "web-admin-worker",
          workersDevUrl: "https://web-admin-worker.ada.workers.dev",
        }),
      ],
      convexDeployments: [
        makeResourceRailConvexDeployment({
          appId: fakeThirdAppId(),
          deploymentDashboardUrl:
            "https://dashboard.convex.dev/t/demo-team/demo-project/demo-production",
        }),
      ],
      workerDeploymentDependencies: [
        makeResourceRailWorkerDeploymentDependency({ wiring: { state: "wired" } }),
        makeResourceRailWorkerDeploymentDependency({
          dependencyId: fakeSecondWorkerDeploymentDependencyId(),
          workerId: fakeSecondCloudflareWorkerId(),
          wiring: { state: "not_wired", nextAction: "wire_convex_build_access" },
        }),
      ],
    });
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      setCloudflareConvexDeployKeysOnClick: setCloudflareConvexDeployKeys,
      vault,
    });

    expect(state.apps.map((app) => app.rootDirectory)).toEqual([
      "apps/mobile",
      "apps/web",
      "packages/backend",
    ]);
    const webApp = state.apps.find((app) => app.appId === fakeAppId());
    const mobileApp = state.apps.find((app) => app.appId === fakeSecondAppId());
    const backendApp = state.apps.find((app) => app.appId === fakeThirdAppId());
    expect(webApp?.rows.filter((row) => row.provider === "cloudflare")).toHaveLength(2);
    expect(mobileApp?.rows.map((row) => row.status)).toEqual([
      "action_required",
      "action_required",
    ]);
    expect(backendApp?.rows.filter((row) => row.provider === "convex")).toHaveLength(1);
    expect(
      state.apps
        .flatMap((app) => app.rows)
        .filter((row) => row.provider === "convex" && row.status === "ready"),
    ).toHaveLength(1);

    const unwiredWorkerRow = webApp?.rows.find(
      (row) => row.status === "ready" && row.value === "web-admin-worker",
    );
    if (unwiredWorkerRow?.status !== "ready" || !unwiredWorkerRow.actions) {
      throw new Error("Expected the second Worker to expose its dependency repair.");
    }
    unwiredWorkerRow.actions[0].onClick?.();
    expect(setCloudflareConvexDeployKeys).toHaveBeenCalledWith({
      workerId: fakeSecondCloudflareWorkerId(),
      convexDeploymentId: fakeConvexDeploymentId(),
    });

    const productionApps = buildVaultProductionApps(vault);
    expect(
      productionApps.flatMap((app) => app.links).filter((link) => link.provider === "convex"),
    ).toHaveLength(1);
  });

  it("keeps a Worker without a Convex dependency healthy", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        apps: [{ appId: fakeAppId(), rootDirectory: "/" }],
        cloudflareWorkers: [makeResourceRailCloudflareWorker({})],
      }),
    });

    const workerRow = getResourceRailAppRow(state, "/", "cloudflare");
    expect(workerRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
    });
    if (workerRow.status !== "ready") {
      throw new Error("Expected a healthy Worker row.");
    }
    expect(workerRow.actions).toBeUndefined();
    expect(workerRow.description).toBeUndefined();
  });
});
