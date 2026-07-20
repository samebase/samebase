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
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { VaultDashboardCloudflareAccountDialog } from "./VaultDashboardCloudflareAccountDialog";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { readDefaultCloudflareWorkerSelection } from "./vaultDashboardCloudflareWorkerSelection";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
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

function fakeVaultAppId(value = "app-root"): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
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
    workerId: fakeCloudflareWorkerId(),
    appId: fakeVaultAppId(),
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
      classification: "recommended",
      evidence: {
        state: "matching_repo",
        repoId: "123",
        repoName: "ada/demo",
        triggerName: "production",
        rootDirectory: "/",
      },
    },
    builds: { state: "not_connected" },
    ...overrides,
  };
}

function makeAvailableResourceRailCloudflareConvexBuildAccessObservation(
  overrides: Partial<AvailableResourceRailCloudflareConvexBuildAccessObservation> & {
    workerId: Id<"vaultCloudflareWorkers">;
  },
): AvailableResourceRailCloudflareConvexBuildAccessObservation {
  return {
    state: "available",
    observedAt: 1,
    convexBuildAccess: { state: "not_configured" },
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
    workers: { state: "loaded", reload: () => {}, observations: workers },
    builds: { state: "loaded", reload: () => {}, observations: builds },
    convexBuildAccess: {
      state: "loaded",
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
    appId: fakeVaultAppId(),
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
    convexProjects: [],
  };
  return { ...vault, ...overrides };
}

describe("VaultDashboardRepositoryCard", () => {
  it("renders the onboarding empty state when the loaded vault list is empty", () => {
    const rootRouteSearch = validateRootRouteSearch({});
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault"]}>
        <VaultDashboardView
          deleteModeActive={false}
          developerToolsVisible={false}
          cloudflareObservations={makeLoadingCloudflareObservations()}
          cloudflareWorkerConfigurationActionInFlight={null}
          convexObservations={{ state: "loading" }}
          isRemovingVault={false}
          providerAttachmentRemovalInFlight={null}
          pullRequestObservation={{ state: "not_requested" }}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={0}
          viewModel={{
            vaults: [],
          }}
          logoRouteSearch={rootRouteSearch}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultPullRequestFiltersByVaultId={new Map()}
          persistedVaultResourceLinksOpenByVaultId={new Map()}
          rootRouteSearch={rootRouteSearch}
          onConfigureWorkersBuildsForGitHub={() => {}}
          onRotateConvexDeployKeysForWorkersBuilds={() => {}}
          onOpenDeveloperToolsChange={() => {}}
          onRemoveMissingCloudflareWorker={() => {}}
          onRemoveMissingConvexProject={() => {}}
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
        appRoot="/"
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
          appId: fakeVaultAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "/",
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
          appId: fakeVaultAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "apps/samebase",
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
        appRoot="/"
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
          appId: fakeVaultAppId(),
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
          appId: fakeVaultAppId(),
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
          rootDirectory: "apps/samebase",
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
        appRoot="/"
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
          appId: fakeVaultAppId(),
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
          appId: fakeVaultAppId(),
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
        appRoot="/"
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
          appId: fakeVaultAppId(),
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
  it("groups stable resources by app identity and preserves multiple Workers", () => {
    const appId = fakeVaultAppId();
    const firstWorkerId = fakeCloudflareWorkerId("worker-first");
    const secondWorkerId = fakeCloudflareWorkerId("worker-second");
    const vault = makeResourceRailBuilderVault({
      apps: [{ appId, rootDirectory: "/" }],
      cloudflareWorkers: [
        makeResourceRailCloudflareWorker({
          appId,
          workerId: firstWorkerId,
          workerName: "first-worker",
          workerTag: "first-worker-tag",
        }),
        makeResourceRailCloudflareWorker({
          appId,
          workerId: secondWorkerId,
          workerName: "second-worker",
          workerTag: "second-worker-tag",
        }),
      ],
    });

    const state = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      convexObservations: { state: "loading" },
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [
          makeAvailableResourceRailCloudflareObservation({
            workerId: firstWorkerId,
            workersDev: {
              state: "enabled",
              url: "https://first-worker.ada.workers.dev",
            },
          }),
          makeAvailableResourceRailCloudflareObservation({
            workerId: secondWorkerId,
            workersDev: { state: "disabled" },
          }),
        ],
        builds: [
          makeAvailableResourceRailCloudflareBuildsObservation({
            workerId: firstWorkerId,
            builds: {
              state: "connected",
              productionTriggerUuid: "production-trigger",
              previewTriggerUuid: "preview-trigger",
            },
          }),
          makeAvailableResourceRailCloudflareBuildsObservation({
            workerId: secondWorkerId,
            repository: {
              classification: "available",
              evidence: { state: "none" },
            },
          }),
        ],
        convexBuildAccess: [
          makeAvailableResourceRailCloudflareConvexBuildAccessObservation({
            workerId: firstWorkerId,
          }),
        ],
      }),
    });

    expect(state.apps).toHaveLength(1);
    expect(state.apps[0]).toMatchObject({
      appId,
      rootDirectory: "/",
    });
    expect(state.apps[0]?.rows).toMatchObject([
      {
        provider: "convex",
        rowId: `convex:add:${appId}`,
        status: "action_required",
      },
      {
        provider: "cloudflare",
        rowId: `cloudflare:${firstWorkerId}`,
        status: "available",
        scope: "ada",
        value: "first-worker",
      },
      {
        provider: "cloudflare",
        rowId: `cloudflare:${secondWorkerId}`,
        status: "available",
        value: "second-worker",
        description: "Preview URL disabled. Cloudflare is not connected to this GitHub repository.",
      },
    ]);
  });

  it("offers explicit vault-wide Convex key rotation without inferring by app root", () => {
    const frontendAppId = fakeVaultAppId("app-frontend");
    const backendAppId = fakeVaultAppId("app-backend");
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const rotateConvexDeployKeysForWorkersBuildsOnClick = vi.fn();
    const vault = makeResourceRailBuilderVault({
      apps: [
        { appId: frontendAppId, rootDirectory: "apps/web" },
        { appId: backendAppId, rootDirectory: "convex" },
      ],
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ appId: frontendAppId, workerId })],
      convexProjects: [makeResourceRailConvexProject({ appId: backendAppId, convexProjectId })],
    });
    const cloudflareObservations = makeLoadedCloudflareObservations({
      workers: [makeAvailableResourceRailCloudflareObservation({ workerId })],
      builds: [
        makeAvailableResourceRailCloudflareBuildsObservation({
          workerId,
          builds: {
            state: "connected",
            productionTriggerUuid: "production-trigger",
            previewTriggerUuid: "preview-trigger",
          },
        }),
      ],
      convexBuildAccess: [
        makeAvailableResourceRailCloudflareConvexBuildAccessObservation({ workerId }),
      ],
    });

    const state = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations,
      convexObservations: { state: "loading" },
      rotateConvexDeployKeysForWorkersBuildsOnClick,
    });
    const row = getResourceRailAppRow(state, "apps/web", "cloudflare");
    expect(row).toMatchObject({
      status: "available",
      description: "Convex deploy keys are not configured.",
      actions: [
        {
          kind: "configure",
          label: "Rotate Convex deploy keys for Workers Builds",
          disabled: false,
        },
      ],
    });
    if (row.status !== "available" || !row.actions) {
      throw new Error("Expected an explicit Convex build access action.");
    }
    row.actions[0].onClick?.();
    expect(rotateConvexDeployKeysForWorkersBuildsOnClick).toHaveBeenCalledWith(
      workerId,
      convexProjectId,
    );

    const pendingState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations,
      convexObservations: { state: "loading" },
      rotateConvexDeployKeysForWorkersBuildsOnClick,
      isRotatingConvexDeployKeysForWorkersBuilds: () => true,
    });
    expect(getResourceRailAppRow(pendingState, "apps/web", "cloudflare")).toMatchObject({
      actions: [{ label: "Rotating Convex deploy keys for Workers Builds...", disabled: true }],
    });
  });

  it("shows configured, external, and ambiguous Convex targets truthfully", () => {
    const appId = fakeVaultAppId();
    const workerId = fakeCloudflareWorkerId();
    const firstProjectId = fakeConvexProjectId("convex-project-first");
    const secondProjectId = fakeConvexProjectId("convex-project-second");
    const vault = makeResourceRailBuilderVault({
      apps: [{ appId, rootDirectory: "/" }],
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ appId, workerId })],
      convexProjects: [
        makeResourceRailConvexProject({
          appId,
          convexProjectId: firstProjectId,
          projectId: "alpha-project",
        }),
        makeResourceRailConvexProject({
          appId,
          convexProjectId: secondProjectId,
          projectId: "beta-project",
        }),
      ],
    });
    const buildState = (
      convexBuildAccess: AvailableResourceRailCloudflareConvexBuildAccessObservation["convexBuildAccess"],
    ) =>
      buildVaultDashboardResourceRailState({
        vault,
        githubRepositoryUrl: "https://github.com/ada/demo",
        cloudflareObservations: makeLoadedCloudflareObservations({
          workers: [makeAvailableResourceRailCloudflareObservation({ workerId })],
          builds: [
            makeAvailableResourceRailCloudflareBuildsObservation({
              workerId,
              builds: {
                state: "connected",
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
              },
            }),
          ],
          convexBuildAccess: [
            makeAvailableResourceRailCloudflareConvexBuildAccessObservation({
              workerId,
              convexBuildAccess,
            }),
          ],
        }),
        convexObservations: { state: "loading" },
        rotateConvexDeployKeysForWorkersBuildsOnClick: () => {},
      });

    expect(
      getResourceRailAppRow(
        buildState({
          state: "configured",
          convexProject: {
            state: "attached",
            convexProjectId: firstProjectId,
            teamId: "team-1",
            projectId: "alpha-project",
          },
        }),
        "/",
        "cloudflare",
      ),
    ).toMatchObject({
      description: "Convex deploy keys use alpha-project.",
      actions: undefined,
    });

    expect(
      getResourceRailAppRow(
        buildState({
          state: "configured",
          convexProject: {
            state: "external",
            teamId: "external-team",
            projectId: "external-project",
          },
        }),
        "/",
        "cloudflare",
      ),
    ).toMatchObject({
      description:
        "Convex deploy keys target external-team/external-project, which is not attached to this vault.",
      actions: [
        { label: "Rotate keys for alpha-project" },
        { label: "Rotate keys for beta-project" },
      ],
    });

    expect(
      getResourceRailAppRow(buildState({ state: "target_unknown" }), "/", "cloudflare"),
    ).toMatchObject({
      description: "Convex deploy keys exist, but their project is unknown.",
    });
  });

  it("maps loading, missing, and failed provider observations without fallbacks", () => {
    const appId = fakeVaultAppId();
    const workerId = fakeCloudflareWorkerId();
    const convexProjectId = fakeConvexProjectId();
    const vault = makeResourceRailBuilderVault({
      apps: [{ appId, rootDirectory: "/" }],
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ appId, workerId })],
      convexProjects: [makeResourceRailConvexProject({ appId, convexProjectId })],
    });

    const loadingState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations: makeLoadingCloudflareObservations(),
      convexObservations: { state: "loading" },
    });
    expect(getResourceRailAppRow(loadingState, "/", "cloudflare")).toMatchObject({
      rowId: `cloudflare:${workerId}`,
      status: "loading",
    });
    expect(getResourceRailAppRow(loadingState, "/", "convex")).toMatchObject({
      rowId: `convex:${convexProjectId}`,
      status: "loading",
    });

    const removeMissingCloudflareWorker = vi.fn();
    const removeMissingConvexProject = vi.fn();
    const observedState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      removeMissingCloudflareWorkerOnClick: removeMissingCloudflareWorker,
      removeMissingConvexProjectOnClick: removeMissingConvexProject,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [{ state: "missing", observedAt: 1, workerId }],
        builds: [],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        reload: () => {},
        observations: [
          {
            state: "missing",
            observedAt: 1,
            convexProjectId,
          },
        ],
      },
    });
    const missingCloudflareRow = getResourceRailAppRow(observedState, "/", "cloudflare");
    const missingConvexRow = getResourceRailAppRow(observedState, "/", "convex");
    expect(missingCloudflareRow).toMatchObject({
      status: "missing",
      description: "Missing from Cloudflare.",
      actions: [{ label: "Remove from Samebase" }],
    });
    expect(missingConvexRow).toMatchObject({
      status: "missing",
      description: "Missing from Convex.",
      actions: [{ label: "Remove from Samebase" }],
    });
    if (missingCloudflareRow.status !== "missing" || missingConvexRow.status !== "missing") {
      throw new Error("Expected missing provider resource rows.");
    }
    missingCloudflareRow.actions?.[0].onClick?.();
    missingConvexRow.actions?.[0].onClick?.();
    expect(removeMissingCloudflareWorker).toHaveBeenCalledWith(workerId);
    expect(removeMissingConvexProject).toHaveBeenCalledWith(convexProjectId);

    const failedState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      removeMissingCloudflareWorkerOnClick: removeMissingCloudflareWorker,
      removeMissingConvexProjectOnClick: removeMissingConvexProject,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [{ state: "failed", observedAt: 1, workerId, reason: "request_failed" }],
        builds: [],
        convexBuildAccess: [],
      }),
      convexObservations: {
        state: "loaded",
        reload: () => {},
        observations: [
          { state: "failed", observedAt: 1, convexProjectId, reason: "request_failed" },
        ],
      },
    });
    expect(getResourceRailAppRow(failedState, "/", "cloudflare")).toMatchObject({
      status: "failed",
      actions: [{ label: "Reload" }],
    });
    expect(getResourceRailAppRow(failedState, "/", "convex")).toMatchObject({
      status: "failed",
      actions: [{ label: "Reload" }],
    });
  });

  it("keeps a confirmed Worker available while later Cloudflare facts load", () => {
    const appId = fakeVaultAppId();
    const workerId = fakeCloudflareWorkerId();
    const vault = makeResourceRailBuilderVault({
      apps: [{ appId, rootDirectory: "/" }],
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ appId, workerId })],
    });
    const workers = {
      state: "loaded" as const,
      reload: () => {},
      observations: [makeAvailableResourceRailCloudflareObservation({ workerId })],
    };

    const buildsLoadingState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations: {
        workers,
        builds: { state: "loading" },
        convexBuildAccess: { state: "loading" },
      },
      convexObservations: { state: "loading" },
    });
    expect(getResourceRailAppRow(buildsLoadingState, "/", "cloudflare")).toMatchObject({
      status: "available",
      scope: "ada",
      value: "demo-worker",
      href: "https://dash.cloudflare.com/?to=/account-1/workers/services/view/demo-worker/production/settings",
      loadingDescription: "Loading Workers Builds...",
    });

    const accessLoadingState = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      cloudflareObservations: {
        workers,
        builds: {
          state: "loaded",
          reload: () => {},
          observations: [
            makeAvailableResourceRailCloudflareBuildsObservation({
              workerId,
              builds: {
                state: "connected",
                productionTriggerUuid: "production-trigger",
                previewTriggerUuid: "preview-trigger",
              },
            }),
          ],
        },
        convexBuildAccess: { state: "loading" },
      },
      convexObservations: { state: "loading" },
    });
    expect(getResourceRailAppRow(accessLoadingState, "/", "cloudflare")).toMatchObject({
      status: "available",
      scope: "ada",
      value: "demo-worker",
      loadingDescription: "Loading Convex deploy keys...",
    });
  });

  it("offers provider attachment only when that app has no matching stable resource", () => {
    const rootAppId = fakeVaultAppId("app-root");
    const nestedAppId = fakeVaultAppId("app-nested");
    const workerId = fakeCloudflareWorkerId();
    const buildAddCloudflareWorkerHref = vi.fn(
      (rootDirectory: string) =>
        `/vault/ada/demo?add-cloudflare&app-root=${encodeURIComponent(rootDirectory)}`,
    );
    const buildAddConvexHref = vi.fn(
      (rootDirectory: string) =>
        `/vault/ada/demo?add-convex&app-root=${encodeURIComponent(rootDirectory)}`,
    );
    const vault = makeResourceRailBuilderVault({
      apps: [
        { appId: rootAppId, rootDirectory: "/" },
        { appId: nestedAppId, rootDirectory: "apps/admin" },
      ],
      cloudflareWorkers: [makeResourceRailCloudflareWorker({ appId: rootAppId, workerId })],
    });

    const state = buildVaultDashboardResourceRailState({
      vault,
      githubRepositoryUrl: "https://github.com/ada/demo",
      buildAddCloudflareWorkerHref,
      buildAddConvexHref,
      cloudflareObservations: makeLoadedCloudflareObservations({
        workers: [{ state: "missing", observedAt: 1, workerId }],
        builds: [],
        convexBuildAccess: [],
      }),
      convexObservations: { state: "loading" },
    });

    expect(getResourceRailAppRow(state, "/", "cloudflare")).toMatchObject({
      rowId: `cloudflare:${workerId}`,
      status: "missing",
    });
    expect(getResourceRailAppRow(state, "/", "convex")).toMatchObject({
      rowId: `convex:add:${rootAppId}`,
      status: "action_required",
    });
    expect(getResourceRailAppRow(state, "apps/admin", "cloudflare")).toMatchObject({
      rowId: `cloudflare:add:${nestedAppId}`,
      status: "action_required",
    });
    expect(buildAddCloudflareWorkerHref).toHaveBeenCalledWith("apps/admin");
    expect(buildAddConvexHref).toHaveBeenCalledWith("/");
    expect(buildAddConvexHref).toHaveBeenCalledWith("apps/admin");
  });
});
