import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "#src/test/TestRouterProvider.tsx";
import type { ProvisioningLogEvent } from "#src/lib/provisioningLog.ts";
import {
  VaultBranchLinkContent,
  VaultProviderSetupSection,
} from "./VaultDashboard";
import { VaultDashboardRepositoryCard } from "./VaultDashboardChrome";
import { resolveVaultProviderSetupStatus } from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";

const provisioningLogMock = vi.hoisted(
  (): { events: ProvisioningLogEvent[] } => ({
    events: [],
  }),
);

vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: () => provisioningLogMock.events,
}));

beforeEach(() => {
  provisioningLogMock.events = [];
});

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
});

describe("VaultDashboardRepositoryCard", () => {
  it("keeps the repository title passive when no title href is provided", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardRepositoryCard
        isReady={false}
        repositoryOwner="noter-md"
        repositoryName="noter"
        titleSuffix={
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            (deleting...)
          </span>
        }
      />,
    );

    expect(markup).toContain("noter-md/");
    expect(markup).toContain("noter");
    expect(markup).toContain("(deleting...)");
    expect(markup).not.toContain("<a");
  });
});

describe("formatVaultSourceSetupStep", () => {
  it("uses dashboard labels for create-app setup steps", () => {
    expect(formatVaultSourceSetupStep("connect_github")).toBe("connect GitHub");
    expect(formatVaultSourceSetupStep("fetch_github_repo")).toBe(
      "fetch GitHub repo",
    );
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
});

describe("VaultProviderSetupSection", () => {
  it("renders provider progress with the provisioning log", () => {
    provisioningLogMock.events = [
      {
        createdAt: Date.parse("2026-05-08T09:15:00Z"),
        level: "info",
        message: "Ensuring Convex project and production deployment.",
        step: "ensure_convex",
      },
    ];

    const markup = renderToStaticMarkup(
      <VaultProviderSetupSection
        providerSetup={{
          status: "running",
          provider: "convex",
          runId: fakeRunId(),
          step: "ensure_convex",
          updatedAt: 0,
        }}
        repositoryFullName="noter-md/noter-app"
        vaultId={fakeVaultId()}
      />,
    );

    expect(markup).toContain("Convex: provisioning");
    expect(markup).toContain("Ensuring Convex project");
    expect(markup).not.toContain("Provision infra");
    expect(markup).not.toContain("Retry infra");
  });
});
