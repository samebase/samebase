// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { useVaultWorkspaceModel } from "./useVaultWorkspaceModel";

const testState = vi.hoisted(
  (): {
    cachedQueries: Map<string, unknown>;
    cacheQueryCalls: string[];
    liveQueries: Map<string, unknown>;
    providerVaults: unknown[];
    pullRequestArgs: unknown[];
    queryCalls: { args: unknown; name: string }[];
  } => ({
    cachedQueries: new Map(),
    cacheQueryCalls: [],
    liveQueries: new Map(),
    providerVaults: [],
    pullRequestArgs: [],
    queryCalls: [],
  }),
);

const EMPTY_FOLDER_STATE = { assignments: [], folders: [] };

vi.mock("@/lib/convexQueryCache", () => ({
  useCacheQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    testState.cacheQueryCalls.push(name);
    return testState.cachedQueries.get(name);
  },
}));

vi.mock("@/hooks/useVaultPullRequests", () => ({
  useVaultPullRequests: (args: unknown) => {
    testState.pullRequestArgs.push(args);
    return { state: "loading" };
  },
}));

vi.mock("@/hooks/useVaultSidebarSummaries", () => ({
  useVaultSidebarSummaries: () => ({ state: "loading" }),
}));

vi.mock("./useVaultProviderObservations", () => ({
  useVaultProviderObservations: (vault: unknown) => {
    testState.providerVaults.push(vault);
    return {
      cloudflare: {
        builds: { state: "loading" },
        convexBuildAccess: { state: "loading" },
        workers: { state: "loading" },
      },
      convex: { state: "loading" },
    };
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    testState.queryCalls.push({ args, name });
    return testState.liveQueries.get(name);
  },
}));

function fakeVaultId(value = "vault-lost-access"): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function fakeOrganizationId(value = "organization-lost-access"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function lostAccessVault(): UserVaultResult {
  return {
    _id: fakeVaultId(),
    canRemoveCloudflareProvision: false,
    canRemoveConvexProvision: false,
    cloudflareAccountId: "cloudflare-account",
    cloudflareWorkers: [],
    convexTeamId: "convex-team",
    convexProjects: [],
    defaultBranch: "main",
    deletion: { deleteAction: { state: "available" }, state: "not_deleting" },
    fileCount: 1,
    ghRepoName: "private",
    ghRepoOwner: "lost",
    hasCloudflareProvision: false,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    isSamebaseManaged: true,
    organizationId: fakeOrganizationId(),
    providerPlan: null,
    providerSetup: { status: "ready" },
    providerWrite: { lastWriteAt: {}, status: "idle" },
    repositoryFullName: "lost/private",
    sourceSetup: { status: "ready" },
  };
}

describe("useVaultWorkspaceModel", () => {
  beforeEach(() => {
    testState.cachedQueries.clear();
    testState.cachedQueries.set(
      getFunctionName(api.vault.folders.getVaultFolderState),
      EMPTY_FOLDER_STATE,
    );
    testState.cacheQueryCalls.length = 0;
    testState.liveQueries.clear();
    testState.liveQueries.set(
      getFunctionName(api.vault.organizationTree.getVaultOrganizationTreeSettings),
      [],
    );
    testState.providerVaults.length = 0;
    testState.pullRequestArgs.length = 0;
    testState.queryCalls.length = 0;
  });

  it("treats a cached vault as unavailable after organization access is lost", async () => {
    const vault = lostAccessVault();
    testState.cachedQueries.set(getFunctionName(api.vault.dashboard.getUserVaults), [vault]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), []);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultWorkspaceModel> | undefined;

    function Probe() {
      latest = useVaultWorkspaceModel(vault.repositoryFullName);
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest).toEqual({
        folderState: EMPTY_FOLDER_STATE,
        organizationTreeSettings: [],
        organizations: [],
        selection: { repositoryFullName: "lost/private", state: "missing" },
        sidebarSummaries: { state: "loading" },
        state: "ready",
        vaults: [],
      });
      expect(testState.providerVaults).toEqual([null]);
      expect(testState.pullRequestArgs).toEqual([{ vault: null }]);
      expect(testState.queryCalls).toContainEqual({
        args: "skip",
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("waits for live organization access before starting provider queries", async () => {
    const vault = lostAccessVault();
    const organization = {
      canCreateRepository: true,
      deletionState: "not_deleting",
      githubOwnerId: "github-owner-lost",
      githubOwnerLogin: "lost",
      githubOwnerType: "organization",
      organizationId: vault.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.vault.dashboard.getUserVaults), [vault]);
    testState.cachedQueries.set(getFunctionName(api.organizations.listForViewer), [organization]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultWorkspaceModel> | undefined;

    function Probe({ accessVersion }: { accessVersion: number }) {
      latest = useVaultWorkspaceModel(vault.repositoryFullName);
      return <span>{accessVersion}</span>;
    }

    try {
      await act(async () => root.render(<Probe accessVersion={0} />));

      expect(latest).toEqual({ state: "loading" });
      expect(testState.cacheQueryCalls).toEqual([
        getFunctionName(api.vault.dashboard.getUserVaults),
        getFunctionName(api.vault.folders.getVaultFolderState),
      ]);
      expect(testState.providerVaults).toEqual([null]);
      expect(testState.pullRequestArgs).toEqual([{ vault: null }]);
      expect(testState.queryCalls).toContainEqual({
        args: "skip",
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });

      testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [organization]);
      await act(async () => root.render(<Probe accessVersion={1} />));

      expect(latest?.state).toBe("ready");
      if (latest?.state !== "ready") {
        throw new Error("Expected the workspace model to be ready after live access resolved.");
      }
      expect(latest.selection.state).toBe("selected");
      expect(testState.providerVaults.at(-1)).toBe(vault);
      expect(testState.pullRequestArgs.at(-1)).toEqual({ vault });
      expect(testState.queryCalls).toContainEqual({
        args: { organizationId: organization.organizationId },
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("removes a deleting organization from vault data and requests a settings redirect", async () => {
    const vault = lostAccessVault();
    const organization = {
      canCreateRepository: true,
      deletionState: "deleting",
      githubOwnerId: "github-owner-lost",
      githubOwnerLogin: "lost",
      githubOwnerType: "organization",
      organizationId: vault.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.vault.dashboard.getUserVaults), [vault]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [organization]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultWorkspaceModel> | undefined;

    function Probe() {
      latest = useVaultWorkspaceModel(vault.repositoryFullName);
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest).toEqual({
        folderState: EMPTY_FOLDER_STATE,
        organizationTreeSettings: [],
        organizations: [],
        selection: { owner: "lost", state: "organization_deleting" },
        sidebarSummaries: { state: "loading" },
        state: "ready",
        vaults: [],
      });
      expect(testState.providerVaults).toEqual([null]);
      expect(testState.pullRequestArgs).toEqual([{ vault: null }]);
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("keeps all accessible organization groups in a selected vault picker", async () => {
    const selectedVault = {
      ...lostAccessVault(),
      _id: fakeVaultId("vault-samebase"),
      ghRepoName: "samebase",
      ghRepoOwner: "samebase",
      organizationId: fakeOrganizationId("organization-samebase"),
      repositoryFullName: "samebase/samebase",
    } satisfies UserVaultResult;
    const otherVault = {
      ...selectedVault,
      _id: fakeVaultId("vault-noter"),
      ghRepoName: "guestbook",
      ghRepoOwner: "noter",
      organizationId: fakeOrganizationId("organization-noter"),
      repositoryFullName: "noter/guestbook",
    } satisfies UserVaultResult;
    const staleVault = {
      ...selectedVault,
      _id: fakeVaultId("vault-stale"),
      ghRepoName: "private",
      ghRepoOwner: "lost",
      organizationId: fakeOrganizationId("organization-lost"),
      repositoryFullName: "lost/private",
    } satisfies UserVaultResult;
    const samebaseOrganization = {
      canCreateRepository: true,
      deletionState: "not_deleting",
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: selectedVault.organizationId,
      role: "owner",
    } as const;
    const noterOrganization = {
      canCreateRepository: true,
      deletionState: "not_deleting",
      githubOwnerId: "github-owner-noter",
      githubOwnerLogin: "noter",
      githubOwnerType: "organization",
      organizationId: otherVault.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.vault.dashboard.getUserVaults), [
      otherVault,
      staleVault,
      selectedVault,
    ]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [
      noterOrganization,
      samebaseOrganization,
    ]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultWorkspaceModel> | undefined;

    function Probe() {
      latest = useVaultWorkspaceModel(selectedVault.repositoryFullName);
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest?.state).toBe("ready");
      if (latest?.state !== "ready") {
        throw new Error("Expected the selected vault workspace model to be ready.");
      }
      expect(latest.organizations).toEqual([noterOrganization, samebaseOrganization]);
      expect(latest.vaults).toEqual([otherVault, selectedVault]);
      expect(latest.selection.state).toBe("selected");
      if (latest.selection.state !== "selected") {
        throw new Error("Expected the selected vault workspace.");
      }
      expect(latest.selection.workspace.vault).toBe(selectedVault);
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("keeps an organization inventory scoped and preserves its vault order", async () => {
    const firstVault = {
      ...lostAccessVault(),
      _id: fakeVaultId("vault-samebase-first"),
      ghRepoName: "first",
      ghRepoOwner: "samebase",
      organizationId: fakeOrganizationId("organization-samebase"),
      repositoryFullName: "samebase/first",
    } satisfies UserVaultResult;
    const secondVault = {
      ...firstVault,
      _id: fakeVaultId("vault-samebase-second"),
      ghRepoName: "second",
      repositoryFullName: "samebase/second",
    } satisfies UserVaultResult;
    const otherVault = {
      ...firstVault,
      _id: fakeVaultId("vault-other"),
      ghRepoName: "other",
      ghRepoOwner: "other",
      organizationId: fakeOrganizationId("organization-other"),
      repositoryFullName: "other/other",
    } satisfies UserVaultResult;
    const samebaseOrganization = {
      canCreateRepository: true,
      deletionState: "not_deleting",
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: firstVault.organizationId,
      role: "owner",
    } as const;
    const otherOrganization = {
      canCreateRepository: true,
      deletionState: "not_deleting",
      githubOwnerId: "github-owner-other",
      githubOwnerLogin: "other",
      githubOwnerType: "organization",
      organizationId: otherVault.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.vault.dashboard.getUserVaults), [
      secondVault,
      otherVault,
      firstVault,
    ]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [
      otherOrganization,
      samebaseOrganization,
    ]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useVaultWorkspaceModel> | undefined;

    function Probe() {
      latest = useVaultWorkspaceModel(undefined, "Samebase");
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest).toEqual({
        folderState: EMPTY_FOLDER_STATE,
        organizationTreeSettings: [],
        organizations: [samebaseOrganization],
        selection: { state: "root" },
        sidebarSummaries: { state: "loading" },
        state: "ready",
        vaults: [secondVault, firstVault],
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
