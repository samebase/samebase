import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CloudflareBuild,
  PullRequestHeadIdentity,
} from "../../../convex/repositoryObservations";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { GitHubRepositoryNameSlashPreview } from "@/components/NewAppPage";
import {
  VaultDashboardAppRootDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardConvexDialog,
  VaultDashboardDeleteDialog,
  VaultDashboardVaultPickerPane,
  VaultDashboardView,
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { VaultDashboardCloudflareAccountDialog } from "./VaultDashboardCloudflareAccountDialog";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { VaultResourceRail } from "./VaultResourceRail";
import { readDefaultCloudflareWorkerSelection } from "./vaultDashboardCloudflareWorkerSelection";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
import {
  resolveVaultProviderSetupStatus,
  resolveVaultProviderSetupStepProvider,
} from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";
import type {
  CurrentPullRequestPage,
  RepositoryPullRequestObservation,
} from "@/hooks/useRepositoryPullRequestObservations";

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
type ResourceRailCloudflareWorker = ResourceRailBuilderVault["cloudflareWorkers"][number];
type ResourceRailConvexDeployment = ResourceRailBuilderVault["convexDeployments"][number];

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

function makeResourceRailCloudflareWorker(
  overrides: Partial<ResourceRailCloudflareWorker>,
): ResourceRailCloudflareWorker {
  return {
    appRoot: ".",
    convexDeployKeys: { state: "not_applicable" },
    githubRepositoryConnection: { state: "connected" },
    upstream: { state: "present" },
    lastObservedAt: 0,
    workerName: "demo-worker",
    ...overrides,
  };
}

function makeResourceRailConvexDeployment(
  overrides: Partial<ResourceRailConvexDeployment>,
): ResourceRailConvexDeployment {
  return {
    appRoot: ".",
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

const NO_REPOSITORY_CHECKS = {
  state: "none",
  totalCount: 0,
  checkRunCount: 0,
  statusContextCount: 0,
  successCount: 0,
  failureCount: 0,
  runningCount: 0,
  neutralCount: 0,
  unknownCount: 0,
} as const;

function makePullRequestHead(args: {
  pullRequestNodeId: string;
  repositoryNodeId: string;
  branchName: string;
  sha: string;
}): PullRequestHeadIdentity {
  return {
    baseRepositoryNodeId: "repository-base",
    pullRequestNodeId: args.pullRequestNodeId,
    headRepositoryNodeId: args.repositoryNodeId,
    headRefName: args.branchName,
    headCommitNodeId: `commit:${args.sha}`,
    headOid: args.sha,
  };
}

function makeWorkerBuild(workerName: string, checkRunId: string): CloudflareBuild {
  return {
    state: "success",
    source: { state: "github_check_run", checkRunId },
    checkName: `Workers Builds: ${workerName}`,
    workerName,
    rootDirectory: { state: "known", value: `apps/${workerName}` },
    branch: { state: "known", name: "feature-local" },
    providerStatus: "COMPLETED",
    providerConclusion: { state: "provided", value: "SUCCESS" },
    preview: { state: "disabled" },
  };
}

function makeRepositoryObservation(): RepositoryPullRequestObservation {
  const localHead = makePullRequestHead({
    pullRequestNodeId: "pull-request-local",
    repositoryNodeId: "repository-base",
    branchName: "feature-local",
    sha: "1111111111111111111111111111111111111111",
  });
  const forkHead = makePullRequestHead({
    pullRequestNodeId: "pull-request-fork",
    repositoryNodeId: "repository-fork",
    branchName: "feature-fork",
    sha: "2222222222222222222222222222222222222222",
  });
  const pullRequests = [
    {
      nodeId: localHead.pullRequestNodeId,
      number: 12,
      title: "Connect repository observations",
      url: "https://github.com/ada/demo/pull/12",
      isDraft: false,
      isCrossRepository: false,
      additions: 20,
      deletions: 4,
      changedFiles: 3,
      updatedAt: 1_000,
      baseRefName: "main",
      headRefName: localHead.headRefName,
      headRepository: {
        state: "available",
        nodeId: "repository-base",
        nameWithOwner: "ada/demo",
        owner: "ada",
      },
      labels: [{ name: "implementation", color: "1D76DB" }],
      head: localHead,
      checks: NO_REPOSITORY_CHECKS,
    },
    {
      nodeId: forkHead.pullRequestNodeId,
      number: 11,
      title: "Contribute from a fork",
      url: "https://github.com/ada/demo/pull/11",
      isDraft: false,
      isCrossRepository: true,
      additions: 5,
      deletions: 1,
      changedFiles: 1,
      updatedAt: 900,
      baseRefName: "main",
      headRefName: forkHead.headRefName,
      headRepository: {
        state: "available",
        nodeId: "repository-fork",
        nameWithOwner: "contributor/demo",
        owner: "contributor",
      },
      labels: [],
      head: forkHead,
      checks: NO_REPOSITORY_CHECKS,
    },
  ] satisfies CurrentPullRequestPage["pullRequests"];
  const page = {
    state: "current",
    observedAt: 1_000,
    freshUntil: 61_000,
    repositoryNodeId: "repository-base",
    repositoryDatabaseId: "42",
    repositoryFullName: "ada/demo",
    defaultBranch: {
      state: "ready",
      name: "main",
      headCommitNodeId: "commit-main",
      headOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      checks: NO_REPOSITORY_CHECKS,
    },
    providerOpenPullRequestCount: 2,
    scannedPullRequestCount: 2,
    providerSequenceDrifted: false,
    pullRequests,
    continuation: { kind: "complete" },
    requestUsage: {
      requestCount: 1,
      cost: 1,
      limit: 5_000,
      remaining: 4_999,
      resetAt: 3_600_000,
    },
  } satisfies CurrentPullRequestPage;

  return {
    state: "current",
    refresh: { state: "idle" },
    observedAt: page.observedAt,
    pages: [page],
    pullRequests,
    duplicatePullRequestObserved: false,
    providerSequenceDrifted: false,
    defaultBranch: page.defaultBranch,
    providerOpenPullRequestCount: page.providerOpenPullRequestCount,
    cloudflareByPullRequestNodeId: new Map([
      [
        localHead.pullRequestNodeId,
        {
          state: "ready",
          head: localHead,
          observedAt: 1_000,
          builds: {
            first: makeWorkerBuild("alpha", "check-alpha"),
            rest: [makeWorkerBuild("beta", "check-beta")],
          },
        },
      ],
      [forkHead.pullRequestNodeId, { state: "fresh_absence", head: forkHead, observedAt: 1_000 }],
    ]),
    hasMore: false,
    scanGuardrailReached: false,
    isLoadingMore: false,
    canLoadMore: true,
    loadMoreProblem: null,
    loadMore: () => {},
  };
}

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
            repositoryObservationByVaultId: new Map(),
          }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultBranchFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          rootRouteSearch={rootRouteSearch}
          onConnectCloudflareGithubRepository={() => {}}
          onOpenDeveloperToolsChange={() => {}}
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

  it("renders only pull request identities through the production dashboard boundary", () => {
    const rootRouteSearch = validateRootRouteSearch({ dev: true });
    const vault = makeResourceRailBuilderVault({});
    const observation = makeRepositoryObservation();
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/ada/demo?dev"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          cloudflareWorkerRepairActionInFlight={null}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={1_000}
          viewModel={{
            vaults: [vault],
            repositoryObservationByVaultId: new Map([[vault._id, observation]]),
          }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultBranchFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          rootRouteSearch={rootRouteSearch}
          onConnectCloudflareGithubRepository={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultBranchFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
          onSetCloudflareConvexDeployKeys={() => {}}
          onVerifyCloudflareInfrastructure={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup.match(/data-default-branch-row=""/g)).toHaveLength(1);
    expect(markup.match(/data-pull-request-row=""/g)).toHaveLength(2);
    expect(markup).not.toContain("data-vault-dashboard-branch-row");
    expect(markup.match(/View changes/g)).toHaveLength(1);
    expect(markup).toContain("contributor/demo:feature-fork");
    expect(markup).toContain("alpha");
    expect(markup).toContain("beta");
    expect(markup).toContain("/vault/ada/demo/fs/feature-local?dev&amp;compare");
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

describe("VaultDashboardAppRootDialog", () => {
  it("renders app mode as the readonly repository root", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAppRootDialog
        appRoot="."
        error={null}
        folderSuggestions={[]}
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
        folderSuggestions={[]}
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
        folderSuggestions={[]}
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
          step: "attach_convex",
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
          step: "attach_worker",
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
          step: "attach_worker",
          message: "Cloudflare Worker connection failed.",
          updatedAt: 30,
          nextAction: "connect_cloudflare_worker",
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
          step: "attach_worker",
          message: "Cloudflare Workers and Pages GitHub App is not authorized.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
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
          step: "attach_convex",
          message: "Convex setup failed.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
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
          step: "attach_worker",
          message: "Cloudflare setup failed.",
          updatedAt: 30,
          nextAction: "retry_infrastructure_provisioning",
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
          step: "attach_convex",
          message: "Convex deployment connection failed.",
          updatedAt: 30,
          nextAction: "connect_convex_deployment",
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

  it("lets missing-upstream manual Convex deployments reopen the deployment dialog", () => {
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      addConvexOnClick: addConvex,
      buildAddConvexHref: () => "/vault/ada/demo?add-convex",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
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

    const convexRow = getResourceRailAppRow(state, ".", "convex");
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
    expect(addConvex).toHaveBeenCalledWith(".");
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
        appRoots: [{ appRoot: "." }],
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

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
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
    expect(addCloudflareWorker).toHaveBeenCalledWith(".");
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
        appRoots: [{ appRoot: "." }],
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

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
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

  it("keeps Convex build access progress on the Cloudflare row", () => {
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
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            convexDeployKeys: { state: "missing", nextAction: "wire_convex_build_access" },
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
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

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
    });
    expect(getResourceRailAppRow(state, ".", "cloudflare")).toEqual({
      provider: "cloudflare",
      status: "running",
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
            upstream: { state: "present" },
            projectSettingsDashboardUrl:
              "https://dashboard.convex.dev/t/ada-team/demo-project/settings",
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
            projectDashboardUrl:
              "https://dash.cloudflare.com/?to=/account/workers/services/view/demo-worker/production/deployments",
          }),
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

  it("shows a Cloudflare action when the worker is not connected to the GitHub repo", () => {
    const connectCloudflareGithubRepo = vi.fn();
    const verifyCloudflareInfrastructure = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      connectCloudflareGithubRepoOnClick: connectCloudflareGithubRepo,
      githubRepositoryUrl: "https://github.com/ada/demo",
      verifyCloudflareInfrastructureOnClick: verifyCloudflareInfrastructure,
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
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
    expect(connectCloudflareGithubRepo).toHaveBeenCalledWith(".");
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(".");

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
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            convexDeployKeys: { state: "missing", nextAction: "wire_convex_build_access" },
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      description: "Cloudflare does not have this Convex deployment's deploy keys.",
      actions: [
        { kind: "set", label: "Set Convex deploy keys", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with Convex deploy-key action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(setCloudflareConvexDeployKeys).toHaveBeenCalledWith(".");
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(".");

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
        appRoots: [{ appRoot: "." }],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            githubRepositoryConnection: { state: "connected" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
        ],
      }),
    });

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      actions: [{ kind: "verify", label: "Verify infrastructure", disabled: false }],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with verification action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(".");

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Verify infrastructure");
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
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            convexDeployKeys: { state: "not_applicable" },
            githubRepositoryConnection: { state: "not_connected", nextAction: "wire_builds" },
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
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

    expect(getResourceRailAppRow(state, ".", "convex")).toMatchObject({
      provider: "convex",
      status: "ready",
      value: "demo-project",
    });
    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
      description: "Cloudflare's saved Workers Builds trigger is missing.",
      actions: [
        { kind: "connect", label: "Connect GitHub repo", disabled: false },
        { kind: "verify", label: "Verify infrastructure", disabled: false },
      ],
    });
    if (cloudflareRow.status !== "ready" || !cloudflareRow.actions) {
      throw new Error("Expected Cloudflare row with GitHub connection action.");
    }
    cloudflareRow.actions[0].onClick?.();
    expect(connectCloudflareGithubRepo).toHaveBeenCalledWith(".");
    expect(setCloudflareConvexDeployKeys).not.toHaveBeenCalled();
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(".");

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
            upstream: { state: "present" },
          },
        ],
        cloudflareWorkers: [
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            convexDeployKeys: { state: "missing", nextAction: "wire_convex_build_access" },
            githubRepositoryConnection: { state: "connected" },
            lastObservedAt: 40,
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
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

    const cloudflareRow = getResourceRailAppRow(state, ".", "cloudflare");
    expect(cloudflareRow).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      value: "demo-worker",
      description: "Cloudflare does not have this Convex deployment's deploy keys.",
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
    expect(setCloudflareConvexDeployKeys).toHaveBeenCalledWith(".");
    cloudflareRow.actions[1].onClick?.();
    expect(verifyCloudflareInfrastructure).toHaveBeenCalledWith(".");

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Cloudflare does not have this Convex deployment&#x27;s deploy keys.");
    expect(markup).toContain("Set Convex deploy keys");
    expect(markup).toContain("Verify infrastructure");
    expect(markup).not.toContain("Connect GitHub repo");
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
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
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
          makeResourceRailCloudflareWorker({
            appRoot: ".",
            workerName: "demo-worker",
            workersDevUrl: "https://demo-worker.ada.workers.dev",
          }),
          makeResourceRailCloudflareWorker({
            appRoot: "apps/admin",
            workerName: "admin-worker",
            workersDevUrl: "https://admin-worker.ada.workers.dev",
          }),
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
            upstream: { state: "present" },
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
          makeResourceRailCloudflareWorker({
            appRoot: "apps/samebase",
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
