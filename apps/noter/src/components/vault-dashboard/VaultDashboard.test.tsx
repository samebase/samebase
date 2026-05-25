import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  GitHubRepositoryNameSlashPreview,
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

function makeResourceRailBuilderVault(
  overrides: Partial<ResourceRailBuilderVault>,
): ResourceRailBuilderVault {
  const vault: ResourceRailBuilderVault = {
    _id: fakeVaultId(),
    _creationTime: 0,
    ghRepoOwner: "ada",
    ghRepoName: "demo",
    repositoryFullName: "ada/demo",
    appRoot: ".",
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
          appRoot="."
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
          appRoot="."
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

  it("keeps non-root app roots in Noter edit links", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkContent
          repositoryFullName="noter-md/noter"
          appRoot="apps/noter"
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

    expect(markup).toContain('href="/vault/noter-md/noter/main?appRoot=apps%2Fnoter"');
    expect(markup).toContain("Edit");
  });
});

describe("VaultDashboardRepositoryCard", () => {
  it("uses the repo name hash until the dashboard has duplicates", () => {
    expect(
      buildVaultDashboardRepositoryHashId({
        hasDuplicateRepositoryName: false,
        repositoryFullName: "nicu-chiciuc/tmp-flow",
        repositoryName: "tmp-flow",
        appRoot: ".",
      }),
    ).toBe("tmp-flow");
    expect(
      buildVaultDashboardRepositoryHashId({
        hasDuplicateRepositoryName: true,
        repositoryFullName: "nicu-chiciuc/tmp-flow",
        repositoryName: "tmp-flow",
        appRoot: ".",
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
          appRoot: ".",
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
          appRoot: ".",
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
  it("renders selectable Convex projects", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardConvexDialog
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
        onCreateProjectNameChange={vi.fn()}
        onProjectChange={vi.fn()}
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        open
        selectedProjectId="project-1"
        vault={{
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
          repositoryName: "demo",
        }}
      />,
    );

    expect(markup).toContain("Connect Convex ada/demo");
    expect(markup).toContain("Demo");
    expect(markup).toContain("Connect Project");
  });
});

describe("buildVaultDashboardResourceRailState", () => {
  it("keeps future provider actions hidden while provisioning is running", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        providerSetup: {
          status: "running",
          provider: "convex",
          runId: fakeRunId(),
          step: "ensure_convex",
          updatedAt: 30,
        },
      }),
    });

    expect(state.rows[1]).toMatchObject({
      provider: "convex",
      status: "running",
      value: "demo",
    });
    expect(state.rows[2]).toEqual({
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

    expect(state.rows[1]).toEqual({
      provider: "convex",
      status: "pending",
      value: "demo",
    });
    expect(state.rows[2]).toMatchObject({
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
      addCloudflareWorkerHref: "/home?add-cloudflare#demo",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
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

    const cloudflareRow = state.rows[2];
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
      addConvexHref: "/home?add-convex#demo",
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
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

    const convexRow = state.rows[1];
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
      addCloudflareWorkerHref: "/home?add-cloudflare#demo",
      addCloudflareWorkerOnClick: addCloudflareWorker,
      addConvexHref: "/home?add-convex#demo",
      addConvexOnClick: addConvex,
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({}),
    });

    expect(state.rows[1]).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        { kind: "add", label: "?add-convex", disabled: false, href: "/home?add-convex#demo" },
      ],
    });
    expect(state.rows[2]).toMatchObject({
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

    const convexRow = state.rows[1];
    if (convexRow.status !== "action_required") {
      throw new Error("Expected Convex action row.");
    }
    expect(convexRow.actions).toHaveLength(1);
    expect(convexRow.actions[0].onClick).toBe(addConvex);
    const cloudflareRow = state.rows[2];
    if (cloudflareRow.status !== "action_required") {
      throw new Error("Expected Cloudflare action row.");
    }
    expect(cloudflareRow.actions[0].onClick).toBe(addCloudflareWorker);
  });

  it("keeps Convex preview progress on the Convex row", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        convexProjectSlug: "demo-project",
        providerSetup: {
          status: "running",
          provider: "cloudflare",
          runId: fakeRunId(),
          step: "ensure_convex_preview",
          updatedAt: 30,
        },
      }),
    });

    expect(state.rows[1]).toMatchObject({
      provider: "convex",
      status: "running",
      value: "demo-project",
    });
    expect(state.rows[2]).toEqual({
      provider: "cloudflare",
      status: "pending",
      value: "demo",
    });
  });

  it("qualifies provider resource names when the provider exposes a scope", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        convexTeamSlug: "ada-team",
        convexProjectSlug: "demo-project",
        convexProjectSettingsDashboardUrl:
          "https://dashboard.convex.dev/t/ada-team/demo-project/settings",
        cloudflareWorkerName: "demo-worker",
        cloudflareWorkersDevUrl: "https://demo-worker.ada.workers.dev",
        cloudflareProjectDashboardUrl:
          "https://dash.cloudflare.com/?to=/account/workers/services/view/demo-worker/production/deployments",
      }),
    });

    expect(state.rows[1]).toMatchObject({
      provider: "convex",
      status: "ready",
      scope: "ada-team",
      value: "demo-project",
    });
    expect(state.rows[2]).toMatchObject({
      provider: "cloudflare",
      status: "ready",
      scope: "ada",
      value: "demo-worker",
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("Open Convex: ada-team/demo-project");
    expect(markup).toContain("Open Cloudflare: ada/demo-worker");
  });

  it("keeps Convex unscoped when the team slug is unknown", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({
        convexProjectSlug: "demo-project",
      }),
    });

    expect(state.rows[1]).toEqual({
      provider: "convex",
      status: "ready",
      value: "demo-project",
      href: undefined,
      scope: undefined,
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);
    expect(markup).toContain("demo-project");
    expect(markup).not.toContain("38516/demo-project");
  });
});
