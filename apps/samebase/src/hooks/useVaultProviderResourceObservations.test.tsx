// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useVaultProviderResourceObservations } from "./useVaultProviderResourceObservations";

const mocks = vi.hoisted(() => ({
  observeVaultProviderResources: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.observeVaultProviderResources,
}));

type VaultDashboardVault = NonNullable<
  (typeof api.vault.dashboard.getUserVaults)["_returnType"]
>[number];

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeRunId(suffix: string): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs stable run ids.
  return `kx7f8f6d9v7x5w4m3n2p1q0r1s${suffix}`;
}

function makeVault(overrides: Partial<VaultDashboardVault> = {}): VaultDashboardVault {
  const vault: VaultDashboardVault = {
    _id: fakeVaultId(),
    _creationTime: 0,
    ghRepoOwner: "ada",
    ghRepoName: "demo",
    repositoryFullName: "ada/demo",
    fileCount: 0,
    state: "ready",
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "available" },
    },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    hasCloudflareProvision: true,
    canRemoveConvexProvision: false,
    canRemoveCloudflareProvision: true,
    appRoots: [{ appRoot: "." }],
    convexDeployments: [],
    cloudflareWorkers: [
      {
        appRoot: ".",
        accountId: "account-1",
        workerName: "demo",
        workerTag: "worker-tag-1",
        origin: "provisioned",
        observation: { state: "not_requested" },
      },
    ],
  };
  return { ...vault, ...overrides };
}

function ObservationHarness({ vaults }: { vaults: VaultDashboardVault[] }) {
  useVaultProviderResourceObservations(vaults);
  return null;
}

function TestProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderVaults(args: {
  root: Root;
  queryClient: QueryClient;
  vaults: VaultDashboardVault[];
}): Promise<void> {
  await act(async () => {
    args.root.render(
      <TestProviders queryClient={args.queryClient}>
        <ObservationHarness vaults={args.vaults} />
      </TestProviders>,
    );
  });
}

describe("useVaultProviderResourceObservations", () => {
  let container: HTMLDivElement;
  let queryClient: QueryClient;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    queryClient = new QueryClient();
    root = createRoot(container);
    mocks.observeVaultProviderResources.mockResolvedValue({
      vaultId: fakeVaultId(),
      convexDeployments: [],
      cloudflareWorkers: [],
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    vi.clearAllMocks();
  });

  it("waits for provisioning to finish before observing provider resources", async () => {
    await renderVaults({
      root,
      queryClient,
      vaults: [
        makeVault({
          providerSetup: {
            status: "running",
            provider: "cloudflare",
            source: "managed",
            runId: fakeRunId("1111"),
            step: "wire_builds",
            updatedAt: 1,
          },
        }),
      ],
    });
    expect(mocks.observeVaultProviderResources).not.toHaveBeenCalled();

    await renderVaults({ root, queryClient, vaults: [makeVault()] });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(1);
  });

  it("refreshes a cached terminal observation after a later provisioning run", async () => {
    await renderVaults({ root, queryClient, vaults: [makeVault()] });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(1);

    await renderVaults({
      root,
      queryClient,
      vaults: [
        makeVault({
          providerSetup: {
            status: "running",
            provider: "cloudflare",
            source: "manual",
            runId: fakeRunId("2222"),
            step: "wire_convex_build_access",
            updatedAt: 2,
          },
        }),
      ],
    });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(1);

    await renderVaults({ root, queryClient, vaults: [makeVault()] });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(2);
  });

  it("observes a failed run once without refetching for message-only updates", async () => {
    const runId = fakeRunId("3333");
    await renderVaults({
      root,
      queryClient,
      vaults: [
        makeVault({
          providerSetup: {
            status: "failed",
            provider: "cloudflare",
            source: "managed",
            runId,
            step: "wire_builds",
            message: "First failure",
            updatedAt: 3,
            nextAction: "wire_builds",
          },
        }),
      ],
    });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(1);

    await renderVaults({
      root,
      queryClient,
      vaults: [
        makeVault({
          providerSetup: {
            status: "failed",
            provider: "cloudflare",
            source: "managed",
            runId,
            step: "wire_builds",
            message: "More detailed failure",
            updatedAt: 4,
            nextAction: "wire_builds",
          },
        }),
      ],
    });
    expect(mocks.observeVaultProviderResources).toHaveBeenCalledTimes(1);
  });
});
