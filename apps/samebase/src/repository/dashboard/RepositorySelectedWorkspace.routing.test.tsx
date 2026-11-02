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
  providerPlan = null,
  providerSetup = { status: "ready" },
  providerWrite,
  repoName = "demo",
}: {
  owner?: string;
  providerPlan?: UserRepositoryResult["providerPlan"];
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
    providerPlan,
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
    access: { state: "ready", accessKeys: [] },
    githubRepositoryUrl: `https://github.com/${repository.githubRepositoryFullName}`,
    productionCards: [],
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
      providerPlan: {
        provisioning: "repository_actions",
        convexConfigPath: "convex.json",
        ciSecrets: { state: "planned" },
      },
      providerSetup: {
        status: "failed",
        provider: "github",
        runId: fakeRunId(),
        step: "write_actions_secrets",
        message: "GitHub Actions secrets could not be written.",
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

  it("shows the missing-store guidance without Retry for an old failed setup", async () => {
    const repository = makeRepository({
      providerPlan: {
        convexConfigPath: "convex.json",
        convex: {
          state: "planned",
          teamId: "team-1",
          projectName: "demo",
          deploymentRegion: "aws-us-east-1",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-1",
          workerName: "demo",
          rootDirectory: "/",
          buildTokenUuid: null,
        },
      },
      providerSetup: {
        status: "failed",
        provider: "cloudflare",
        runId: fakeRunId(),
        step: "attach_worker",
        message: "Cloudflare could not attach the Worker.",
        updatedAt: 20,
      },
      providerWrite: { status: "idle", lastWriteAt: {} },
    });

    await renderWorkspace(makeWorkspace(repository), "/repo/ada/demo", "overview");
    const element = rootElement;
    if (!element) {
      throw new Error("Expected the selected workspace to render.");
    }

    expect(element.textContent).not.toContain("Provider setup failed");
    expect(element.textContent).not.toContain("Retry");
    expect(element.textContent).toContain("Alchemy state store");
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
