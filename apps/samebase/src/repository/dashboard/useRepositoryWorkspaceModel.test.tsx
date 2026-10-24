// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type { ViewerOrganization } from "@/organization/context";
import { repositoryDashboardQueries } from "@/routes/repository-dashboard.queries";
import { observedAlchemyStackReply } from "../../../convex/repository/fixtures/observedAlchemyState";
import type {
  RepositoryAlchemyStacks,
  RepositoryProviderObservationState,
} from "./useRepositoryProviderObservations";
import { useRepositoryWorkspaceModel } from "./useRepositoryWorkspaceModel";

const testState = vi.hoisted(
  (): {
    alchemy: RepositoryProviderObservationState<RepositoryAlchemyStacks>;
    providerRepositories: unknown[];
    providerSources: unknown[];
    pullRequestArgs: unknown[];
    queryCalls: { args: unknown; name: string }[];
  } => ({
    alchemy: { state: "loading" },
    providerRepositories: [],
    providerSources: [],
    pullRequestArgs: [],
    queryCalls: [],
  }),
);

const EMPTY_FOLDER_STATE = { assignments: [], folders: [] };

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
  useRepositoryProviderObservations: (repository: unknown, source: unknown) => {
    testState.providerRepositories.push(repository);
    testState.providerSources.push(source);
    return {
      cloudflare: {
        builds: { state: "loading" },
        convexBuildAccess: { state: "loading" },
        workers: { state: "loading" },
      },
      convex: { state: "loading" },
      alchemy: testState.alchemy,
      alchemyState:
        testState.alchemy.state === "loaded"
          ? {
              state: "loaded",
              observation: testState.alchemy.observations.at(0) ?? { store: "missing" },
              refreshFailed: testState.alchemy.refreshFailed,
              reload: testState.alchemy.reload,
            }
          : { state: "loading" },
    };
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    testState.queryCalls.push({ args, name: getFunctionName(reference) });
    return undefined;
  },
}));

/**
Renders the probe against the cache after the route loader fetched the dashboard queries. The
viewer's access stays unloaded, and without retries its query settles at once without data.
*/
async function renderWithDashboardQueries(
  probe: ReactNode,
  loaded: { organizations: ViewerOrganization[]; repositories: UserRepositoryResult[] },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(repositoryDashboardQueries.folderState.queryKey, EMPTY_FOLDER_STATE);
  queryClient.setQueryData(repositoryDashboardQueries.organizationTreeSettings.queryKey, []);
  queryClient.setQueryData(repositoryDashboardQueries.organizations.queryKey, loaded.organizations);
  queryClient.setQueryData(repositoryDashboardQueries.repositories.queryKey, loaded.repositories);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () =>
    root.render(<QueryClientProvider client={queryClient}>{probe}</QueryClientProvider>),
  );

  return {
    async unmount() {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

function fakeRepositoryId(value = "repository-lost-access"): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function fakeOrganizationId(value = "organization-lost-access"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return value;
}

function fakeConvexProjectId(): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only needs a stable id.
  return "convex-project-attached";
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
    testState.alchemy = { state: "loading" };
    testState.providerRepositories.length = 0;
    testState.providerSources.length = 0;
    testState.pullRequestArgs.length = 0;
    testState.queryCalls.length = 0;
  });

  it("treats a cached repository as unavailable after organization access is lost", async () => {
    const repository = lostAccessRepository();
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(repository.githubRepositoryFullName);
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [],
      repositories: [repository],
    });

    try {
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
      expect(testState.pullRequestArgs).toEqual([
        { repository: null, source: undefined, alchemyState: { state: "loading" } },
      ]);
      expect(testState.queryCalls).toContainEqual({
        args: "skip",
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
    } finally {
      await mounted.unmount();
    }
  });

  it("starts provider queries for a repository of an accessible organization", async () => {
    const repository = lostAccessRepository();
    const organization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-lost",
      githubOwnerLogin: "lost",
      githubOwnerType: "organization",
      organizationId: repository.organizationId,
      role: "owner",
    } as const;
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(repository.githubRepositoryFullName);
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [organization],
      repositories: [repository],
    });

    try {
      expect(latest?.state).toBe("ready");
      if (latest?.state !== "ready") {
        throw new Error("Expected the workspace model to be ready.");
      }
      expect(latest.selection.state).toBe("selected");
      expect(testState.providerRepositories).not.toContain(null);
      expect(testState.providerRepositories.at(-1)).toBe(repository);
      expect(testState.pullRequestArgs.at(-1)).toEqual({
        repository,
        source: undefined,
        alchemyState: { state: "loading" },
      });
      expect(testState.queryCalls).not.toContainEqual({
        args: "skip",
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
      expect(testState.queryCalls).toContainEqual({
        args: { organizationId: organization.organizationId },
        name: getFunctionName(api.users.getCloudflareConnectionStatus),
      });
    } finally {
      await mounted.unmount();
    }
  });

  it("builds the default-branch block from the stack in the team store when it exists", async () => {
    // Like the preview deployment of Samebase: base-alchemy has no attachment rows there.
    const repository = {
      ...lostAccessRepository(),
      githubOwnerLogin: "samebase",
      githubRepositoryName: "base-alchemy",
      githubRepositoryFullName: "samebase/base-alchemy",
      convexTeamId: "38516",
    } satisfies UserRepositoryResult;
    const organization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: repository.organizationId,
      role: "owner",
    } as const;
    const prod = observedAlchemyStackReply.value.stages[2];
    testState.alchemy = {
      state: "loaded",
      refreshFailed: false,
      reload: () => {},
      observations: [
        {
          store: "found",
          liveDeployments: [
            {
              deploymentName: "ideal-dolphin-15",
              dashboardUrl: "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
              region: "aws-us-east-1",
            },
          ],
          // The captured stage as `reader:repository` returns it, with the `rootDir` "." on its
          // Deployment row that @samebase/alchemy-convex 0.8.0 writes for a stack file at the root.
          stacks: [
            {
              name: "samebase/base-alchemy",
              stages: [
                {
                  name: prod.stage,
                  record: {
                    version: 1,
                    repository: "samebase/base-alchemy",
                    stackFile: "alchemy.run.ts",
                    branch: "main",
                    pullRequest: null,
                    headCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
                    runUrl:
                      "https://github.com/samebase/base-alchemy/actions/runs/39666079880/attempts/1",
                    source: "github-actions",
                    recordedAt: "2026-10-21T19:58:06.882Z",
                  },
                  deployedHeadCommit: "a4d98f2ad150dee07e19fa9c348e70240aca1dac",
                  resources: prod.resources.map((resource) => ({
                    fqn: resource.fqn,
                    value: resource.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
                  })),
                  output: '{"url":"https://ideal-dolphin-15.convex.site"}',
                },
              ],
            },
          ],
        },
      ],
    };
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(repository.githubRepositoryFullName);
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [organization],
      repositories: [repository],
    });

    try {
      if (latest?.state !== "ready" || latest.selection.state !== "selected") {
        throw new Error("Expected the selected repository workspace.");
      }
      expect(
        latest.selection.workspace.environmentRoots.map((root) => ({
          rootDirectory: root.rootDirectory,
          labels: root.resources.map((resource) =>
            resource.kind === "destination" ? [resource.label, resource.href] : resource.kind,
          ),
        })),
      ).toEqual([
        {
          rootDirectory: "/",
          labels: [
            [
              "ideal-dolphin-15",
              "https://dashboard.convex.dev/t/nicu/base-alchemy/ideal-dolphin-15",
            ],
          ],
        },
      ]);
    } finally {
      await mounted.unmount();
    }
  });

  it("builds the default-branch block from the attachment rows for ?attachments", async () => {
    const convexProjectId = fakeConvexProjectId();
    const repository = {
      ...lostAccessRepository(),
      githubOwnerLogin: "samebase",
      githubRepositoryName: "samebase",
      githubRepositoryFullName: "samebase/samebase",
      convexProjects: [
        {
          convexProjectId,
          teamId: "38516",
          projectId: "3245938",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
        },
      ],
    } satisfies UserRepositoryResult;
    const organization = {
      canCreateRepository: true,
      githubOwnerId: "github-owner-samebase",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization",
      organizationId: repository.organizationId,
      role: "owner",
    } as const;
    // What the provider observations return for `source: "attachments"`: no stack.
    testState.alchemy = {
      state: "loaded",
      observations: [],
      refreshFailed: false,
      reload: () => {},
    };
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(
        repository.githubRepositoryFullName,
        undefined,
        "attachments",
      );
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [organization],
      repositories: [repository],
    });

    try {
      if (latest?.state !== "ready" || latest.selection.state !== "selected") {
        throw new Error("Expected the selected repository workspace.");
      }
      expect(testState.providerSources.at(-1)).toBe("attachments");
      expect(testState.pullRequestArgs.at(-1)).toMatchObject({
        repository,
        source: "attachments",
        alchemyState: { state: "loaded", observation: { store: "missing" } },
      });
      expect(latest.selection.workspace.environmentRoots).toEqual([
        { rootDirectory: "/", resources: [{ kind: "convex_loading", id: convexProjectId }] },
      ]);
    } finally {
      await mounted.unmount();
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
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(selectedRepository.githubRepositoryFullName);
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [noterOrganization, samebaseOrganization],
      repositories: [otherRepository, staleRepository, selectedRepository],
    });

    try {
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
      await mounted.unmount();
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
    let latest: ReturnType<typeof useRepositoryWorkspaceModel> | undefined;

    function Probe() {
      latest = useRepositoryWorkspaceModel(undefined, "Samebase");
      return null;
    }

    const mounted = await renderWithDashboardQueries(<Probe />, {
      organizations: [otherOrganization, samebaseOrganization],
      repositories: [secondRepository, otherRepository, firstRepository],
    });

    try {
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
      await mounted.unmount();
    }
  });
});
