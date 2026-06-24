// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { ROLE_ACCESS_GRANTS } from "../../../shared/accessModel";
import { validateRootRouteSearch } from "@/routeSearch/root";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RouteUrlEditorNext } from "@/components/RouteUrlEditor/RouteUrlEditorNext";
import { useLocation } from "@tanstack/react-router";
import { VaultDashboardView, type VaultDashboardVault } from "./VaultDashboard";
import type { VaultBranchFilters } from "./vaultDashboardBranchFilters";

const { act } = React;

const ROOT_ROUTE_SEARCH = validateRootRouteSearch({});
const TARGET_HASH = "tmp-flow";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this component test only needs stable ids.
  return value;
}

function makeVaultDashboardVault({
  repositoryFullName,
}: {
  repositoryFullName: string;
}): VaultDashboardVault {
  const [ghRepoOwner, ghRepoName] = repositoryFullName.split("/");
  if (!ghRepoOwner || !ghRepoName) {
    throw new Error("Expected owner/name repository full name.");
  }

  return {
    _creationTime: 0,
    _id: fakeVaultId(`vault-${ghRepoOwner}-${ghRepoName}`),
    appRoots: [],
    canRemoveCloudflareProvision: false,
    canRemoveConvexProvision: false,
    cloudflareWorkers: [],
    convexDeployments: [],
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "available" },
    },
    fileCount: 0,
    ghRepoName,
    ghRepoOwner,
    hasCloudflareProvision: false,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    isSamebaseManaged: true,
    providerSetup: { status: "not_applicable" },
    remoteBranches: [],
    repositoryFullName,
    sourceSetup: { status: "ready" },
    state: "ready",
  };
}

function makeVaultDashboardVaults(): VaultDashboardVault[] {
  return [
    makeVaultDashboardVault({ repositoryFullName: "samebase/samebase" }),
    makeVaultDashboardVault({ repositoryFullName: "nicu-chiciuc/tmp-flow" }),
  ];
}

function readRequiredInput(rootElement: HTMLElement, testId: string): HTMLInputElement {
  const input = rootElement.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (!input) {
    throw new Error(`Expected ${testId}.`);
  }

  return input;
}

function readRequiredHashSuggestion(rootElement: HTMLElement, hash: string): HTMLElement {
  const suggestion = [
    ...rootElement.querySelectorAll<HTMLElement>('[data-testid="route-url-editor-suggestion"]'),
  ].find((element) => element.textContent.trim() === `#${hash}`);
  if (!suggestion) {
    throw new Error(`Expected #${hash} suggestion.`);
  }

  return suggestion;
}

function readRequiredVaultCard(rootElement: HTMLElement, hash: string): Element {
  const target = rootElement.querySelector(`[data-vault-dashboard-repository-hash-id="${hash}"]`);
  if (!target) {
    throw new Error(`Expected ${hash} vault card.`);
  }

  return target;
}

function dispatchRouteAddressInputValue(input: HTMLInputElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!valueDescriptor?.set) {
    throw new Error("Expected native input value setter.");
  }

  valueDescriptor.set.call(input, value);
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function LocationHashProbe() {
  const hash = useLocation({
    select: (location) => location.hash,
  });

  return <output data-testid="route-location-hash">{hash}</output>;
}

function VaultDashboardViewHarness() {
  const locationHash = useLocation({
    select: (location) => location.hash,
  });
  const persistedVaultBranchFiltersByVaultId = new Map<string, VaultBranchFilters>();
  const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>();

  return (
    <VaultDashboardView
      developerToolsVisible={false}
      isRemovingVault={false}
      retryingDeletionRunId={null}
      retryingInfrastructureVaultId={null}
      now={0}
      viewModel={{
        vaults: makeVaultDashboardVaults(),
        stagedBranchSummariesByVaultId: new Map(),
      }}
      logoRouteSearch={ROOT_ROUTE_SEARCH}
      replaceLogoRouteSearch={() => {}}
      openDeveloperToolsByVaultId={{}}
      persistedVaultBranchFiltersByVaultId={persistedVaultBranchFiltersByVaultId}
      persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
      locationHash={locationHash}
      rootRouteSearch={ROOT_ROUTE_SEARCH}
      onOpenDeveloperToolsChange={() => {}}
      onManualRepositoryRefresh={() => {}}
      onRetryInfrastructureProvisioning={() => {}}
      onRetryVaultDeletion={() => {}}
      onSaveVaultBranchFilters={() => {}}
      onResourceLinksOpenChange={() => {}}
    />
  );
}

describe("VaultDashboardView", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;
  let scrolledElements: Element[] = [];

  beforeEach(() => {
    useQueryMock.mockReturnValue({ accessKeys: ROLE_ACCESS_GRANTS.role_staff });
    scrolledElements = [];
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value(this: Element) {
        scrolledElements.push(this);
      },
    });
  });

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
    useQueryMock.mockReset();
    window.history.replaceState(null, "", "/");
  });

  function renderDashboard(locationHash: string) {
    if (!rootElement) {
      rootElement = document.createElement("div");
      document.body.append(rootElement);
      root = createRoot(rootElement);
    }

    const persistedVaultBranchFiltersByVaultId = new Map<string, VaultBranchFilters>();
    const persistedVaultResourceLinksOpenByVaultId = new Map<string, boolean>();
    if (!root) {
      throw new Error("Expected mounted root.");
    }

    root.render(
      <TestRouterProvider initialEntries={["/home"]}>
        <VaultDashboardView
          developerToolsVisible={false}
          isRemovingVault={false}
          retryingDeletionRunId={null}
          retryingInfrastructureVaultId={null}
          now={0}
          viewModel={{
            vaults: makeVaultDashboardVaults(),
            stagedBranchSummariesByVaultId: new Map(),
          }}
          logoRouteSearch={ROOT_ROUTE_SEARCH}
          replaceLogoRouteSearch={() => {}}
          openDeveloperToolsByVaultId={{}}
          persistedVaultBranchFiltersByVaultId={persistedVaultBranchFiltersByVaultId}
          persistedVaultResourceLinksOpenByVaultId={persistedVaultResourceLinksOpenByVaultId}
          locationHash={locationHash}
          rootRouteSearch={ROOT_ROUTE_SEARCH}
          onOpenDeveloperToolsChange={() => {}}
          onManualRepositoryRefresh={() => {}}
          onRetryInfrastructureProvisioning={() => {}}
          onRetryVaultDeletion={() => {}}
          onSaveVaultBranchFilters={() => {}}
          onResourceLinksOpenChange={() => {}}
        />
      </TestRouterProvider>,
    );
  }

  it("scrolls to a vault card after the router hash changes", async () => {
    await act(async () => {
      renderDashboard("");
    });

    expect(scrolledElements).toEqual([]);

    await act(async () => {
      renderDashboard("tmp-flow");
    });

    if (!rootElement) {
      throw new Error("Expected mounted root element.");
    }

    const target = readRequiredVaultCard(rootElement, TARGET_HASH);
    expect(scrolledElements).toContain(target);
  });

  it("scrolls to a vault card after selecting its URL editor hash suggestion", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      if (!root) {
        throw new Error("Expected mounted root.");
      }

      root.render(
        <TestRouterProvider initialEntries={["/home"]}>
          <RouteUrlEditorNext />
          <LocationHashProbe />
          <VaultDashboardViewHarness />
        </TestRouterProvider>,
      );
      await Promise.resolve();
    });

    const display = readRequiredInput(rootElement, "route-url-editor-display");
    await act(async () => {
      display.focus();
      await Promise.resolve();
    });

    const input = readRequiredInput(rootElement, "route-url-editor-input");
    await act(async () => {
      dispatchRouteAddressInputValue(input, `${input.value}#`);
      await Promise.resolve();
    });

    const suggestion = readRequiredHashSuggestion(rootElement, TARGET_HASH);
    await act(async () => {
      suggestion.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(rootElement.querySelector('[data-testid="route-location-hash"]')?.textContent).toBe(
      TARGET_HASH,
    );
    expect(scrolledElements).toContain(readRequiredVaultCard(rootElement, TARGET_HASH));
  });
});
