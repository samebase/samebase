// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RepositorySelectedWorkspace } from "./RepositorySelectedWorkspace";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

const actionState = vi.hoisted(() => ({
  fallback: vi.fn(async () => undefined),
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: () => actionState.fallback,
    useMutation: () => actionState.fallback,
  };
});
vi.mock("@/components/ui/use-toast", () => ({
  toast: toastMock,
}));
vi.mock("./RepositoryDeleteDialog", () => ({
  RepositoryDeleteDialog: () => null,
}));
vi.mock("./RepositorySettings", () => ({
  RepositorySettings: () => null,
}));
const { act } = React;

function fakeRepositoryId(): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "organization-samebase";
}

function fakeRunId(): Id<"workflow_repositoryProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function LocationProbe() {
  const location = useLocation();
  return <output data-href={location.href} data-testid="router-location" />;
}

function makeRepository({
  owner = "ada",
  providerSetup = { status: "ready" },
  providerWrite,
  repoName = "demo",
}: {
  owner?: string;
  providerSetup?: UserRepositoryResult["providerSetup"];
  providerWrite: UserRepositoryResult["providerWrite"];
  repoName?: string;
}): UserRepositoryResult {
  return {
    repositoryId: fakeRepositoryId(),
    organizationId: fakeOrganizationId(),
    convexTeamId: "team-1",
    cloudflareAccountId: "account-1",
    githubOwnerLogin: owner,
    githubRepositoryName: repoName,
    githubRepositoryFullName: `${owner}/${repoName}`,
    defaultBranch: "main",
    fileCount: 0,
    sourceSetup: { status: "ready" },
    providerSetup,
    providerPlan: null,
    providerWrite,
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "disabled", reason: "A provider operation is in progress." },
    },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    hasCloudflareProvision: false,
    cloudflareWorkers: [],
    convexProjects: [],
  };
}

function makeWorkspace(repository: UserRepositoryResult): RepositoryWorkspaceSelected {
  return {
    alchemyState: {
      state: "loaded",
      observation: { store: "missing" },
      refreshFailed: false,
      reload: () => {},
    },
    alchemyObservations: {
      state: "loaded",
      observations: [],
      refreshFailed: false,
      reload: () => {},
    },
    access: { state: "ready", accessKeys: [] },
    cloudflareConnection: { state: "loading" },
    cloudflareObservations: {
      workers: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
      builds: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
      convexBuildAccess: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
    },
    convexObservations: {
      state: "loaded",
      observations: [],
      refreshFailed: false,
      reload: () => {},
    },
    githubRepositoryUrl: `https://github.com/${repository.githubRepositoryFullName}`,
    production: { source: "attachments", roots: [] },
    pullRequests: { state: "not_requested" },
    repository,
  };
}

describe("RepositorySelectedWorkspace route", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    actionState.fallback.mockClear();
    toastMock.mockReset();
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
  });

  async function renderWorkspace(
    workspace: RepositoryWorkspaceSelected,
    initialEntry: string,
    page: "overview" | "settings" = "settings",
  ) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <RepositorySelectedWorkspace developerToolsVisible page={page} workspace={workspace} />
          <LocationProbe />
        </TestRouterProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function failedSetupRepository(providerWrite: UserRepositoryResult["providerWrite"]) {
    return makeRepository({
      providerSetup: {
        status: "failed",
        provider: "cloudflare",
        runId: fakeRunId(),
        step: "attach_worker",
        message: "Cloudflare could not attach the Worker.",
        updatedAt: 20,
      },
      providerWrite,
    });
  }

  async function clickRetry() {
    const retryButton = [...(rootElement?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Retry",
    );
    if (!retryButton) {
      throw new Error("Expected the Retry button.");
    }
    actionState.fallback.mockClear();
    await act(async () => {
      retryButton.click();
    });
  }

  it("shows a stored Cloudflare GitHub App failure in the Retry notice", async () => {
    const owner = "noter-guest";
    const repoName = "tmp-testing-waters";
    const githubRepositoryFullName = `${owner}/${repoName}`;
    const storedRecoveryUrl =
      "https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
    const message = `Cloudflare Workers and Pages GitHub App is not authorized for ${githubRepositoryFullName}. Follow Cloudflare's recovery steps at ${storedRecoveryUrl}: uninstall the GitHub App first, then reinstall/connect GitHub from Workers & Pages. GitHub gives this access to the Cloudflare Workers and Pages GitHub App, not to Samebase. Select All repositories so Cloudflare can connect repositories that Samebase creates later to Workers Builds, then retry.`;
    const repository = makeRepository({
      owner,
      providerSetup: {
        status: "failed",
        provider: "cloudflare",
        runId: fakeRunId(),
        step: "attach_worker",
        message,
        updatedAt: 20,
      },
      providerWrite: { status: "idle", lastWriteAt: {} },
      repoName,
    });

    await renderWorkspace(
      makeWorkspace(repository),
      "/repo/noter-guest/tmp-testing-waters",
      "overview",
    );
    const element = rootElement;
    if (!element) {
      throw new Error("Expected the selected workspace to render.");
    }

    expect(element.querySelector("h2")?.textContent).toBe("Provider setup failed");
    expect(element.textContent).toContain(message);
    expect(element.querySelector("ol")).toBeNull();
    expect(element.textContent).not.toContain("Cloudflare recovery guide");
  });

  it("retries a failed provider setup", async () => {
    const repository = failedSetupRepository({ status: "idle", lastWriteAt: {} });

    await renderWorkspace(makeWorkspace(repository), "/repo/ada/demo", "overview");
    await clickRetry();

    expect(actionState.fallback).toHaveBeenCalledWith({
      repositoryId: repository.repositoryId,
      confirmation: undefined,
    });
  });

  it("does not retry a failed provider setup while a provider write is active", async () => {
    const repository = failedSetupRepository({
      status: "active",
      owner: { kind: "managed_run" },
      lastWriteAt: {},
    });

    await renderWorkspace(makeWorkspace(repository), "/repo/ada/demo", "overview");
    await clickRetry();

    expect(actionState.fallback).not.toHaveBeenCalled();
  });
});
