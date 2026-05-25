import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  GitHubRepositoryNameSlashPreview,
  VaultDashboardAppRootDialog,
  VaultDashboardCloudflareDialog,
  VaultDashboardCloudflareAccountDialog,
  VaultDashboardConvexDialog,
  VaultDashboardCreateDialog,
  VaultDashboardDeleteDialog,
  VaultBranchLinkContent,
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { VaultResourceRail } from "./VaultResourceRail";
import {
  buildVaultDashboardRepositoryHashHref,
  buildVaultDashboardRepositoryHashId,
  normalizeVaultDashboardRepositoryHash,
} from "./vaultDashboardRepositoryHash";
import { buildVaultDashboardResourceRailState } from "./vaultResourceRailState";
import {
  resolveVaultProviderSetupStatus,
  resolveVaultProviderSetupStepProvider,
} from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

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
    isNoterManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    hasCloudflareProvision: false,
    canRemoveConvexProvision: false,
    canRemoveCloudflareProvision: false,
    appRoots: [],
    cloudflareWorkers: [],
    convexDeployments: [],
    remoteBranches: [],
  };
  return { ...vault, ...overrides };
}

describe("VaultBranchLinkContent", () => {
  it("links the visible branch label to the GitHub branch tree", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="noter-md/noter"
          branch={{
            name: "codex/dashboard branch-link",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
            isDefault: false,
            isProtected: false,
            lastSyncedAt: 0,
            remoteState: "active",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain(
      'href="https://github.com/noter-md/noter/tree/codex/dashboard%20branch-link"',
    );
    expect(markup).toContain('title="Open branch on GitHub"');
  });

  it("links the default branch to the production app URL", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="noter-md/noter"
          cloudflareWorkersDevUrl="https://tmp-flow.nicuchiciuc.workers.dev"
          branch={{
            name: "main",
            headCommitSha: "5bb80a8c1c1f0f6a9d78c7f9b8451f0dd9a3c123",
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
    expect(markup).toContain(">https://tmp-flow.nicuchiciuc.workers.dev<");
    expect(markup.indexOf(">https://tmp-flow.nicuchiciuc.workers.dev<")).toBeLessThan(
      markup.indexOf(">main<"),
    );
  });
});

describe("VaultDashboardRepositoryCard", () => {
  it("uses the repo name hash until the dashboard has duplicates", () => {
    expect(
      buildVaultDashboardRepositoryHashId({
        hasDuplicateRepositoryName: false,
        repositoryFullName: "nicu-chiciuc/tmp-flow",
        repositoryName: "tmp-flow",
      }),
    ).toBe("tmp-flow");
    expect(
      buildVaultDashboardRepositoryHashId({
        hasDuplicateRepositoryName: true,
        repositoryFullName: "nicu-chiciuc/tmp-flow",
        repositoryName: "tmp-flow",
      }),
    ).toBe("nicu-chiciuc/tmp-flow");
  });

  it("normalizes owner-qualified repository hashes", () => {
    expect(buildVaultDashboardRepositoryHashHref("nicu-chiciuc/tmp-flow")).toBe(
      "#nicu-chiciuc/tmp-flow",
    );
    expect(normalizeVaultDashboardRepositoryHash("#nicu-chiciuc/tmp-flow")).toBe(
      "nicu-chiciuc/tmp-flow",
    );
  });

  it("keeps the repository title passive when no title href is provided", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        isReady={false}
        repositoryOwner="noter-md"
        repositoryName="noter"
        titleSuffix={
          <span className="shrink-0 text-xs font-normal text-muted-foreground">(deleting...)</span>
        }
      />,
    );

    expect(markup).toContain("#");
    expect(markup).toContain("noter");
    expect(markup).not.toContain("noter-md/");
    expect(markup).toContain("(deleting...)");
    expect(markup).not.toContain("<a");
  });

  it("shows the owner in the title only when the repo name is ambiguous", () => {
    const simpleMarkup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        isReady={true}
        repositoryOwner="nicu-chiciuc"
        repositoryName="tmp-flow"
        titleHref="#tmp-flow"
      />,
    );
    const ownerQualifiedMarkup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        isReady={true}
        repositoryOwner="nicu-chiciuc"
        repositoryName="tmp-flow"
        titleHref="#nicu-chiciuc/tmp-flow"
        titleRepositoryOwnerVisible
      />,
    );

    expect(simpleMarkup).toContain("#");
    expect(simpleMarkup).toContain("tmp-flow");
    expect(simpleMarkup).not.toContain("nicu-chiciuc/");
    expect(ownerQualifiedMarkup).toContain("#");
    expect(ownerQualifiedMarkup).toContain("nicu-chiciuc/");
    expect(ownerQualifiedMarkup).toContain("tmp-flow");
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
        providerSetup={{
          status: "running",
          provider: "convex",
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
          isNoterManaged: false,
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
          isNoterManaged: false,
          canRemoveGithubRepo: false,
          hasConvexProvision: false,
          hasCloudflareProvision: false,
          canRemoveConvexProvision: true,
          canRemoveCloudflareProvision: false,
        }}
      />,
    );

    expect(markup).toContain("Also remove Convex project/deployment");
    expect(markup).not.toContain("Only available for infrastructure provisioned by Noter.");
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
    expect(markup).not.toContain("App root mode");
    expect(markup).toContain("apps/domain-router");
    expect(markup).toContain("Convert to monorepo");
  });
});

describe("VaultDashboardCreateDialog", () => {
  it("renders the create form in a dialog shell", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardCreateDialog
        createButtonDisabled={false}
        footerMessages={null}
        isCreating={false}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
      >
        <GitHubRepositoryNameSlashPreview rawName="field/notes" />
      </VaultDashboardCreateDialog>,
    );

    expect(markup).toContain("New App");
    expect(markup).toContain("GitHub, Convex, and Cloudflare resources.");
    expect(markup).toContain("GitHub repo name:");
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
        appRoot="apps/noter"
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
          fixedAppRoot: "apps/noter",
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
      />,
    );

    expect(markup).toContain("apps/noter");
    expect(markup).toContain('placeholder="App root"');
    expect(markup).toContain("readOnly");
    expect(markup).toContain("Connect Project");
  });
});

describe("VaultDashboardCloudflareDialog", () => {
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
        workers={[
          {
            workerName: "demo-worker",
            workerTag: "worker-tag-1",
          },
        ]}
      />,
    );

    expect(markup).toContain("Connect Cloudflare ada/demo");
    expect(markup).toContain("demo-worker");
    expect(markup).not.toContain('placeholder="App root"');
    expect(markup).not.toContain("readOnly");
  });
});

describe("buildVaultDashboardResourceRailState", () => {
  it("puts the app-root add action on the GitHub row", () => {
    const addAppRoot = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddAppRootHref: () => "/home?add-app-root#demo",
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
          href: "/home?add-app-root#demo",
        },
      ],
    });
    if (state.githubRow.status !== "ready" || !state.githubRow.actions) {
      throw new Error("Expected GitHub app-root add action.");
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
        isNoterManaged: false,
        providerSetup: {
          status: "running",
          provider: "cloudflare",
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
      buildAddCloudflareWorkerHref: () => "/home?add-cloudflare#demo",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "cloudflare",
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
      href: "/home?add-cloudflare#demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("?add-cloudflare");
    expect(markup).toContain('href="/home?add-cloudflare#demo"');
  });

  it("lets failed manual Convex setup reopen the deployment dialog", () => {
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref: () => "/home?add-convex#demo",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "." }],
        providerSetup: {
          status: "failed",
          provider: "convex",
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
      href: "/home?add-convex#demo",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("?add-convex");
    expect(markup).toContain('href="/home?add-convex#demo"');
  });

  it("shows missing provider actions after setup is idle", () => {
    const addCloudflareWorker = vi.fn();
    const addConvex = vi.fn();
    const state = buildVaultDashboardResourceRailState({
      buildAddCloudflareWorkerHref: () => "/home?add-cloudflare#demo",
      addCloudflareWorkerOnClick: addCloudflareWorker,
      buildAddConvexHref: () => "/home?add-convex#demo",
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
        { kind: "add", label: "?add-convex", disabled: false, href: "/home?add-convex#demo" },
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
          href: "/home?add-cloudflare#demo",
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
        ? "/home?add-cloudflare#demo"
        : `/home?add-cloudflare&app-root=${appRoot}#demo`,
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
        ? "/home?add-cloudflare#demo"
        : `/home?add-cloudflare&app-root=${appRoot}#demo`,
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
      buildAddConvexHref: () => "/home?add-convex#demo",
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
      appRoot === "." ? "/home?add-convex#demo" : `/home?add-convex&app-root=${appRoot}#demo`,
    );
    const state = buildVaultDashboardResourceRailState({
      buildAddConvexHref,
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        appRoots: [{ appRoot: "apps/noter" }],
        cloudflareWorkers: [
          {
            appRoot: "apps/noter",
            workerName: "noter-worker",
            workersDevUrl: "https://noter-worker.ada.workers.dev",
          },
        ],
      }),
    });

    const convexRow = getResourceRailAppRow(state, "apps/noter", "convex");
    expect(convexRow).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        {
          kind: "add",
          label: "?add-convex",
          href: "/home?add-convex&app-root=apps/noter#demo",
        },
      ],
    });
    if (convexRow.status !== "action_required") {
      throw new Error("Expected app-root Convex add row.");
    }
    convexRow.actions[0].onClick?.();
    expect(addConvex).toHaveBeenCalledWith("apps/noter");
    expect(buildAddConvexHref).toHaveBeenCalledWith("apps/noter");
    expect(state.apps.map((app) => app.appRoot)).toEqual(["apps/noter"]);
    expect(buildAddConvexHref).not.toHaveBeenCalledWith(".");
  });
});
