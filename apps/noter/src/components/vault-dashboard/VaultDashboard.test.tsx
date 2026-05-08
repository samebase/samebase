import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { ProvisioningLogEvent } from "@/lib/provisioningLog";
import {
  VaultBranchLinkContent,
  VaultInfrastructureSetupSection,
} from "./VaultDashboard";
import { resolveVaultInfrastructureSetupStatus } from "./vaultInfrastructureSetup";
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

describe("formatVaultSourceSetupStep", () => {
  it("uses dashboard labels for create-app setup steps", () => {
    expect(formatVaultSourceSetupStep("seed_starter")).toBe("seed starter");
    expect(formatVaultSourceSetupStep("sync_tree")).toBe("sync tree");
  });
});

describe("resolveVaultInfrastructureSetupStatus", () => {
  it("keeps infra setup states as progress, not manual actions", () => {
    expect(resolveVaultInfrastructureSetupStatus("not_started")).toEqual({
      status: "running",
      label: "Infra: preparing",
    });
    expect(resolveVaultInfrastructureSetupStatus("provisioning")).toEqual({
      status: "running",
      label: "Infra: provisioning",
    });
    expect(resolveVaultInfrastructureSetupStatus("ready")).toBeNull();
  });
});

describe("VaultInfrastructureSetupSection", () => {
  it("renders infra progress with the provisioning log", () => {
    provisioningLogMock.events = [
      {
        createdAt: Date.parse("2026-05-08T09:15:00Z"),
        level: "info",
        message: "Ensuring Convex project and production deployment.",
        step: "ensure_convex",
      },
    ];

    const markup = renderToStaticMarkup(
      <VaultInfrastructureSetupSection
        infraState="provisioning"
        repositoryFullName="noter-md/noter-app"
        vaultId={fakeVaultId()}
      />,
    );

    expect(markup).toContain("Infra: provisioning");
    expect(markup).toContain("Ensuring Convex project");
    expect(markup).not.toContain("Provision infra");
    expect(markup).not.toContain("Retry infra");
  });
});
