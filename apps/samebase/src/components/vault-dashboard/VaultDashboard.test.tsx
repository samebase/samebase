import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import {
  VaultDashboardAppRootDialog,
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

function getResourceRailAppRow(
  state: ReturnType<typeof buildVaultDashboardResourceRailState>,
  appRoot: string,
  provider: "cloudflare" | "convex",
) {
  const app = state.apps.find((candidate) => candidate.appRoot === appRoot);
  if (!app) {
    throw new Error(`Expected ${appRoot} app group.`);
  }
  const row = app.rows.find((candidate) => candidate.provider === provider);
  if (!row) {
    throw new Error(`Expected ${provider} row in ${appRoot} app group.`);
  }
  return row;
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
    appRoots: [],
    cloudflareWorkers: [],
    convexDeployments: [],
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
              appRoot: ".",
              projectId: "project-1",
              projectSlug: "samebase",
              teamSlug: "samebase",
              deploymentName: "samebase-production",
              cloudUrl: "https://samebase-production.convex.cloud",
              siteUrl: "https://samebase-production.convex.site",
            },
          ]}
          schemaGraphAccessEnabled
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/vault/samebase/samebase/db/main/root"');
    expect(markup).toContain('title="Open production data for samebase-production"');
    expect(markup).toContain(">Data<");
    expect(markup).toContain('href="/vault/samebase/samebase/schema/main/root"');
    expect(markup).toContain('title="Open Convex schema for samebase-production"');
    expect(markup).toContain(">Schema<");
  });

  it("hides default branch schema tools without schema graph access", () => {
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
          convexDeployments={[
            {
              appRoot: ".",
              projectId: "project-1",
              projectSlug: "samebase",
              teamSlug: "samebase",
              deploymentName: "samebase-production",
              cloudUrl: "https://samebase-production.convex.cloud",
              siteUrl: "https://samebase-production.convex.site",
            },
          ]}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/vault/samebase/samebase/db/main/root"');
    expect(markup).toContain(">Data<");
    expect(markup).not.toContain("/schema/main/root");
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
              appRoot: ".",
              links: [
                {
                  href: "https://tmp-flow.nicuchiciuc.workers.dev",
                  label: "tmp-flow.nicuchiciuc.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app",
                },
              ],
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
              appRoot: "apps/api",
              links: [
                {
                  href: "https://api.pfp.workers.dev",
                  label: "api.pfp.workers.dev",
                  provider: "cloudflare",
                  title: "Open production app for apps/api",
                },
              ],
            },
            {
              appRoot: "apps/samebase",
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
          onOpenDeveloperToolsChange={() => {}}
          onManualRepositoryRefresh={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultBranchFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="vault-dashboard-empty-state"');
    expect(markup).not.toContain(
      "Select a vault from the left sidebar or add one from the right sidebar.",
    );
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
        step: "ensure_convex",
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
      step: "ensure_convex_preview",
      updatedAt: 0,
    } satisfies ResourceRailBuilderVault["providerSetup"];

    expect(resolveVaultProviderSetupStepProvider(providerSetup)).toBe("convex");
    expect(resolveVaultProviderSetupStatus(providerSetup)).toEqual({
      status: "running",
      label: "Convex: provisioning",
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
          step: "ensure_convex",
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
          step: "ensure_cloudflare",
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

describe("VaultDashboardAppRootDialog", () => {
  it("renders app mode as the readonly repository root", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppRootDialog
        appRoot="."
        error={null}
        isSubmitting={false}
        mode="app"
        onAppRootChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasAppRoots: false,
          hasRootAppRoot: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("Choose whether this repository is one app or a monorepo.");
    expect(markup).toContain("App");
    expect(markup).toContain("Monorepo");
    expect(markup).not.toContain('aria-label="App root"');
    expect(markup).toContain("Use as app");
    expect(markup).toContain('type="submit"');
  });

  it("renders monorepo mode with an editable app root", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppRootDialog
        appRoot="apps/domain-router"
        error={null}
        isSubmitting={false}
        mode="monorepo"
        onAppRootChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasAppRoots: false,
          hasRootAppRoot: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("<form");
    expect(markup).toContain("Add app root ada/demo");
    expect(markup).toContain("apps/domain-router");
    expect(markup).not.toContain("readOnly");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('type="submit"');
  });

  it("renders conversion copy for an existing root app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppRootDialog
        appRoot="apps/domain-router"
        error={null}
        isSubmitting={false}
        mode="monorepo"
        onAppRootChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        vault={{
          hasAppRoots: true,
          hasRootAppRoot: true,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );

    expect(markup).toContain("Add a folder app root to convert this repository to a monorepo.");
    expect(markup).toContain("Add app root ada/demo");
    expect(markup).not.toContain("App root mode");
    expect(markup).toContain("apps/domain-router");
    expect(markup).toContain("Add app root");
  });
});

describe("VaultDashboardConvexDialog", () => {
  it("hides the app root input for the repository root app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardConvexDialog
        appRoot="."
        appRootReadOnly={true}
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
        onAppRootChange={vi.fn()}
        onCreateProjectNameChange={vi.fn()}
        onProjectChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        selectedProjectId="project-1"
        vault={{
          fixedAppRoot: ".",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
      />,
    );

    expect(markup).toContain("Connect Convex ada/demo");
    expect(markup).toContain("Demo");
    expect(markup).not.toContain('placeholder="App root"');
    expect(markup).not.toContain("readOnly");
    expect(markup).toContain("Connect Project");
  });

  it("renders the app root input for monorepo app roots", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardConvexDialog
        appRoot="apps/samebase"
        appRootReadOnly={true}
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
        onAppRootChange={vi.fn()}
        onCreateProjectNameChange={vi.fn()}
        onProjectChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        selectedProjectId="project-1"
        vault={{
          fixedAppRoot: "apps/samebase",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
      />,
    );

    expect(markup).toContain("apps/samebase");
    expect(markup).toContain('aria-label="App root"');
    expect(markup).toContain('placeholder="App root"');
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

  it("hides the app root input for the repository root app", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        appRoot="."
        appRootReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onAppRootChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          fixedAppRoot: ".",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
        workers={[makeCloudflareDialogWorker({})]}
      />,
    );

    expect(markup).toContain("Connect Cloudflare ada/demo");
    expect(markup).toContain("demo-worker");
    expect(markup).not.toContain('placeholder="App root"');
    expect(markup).not.toContain("readOnly");
  });

  it("renders the app root input for monorepo app roots", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCloudflareDialog
        accounts={[
          {
            accountId: "account-1",
            accountName: "Ada Cloud",
          },
        ]}
        appRoot="apps/samebase"
        appRootReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onAppRootChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          fixedAppRoot: "apps/samebase",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
        workers={[makeCloudflareDialogWorker({})]}
      />,
    );

    expect(markup).toContain("apps/samebase");
    expect(markup).toContain('aria-label="App root"');
    expect(markup).toContain('placeholder="App root"');
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
        appRoot="."
        appRootReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onAppRootChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="demo-worker"
        vault={{
          fixedAppRoot: ".",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
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
        appRoot="apps/web"
        appRootReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onAppRootChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="admin-worker"
        vault={{
          fixedAppRoot: "apps/web",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
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
        appRoot="."
        appRootReadOnly={true}
        createWorkerName="demo-worker"
        error={null}
        isLoading={false}
        isSubmitting={false}
        mode="existing"
        onAccountChange={vi.fn()}
        onAppRootChange={vi.fn()}
        onCreateWorkerNameChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onWorkerChange={vi.fn()}
        open
        selectedAccountId="account-1"
        selectedWorkerName="other-worker"
        vault={{
          fixedAppRoot: ".",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
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
  it("puts the add-app-root action on the GitHub row", () => {
    const addAppRoot = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddAppRootHref: () => "/vault/ada/demo?add-app-root",
      addAppRootOnClick: addAppRoot,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({}),
    });

    expect(state.githubRow).toMatchObject({
      provider: "github",
      status: "ready",
      actions: [
        {
          kind: "add",
          label: "?add-app-root",
          ariaLabel: "Add app root",
          href: "/vault/ada/demo?add-app-root",
        },
      ],
    });
    if (state.githubRow.status !== "ready" || !state.githubRow.actions) {
      throw new Error("Expected GitHub add-app-root action.");
    }
    state.githubRow.actions[0].onClick?.();
    expect(addAppRoot).toHaveBeenCalledOnce();
    expect(state.apps).toEqual([]);
  });

  it("keeps future provider actions hidden while provisioning is running", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "running",
          provider: "convex",
          source: "managed",
          runId: fakeRunId(),
          step: "ensure_convex",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "running",
      value: "demo",
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toEqual({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).not.toContain("ensure Convex");
    expect(markup).not.toContain("Convex: Convex");
    expect(markup).not.toContain("Create Worker");
  });

  it("shows manual Cloudflare connection progress for existing-repository vaults", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        isSamebaseManaged: false,
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "ensure_cloudflare",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toEqual({
      provider: "convex",
      status: "pending",
      value: "demo",
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "running",
      value: "demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare");
    expect(markup).not.toContain("Connect Cloudflare");
  });

  it("lets failed manual Cloudflare setup reopen the connection dialog", () => {
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "manual",
          runId: fakeRunId(),
          step: "ensure_cloudflare",
          message: "Cloudflare Worker connection failed.",
          updatedAt: 30,
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "failed",
      value: "demo",
    });
    if (cloudflareRow.status !== "failed") {
      throw new Error("Expected failed Cloudflare row.");
    }
    const [action] = cloudflareRow.actions;
    expect(action).toMatchObject({
      kind: "add",
      label: "?add-cloudflare",
      disabled: false,
      href: "/vault/ada/demo?add-cloudflare",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("?add-cloudflare");
    expect(markup).toContain('href="/vault/ada/demo?add-cloudflare"');
  });

  it("lets failed managed Cloudflare setup retry infrastructure", () => {
    const retryInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/vault/ada/demo?add-cloudflare",
      githubRepositoryUrl: "https://github.com/ada/demo",
      retryInfrastructureOnClick: retryInfrastructure,
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "ensure_cloudflare",
          message: "Cloudflare Workers and Pages GitHub App is not authorized.",
          updatedAt: 30,
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "failed",
      value: "demo",
    });
    if (cloudflareRow.status !== "failed") {
      throw new Error("Expected failed Cloudflare row.");
    }
    const [action] = cloudflareRow.actions;
    expect(action).toMatchObject({
      kind: "retry",
      label: "Retry",
      disabled: false,
    });
    expect(action.href).toBeUndefined();
    action.onClick?.();
    expect(retryInfrastructure).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("?add-cloudflare");
  });

  it("lets failed managed Convex setup retry infrastructure", () => {
    const retryInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      retryInfrastructureOnClick: retryInfrastructure,
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "convex",
          source: "managed",
          runId: fakeRunId(),
          step: "ensure_convex",
          message: "Convex setup failed.",
          updatedAt: 30,
        },
      }),
    });

    const convexRow = getResourceRailAppRow(state, ".", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "failed",
      value: "demo",
    });
    if (convexRow.status !== "failed") {
      throw new Error("Expected failed Convex row.");
    }
    const [action] = convexRow.actions;
    expect(action).toMatchObject({
      kind: "retry",
      label: "Retry",
      disabled: false,
    });
    expect(action.href).toBeUndefined();
    action.onClick?.();
    expect(retryInfrastructure).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("?add-convex");
  });

  it("shows failed managed provider setup retry pending state", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      isRetryingInfrastructure: true,
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "ensure_cloudflare",
          message: "Cloudflare setup failed.",
          updatedAt: 30,
        },
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    if (cloudflareRow.status !== "failed") {
      throw new Error("Expected failed Cloudflare row.");
    }
    const [action] = cloudflareRow.actions;
    expect(action).toMatchObject({
      kind: "retry",
      label: "Retrying...",
      disabled: true,
    });
    expect(action.href).toBeUndefined();
    expect(action.onClick).toBeUndefined();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Retrying...");
  });

  it("lets failed manual Convex setup reopen the deployment dialog", () => {
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "convex",
          source: "manual",
          runId: fakeRunId(),
          step: "ensure_convex",
          message: "Convex deployment connection failed.",
          updatedAt: 30,
        },
      }),
    });

    const convexRow = getResourceRailAppRow(state, ".", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "failed",
      value: "demo",
    });
    if (convexRow.status !== "failed") {
      throw new Error("Expected failed Convex row.");
    }
    const [action] = convexRow.actions;
    expect(action).toMatchObject({
      kind: "add",
      label: "?add-convex",
      disabled: false,
      href: "/vault/ada/demo?add-convex",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("?add-convex");
    expect(markup).toContain('href="/vault/ada/demo?add-convex"');
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
        appRoots: [{ appRoot: "." }],
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        { kind: "add", label: "?add-convex", disabled: false, href: "/vault/ada/demo?add-convex" },
      ],
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toMatchObject({
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

    const convexRow = getResourceRailAppRow(state, ".", "convex");
    if (convexRow.status !== "action_required") {
      throw new Error("Expected Convex action row.");
    }
    expect(convexRow.actions).toHaveLength(1);
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith(".");
    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    if (cloudflareRow.status !== "action_required") {
      throw new Error("Expected Cloudflare action row.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(addCloudflareWorker).toHaveBeenCalledWith(".");
  });

  it("keeps Convex preview progress on the Convex row", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        convexDeployments: [
          {
            appRoot: ".",
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "ada-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
          },
        ],
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          source: "managed",
          runId: fakeRunId(),
          step: "ensure_convex_preview",
          updatedAt: 30,
        },
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "running",
      value: "demo-project",
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toEqual({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });
  });

  it("qualifies provider resource names when the provider exposes a scope", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        convexDeployments: [
          {
            appRoot: ".",
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "ada-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
            projectSettingsDashboardUrl:
              "https://dashboard.convex.dev/t/ada-team/demo-project/settings",
          },
        ],
        cloudflareWorkers: [
          {
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
            projectDashboardUrl:
              "https://dash.cloudflare.com/?to=/account/workers/services/view/demo-worker/production/deployments",
          },
        ],
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      scope: "ada-team",
      value: "demo-project",
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      scope: "ada",
      value: "demo-worker",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Open Convex: ada-team/demo-project");
    expect(markup).toContain("Open Cloudflare: ada/demo-worker");
  });

  it("keeps root provider rows from offering duplicate provider adds", () => {
    const addCloudflareWorker = vi.fn();
    const buildAddCloudflareWorkerHref = vi.fn((appRoot: string) =>
      appRoot === "."
        ? "/vault/ada/demo?add-cloudflare"
        : `/vault/ada/demo?add-cloudflare&app-root=${appRoot}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref,
      addCloudflareWorkerOnClick: addCloudflareWorker,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        cloudflareWorkers: [
          {
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          },
        ],
      }),
    });

    expect(getResourceRailAppRow(state, ".", "cloudflare")).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
    });
    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    if (cloudflareRow.status !== "ready") {
      throw new Error("Expected Cloudflare ready row.");
    }
    expect(cloudflareRow.actions).toBeUndefined();
    expect(addCloudflareWorker).not.toHaveBeenCalled();
    expect(buildAddCloudflareWorkerHref).not.toHaveBeenCalledWith(".");
  });

  it("keeps real root resources with explicit root and subfolder app roots", () => {
    const addCloudflareWorker = vi.fn();
    const buildAddCloudflareWorkerHref = vi.fn((appRoot: string) =>
      appRoot === "."
        ? "/vault/ada/demo?add-cloudflare"
        : `/vault/ada/demo?add-cloudflare&app-root=${appRoot}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref,
      addCloudflareWorkerOnClick: addCloudflareWorker,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }, { appRoot: "apps/admin" }],
        cloudflareWorkers: [
          {
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          },
          {
            appRoot: "apps/admin",
            workerName: "admin-worker",
            workersDevUrl: "https://admin-worker.ada.workers.dev",
          },
        ],
      }),
    });

    const rootCloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
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
    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "action_required",
    });
    expect(addCloudflareWorker).not.toHaveBeenCalled();
    expect(buildAddCloudflareWorkerHref).not.toHaveBeenCalledWith(".");
  });

  it("uses the Convex deployment row as the ready resource", () => {
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        convexDeployments: [
          {
            appRoot: ".",
            projectId: "project-1",
            projectSlug: "demo-project",
            teamSlug: "demo-team",
            deploymentName: "demo-production",
            cloudUrl: "https://demo-production.convex.cloud",
            siteUrl: "https://demo-production.convex.site",
          },
        ],
      }),
    });

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
      scope: "demo-team",
    });
    const convexRow = getResourceRailAppRow(state, ".", "convex");
    if (convexRow.status !== "ready") {
      throw new Error("Expected Convex ready row.");
    }
    expect(convexRow.actions).toBeUndefined();
    expect(addConvex).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("demo-project");
    expect(markup).toContain("demo-team/");
  });

  it("scopes missing provider add actions to their app root", () => {
    const addConvex = vi.fn();
    const buildAddConvexHref = vi.fn((appRoot: string) =>
      appRoot === "."
        ? "/vault/ada/demo?add-convex"
        : `/vault/ada/demo?add-convex&app-root=${appRoot}`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref,
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "apps/samebase" }],
        cloudflareWorkers: [
          {
            appRoot: "apps/samebase",
            workerName: "samebase-worker",
            workersDevUrl: "https://samebase-worker.ada.workers.dev",
          },
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
          href: "/vault/ada/demo?add-convex&app-root=apps/samebase",
        },
      ],
    });
    if (convexRow.status !== "action_required") {
      throw new Error("Expected app-root Convex add row.");
    }
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith("apps/samebase");
    expect(buildAddConvexHref).toHaveBeenCalledWith("apps/samebase");
    expect(state.apps.map((app) => app.appRoot)).toEqual(["apps/samebase"]);
    expect(buildAddConvexHref).not.toHaveBeenCalledWith(".");
  });
});
