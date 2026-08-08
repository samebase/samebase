// @vitest-environment jsdom

import { useLocation } from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultRouteIdentityBoundary } from "./VaultRouteIdentityBoundary";

type TestVault = Pick<UserVaultResult, "_id" | "ghRepoName" | "ghRepoOwner" | "repositoryFullName">;

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs a stable route identity.
  return value;
}

function testVault(args: { id: string; owner: string; repoName: string }): TestVault {
  return {
    _id: fakeVaultId(args.id),
    ghRepoName: args.repoName,
    ghRepoOwner: args.owner,
    repositoryFullName: `${args.owner}/${args.repoName}`,
  };
}

const testState = vi.hoisted<{
  vaults: TestVault[] | undefined;
}>(() => ({ vaults: undefined }));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useQuery: () => testState.vaults,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-href={location.href} data-testid="router-location" />;
}

function BoundaryTree({ owner, repoName }: { owner: string; repoName: string }) {
  return (
    <VaultRouteIdentityBoundary owner={owner} repoName={repoName}>
      {(identity) => (
        <output
          data-active-vault-id={
            identity.state === "selected" ? identity.vaultId : identity.activeVaultId
          }
          data-repository={identity.state === "selected" ? identity.repositoryFullName : undefined}
          data-state={identity.state}
          data-testid="route-identity"
        />
      )}
    </VaultRouteIdentityBoundary>
  );
}

describe("VaultRouteIdentityBoundary", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    testState.vaults = undefined;
  });

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => mountedRoot.unmount());
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderBoundary(initialEntry: string, owner: string, repoName: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <BoundaryTree owner={owner} repoName={repoName} />
          <LocationProbe />
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });
  }

  async function rerenderBoundary(owner: string, repoName: string) {
    if (!root) {
      throw new Error("Vault route identity test root is not mounted.");
    }
    await act(async () => {
      root?.render(
        <TestRouterProvider>
          <BoundaryTree owner={owner} repoName={repoName} />
          <LocationProbe />
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });
  }

  function readLocationHref() {
    return (
      rootElement?.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? ""
    );
  }

  function readIdentity() {
    return rootElement?.querySelector('[data-testid="route-identity"]');
  }

  it("replaces only the repository segments on an encoded file route", async () => {
    const vault = testVault({
      id: "vault-stable",
      owner: "before-owner",
      repoName: "before-repo",
    });
    testState.vaults = [vault];
    await renderBoundary(
      "/vault/before-owner/before-repo/fs/feature%2Fone/src/file%20name.ts?dev#activity",
      "before-owner",
      "before-repo",
    );

    testState.vaults = [
      {
        ...vault,
        ghRepoName: "after-repo",
        ghRepoOwner: "after-owner",
        repositoryFullName: "after-owner/after-repo",
      },
    ];
    await rerenderBoundary("before-owner", "before-repo");

    expect(readIdentity()?.getAttribute("data-active-vault-id")).toBe("vault-stable");
    expect(readIdentity()?.getAttribute("data-repository")).toBe("after-owner/after-repo");
    expect(readLocationHref()).toBe(
      "/vault/after-owner/after-repo/fs/feature%2Fone/src/file%20name.ts?dev#activity",
    );
  });

  it("does not select another vault that reuses the active route", async () => {
    const activeVault = testVault({
      id: "vault-active",
      owner: "before-owner",
      repoName: "before-repo",
    });
    testState.vaults = [activeVault];
    await renderBoundary(
      "/vault/before-owner/before-repo/settings?dev",
      "before-owner",
      "before-repo",
    );

    testState.vaults = [
      testVault({ id: "vault-replacement", owner: "before-owner", repoName: "before-repo" }),
      {
        ...activeVault,
        ghRepoName: "after-repo",
        ghRepoOwner: "after-owner",
        repositoryFullName: "after-owner/after-repo",
      },
    ];
    await rerenderBoundary("before-owner", "before-repo");

    expect(readIdentity()?.getAttribute("data-active-vault-id")).toBe("vault-active");
    expect(readIdentity()?.getAttribute("data-repository")).toBe("after-owner/after-repo");
    expect(readLocationHref()).toBe("/vault/after-owner/after-repo/settings?dev");
  });

  it("does not select a reused route after access to the active vault is lost", async () => {
    testState.vaults = [
      testVault({ id: "vault-active", owner: "before-owner", repoName: "before-repo" }),
    ];
    await renderBoundary("/vault/before-owner/before-repo?dev", "before-owner", "before-repo");

    testState.vaults = [
      testVault({ id: "vault-replacement", owner: "before-owner", repoName: "before-repo" }),
    ];
    await rerenderBoundary("before-owner", "before-repo");

    expect(readIdentity()?.getAttribute("data-state")).toBe("missing");
    expect(readIdentity()?.getAttribute("data-active-vault-id")).toBe("vault-active");
    expect(readLocationHref()).toBe("/vault/before-owner/before-repo?dev");
  });

  it("does not resolve an old route on a new load", async () => {
    testState.vaults = [
      testVault({ id: "vault-stable", owner: "after-owner", repoName: "after-repo" }),
    ];

    await renderBoundary("/vault/before-owner/before-repo?dev", "before-owner", "before-repo");

    expect(readIdentity()?.getAttribute("data-state")).toBe("missing");
    expect(readIdentity()?.hasAttribute("data-active-vault-id")).toBe(false);
    expect(readLocationHref()).toBe("/vault/before-owner/before-repo?dev");
  });
});
