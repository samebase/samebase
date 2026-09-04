// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { useRepositoryWorkspaceModel } from "./useRepositoryWorkspaceModel";

const testState = vi.hoisted(
  (): {
    cachedQueries: Map<string, unknown>;
    cacheQueryCalls: string[];
    liveQueries: Map<string, unknown>;
    providerRepositories: unknown[];
    pullRequestArgs: unknown[];
    queryCalls: { args: unknown; name: string }[];
  } => ({
    cachedQueries: new Map(),
    cacheQueryCalls: [],
    liveQueries: new Map(),
    providerRepositories: [],
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

vi.mock("@/repository/dashboard/useRepositoryPullRequests", () => ({
  useRepositoryPullRequests: (args: unknown) => {
    testState.pullRequestArgs.push(args);
    return { state: "loading" };
  },
}));

vi.mock("@/repository/dashboard/useRepositorySidebarSummaries", () => ({
  useRepositorySidebarSummaries: () => ({ state: "loading" }),
}));

vi.mock("./useRepositoryProviderObservations", () => ({
  useRepositoryProviderObservations: (repository: unknown) => {
    testState.providerRepositories.push(repository);
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

function fakeRepositoryId(value = "repository-lost-access"): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function fakeOrganizationId(value = "organization-lost-access"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function lostAccessRepository(): UserRepositoryResult {
  return {
    repositoryId: fakeRepositoryId(),
    canRemoveCloudflareProvision: false,
    canRemoveConvexProvision: false,
    cloudflareAccountId: "cloudflare-account",
    cloudflareWorkers: [],
    convexTeamId: "convex-team",
    convexProjects: [],
    defaultBranch: "main",
    deletion: { deleteAction: { state: "available" }, state: "not_deleting" },
    fileCount: 1,
    githubRepositoryName: "private",
    githubOwnerLogin: "lost",
    hasCloudflareProvision: false,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    isSamebaseManaged: true,
    organizationId: fakeOrganizationId(),
    providerPlan: null,
    providerSetup: { status: "ready" },
    providerWrite: { lastWriteAt: {}, status: "idle" },
    githubRepositoryFullName: "lost/private",
    sourceSetup: { status: "ready" },
  };
}

describe("useRepositoryWorkspaceModel", () => {
  beforeEach(() => {
    testState.cachedQueries.clear();
    testState.cachedQueries.set(
      getFunctionName(api.repository.folders.getRepositoryFolderState),
      EMPTY_FOLDER_STATE,
    );
    testState.cacheQueryCalls.length = 0;
    testState.liveQueries.clear();
    testState.liveQueries.set(
      getFunctionName(api.repository.organizationTree.getRepositoryOrganizationTreeSettings),
      [],
    );
    testState.providerRepositories.length = 0;
    testState.pullRequestArgs.length = 0;
    testState.queryCalls.length = 0;
  });

  it("treats a cached repository as unavailable after organization access is lost", async () => {
    const repository = lostAccessRepository();
    testState.cachedQueries.set(getFunctionName(api.repository.dashboard.getUserRepositories), [
      repository,
    ]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), []);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(repository.githubRepositoryFullName);
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest).toEqual({
        folderState: EMPTY_FOLDER_STATE,
        organizationTreeSettings: [],
        organizations: [],
        selection: { githubRepositoryFullName: "lost/private", state: "missing" },
        sidebarSummaries: { state: "loading" },
        state: "ready",
        repositories: [],
      });
      expect(testState.providerRepositories).toEqual([null]);
      expect(testState.pullRequestArgs).toEqual([{ repository: null }]);
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
    const repository = lostAccessRepository();
    const organization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-lost",
      githubOwnerLogin: "lost",
      githubOwnerType: "organization",
      organizationId: repository.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.repository.dashboard.getUserRepositories), [
      repository,
    ]);
    testState.cachedQueries.set(getFunctionName(api.organizations.listForViewer), [organization]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe({ accessVersion }: { accessVersion: number }) {
      latest = useRepositoryWorkspaceModel(repository.githubRepositoryFullName);
      return <span>{accessVersion}</span>;
    }

    try {
      await act(async () => root.render(<Probe accessVersion={0} />));

      expect(latest).toEqual({ state: "loading" });
      expect(testState.cacheQueryCalls).toEqual([
        getFunctionName(api.repository.dashboard.getUserRepositories),
        getFunctionName(api.repository.folders.getRepositoryFolderState),
      ]);
      expect(testState.providerRepositories).toEqual([null]);
      expect(testState.pullRequestArgs).toEqual([{ repository: null }]);
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
      expect(testState.providerRepositories.at(-1)).toBe(repository);
      expect(testState.pullRequestArgs.at(-1)).toEqual({ repository });
      expect(testState.queryCalls).toContainEqual({
        args: { organizationId: organization.organizationId },
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("keeps all accessible organization groups in a selected repository picker", async () => {
    const selectedRepository = {
      ...lostAccessRepository(),
      repositoryId: fakeRepositoryId("repository-samebase"),
      githubRepositoryName: "samebase",
      githubOwnerLogin: "samebase",
      organizationId: fakeOrganizationId("organization-samebase"),
      githubRepositoryFullName: "samebase/samebase",
    } satisfies UserRepositoryResult;
    const otherRepository = {
      ...selectedRepository,
      repositoryId: fakeRepositoryId("repository-noter"),
      githubRepositoryName: "guestbook",
      githubOwnerLogin: "noter",
      organizationId: fakeOrganizationId("organization-noter"),
      githubRepositoryFullName: "noter/guestbook",
    } satisfies UserRepositoryResult;
    const staleRepository = {
      ...selectedRepository,
      repositoryId: fakeRepositoryId("repository-stale"),
      githubRepositoryName: "private",
      githubOwnerLogin: "lost",
      organizationId: fakeOrganizationId("organization-lost"),
      githubRepositoryFullName: "lost/private",
    } satisfies UserRepositoryResult;
    const samebaseOrganization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: selectedRepository.organizationId,
      role: "owner",
    } as const;
    const noterOrganization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-noter",
      githubOwnerLogin: "noter",
      githubOwnerType: "organization",
      organizationId: otherRepository.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.repository.dashboard.getUserRepositories), [
      otherRepository,
      staleRepository,
      selectedRepository,
    ]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [
      noterOrganization,
      samebaseOrganization,
    ]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(selectedRepository.githubRepositoryFullName);
      return null;
    }

    try {
      await act(async () => root.render(<Probe />));

      expect(latest?.state).toBe("ready");
      if (latest?.state !== "ready") {
        throw new Error("Expected the selected repository workspace model to be ready.");
      }
      expect(latest.organizations).toEqual([noterOrganization, samebaseOrganization]);
      expect(latest.repositories).toEqual([otherRepository, selectedRepository]);
      expect(latest.selection.state).toBe("selected");
      if (latest.selection.state !== "selected") {
        throw new Error("Expected the selected repository workspace.");
      }
      expect(latest.selection.workspace.repository).toBe(selectedRepository);
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("keeps an organization inventory scoped and preserves its repository order", async () => {
    const firstRepository = {
      ...lostAccessRepository(),
      repositoryId: fakeRepositoryId("repository-samebase-first"),
      githubRepositoryName: "first",
      githubOwnerLogin: "samebase",
      organizationId: fakeOrganizationId("organization-samebase"),
      githubRepositoryFullName: "samebase/first",
    } satisfies UserRepositoryResult;
    const secondRepository = {
      ...firstRepository,
      repositoryId: fakeRepositoryId("repository-samebase-second"),
      githubRepositoryName: "second",
      githubRepositoryFullName: "samebase/second",
    } satisfies UserRepositoryResult;
    const otherRepository = {
      ...firstRepository,
      repositoryId: fakeRepositoryId("repository-other"),
      githubRepositoryName: "other",
      githubOwnerLogin: "other",
      organizationId: fakeOrganizationId("organization-other"),
      githubRepositoryFullName: "other/other",
    } satisfies UserRepositoryResult;
    const samebaseOrganization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: firstRepository.organizationId,
      role: "owner",
    } as const;
    const otherOrganization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-other",
      githubOwnerLogin: "other",
      githubOwnerType: "organization",
      organizationId: otherRepository.organizationId,
      role: "owner",
    } as const;
    testState.cachedQueries.set(getFunctionName(api.repository.dashboard.getUserRepositories), [
      secondRepository,
      otherRepository,
      firstRepository,
    ]);
    testState.liveQueries.set(getFunctionName(api.organizations.listForViewer), [
      otherOrganization,
      samebaseOrganization,
    ]);
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(undefined, "Samebase");
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
        repositories: [secondRepository, firstRepository],
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
