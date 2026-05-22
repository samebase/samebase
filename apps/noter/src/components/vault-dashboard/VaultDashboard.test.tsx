import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  GitHubRepositoryNameSlashPreview,
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
          cloudflareProductionUrl="https://tmp-flow.nicuchiciuc.workers.dev"
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

  it("shows missing provider actions after setup is idle", () => {
    const state = buildVaultDashboardResourceRailState({
      githubRepositoryUrl: "https://github.com/ada/demo",
      vault: makeResourceRailBuilderVault({}),
    });

    expect(state.rows[1]).toMatchObject({
      provider: "convex",
      status: "action_required",
      actions: [
        { kind: "connect_existing", disabled: true },
        { kind: "create_new", disabled: true },
      ],
    });
    expect(state.rows[2]).toMatchObject({
      provider: "cloudflare",
      status: "action_required",
      actions: [
        { kind: "connect_existing", disabled: true },
        { kind: "create_new", disabled: true },
      ],
    });
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
        cloudflareProductionUrl: "https://demo-worker.ada.workers.dev",
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
