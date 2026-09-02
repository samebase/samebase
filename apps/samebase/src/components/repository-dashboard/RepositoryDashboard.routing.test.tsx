// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RepositoryDashboard } from "./RepositoryDashboard";

const workspaceModelMock = vi.hoisted(() => vi.fn());
const repositoryPickerMock = vi.hoisted(() => vi.fn(() => null));

function createMutationMock() {
  const mutation = vi.fn();
  return Object.assign(mutation, {
    withOptimisticUpdate: () => mutation,
  });
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: createMutationMock,
  };
});
vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({ children }: { children?: ReactNode }) => children ?? null,
}));
vi.mock("./RepositoryOverviewPage", () => ({
  RepositoryOverviewLoadingPage: () => null,
}));
vi.mock("./RepositoryOverviewSidebar", () => ({
  RepositoryOverviewOrganizationSidebar: () => null,
  RepositoryOverviewSidebar: () => null,
  RepositoryOverviewSidebarLoading: () => null,
}));
vi.mock("./RepositoryOverviewPickerPane", () => ({
  RepositoryOverviewListHeader: () => null,
  RepositoryOverviewPickerPane: repositoryPickerMock,
}));
vi.mock("./RepositorySelectedWorkspace", () => ({
  RepositorySelectedWorkspace: () => null,
}));
vi.mock("./useRepositoryWorkspaceModel", () => ({
  useRepositoryWorkspaceModel: workspaceModelMock,
}));

const { act } = React;

describe("RepositoryDashboard dialog route cleanup", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

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
    workspaceModelMock.mockReset();
    repositoryPickerMock.mockReset();
  });

  function LocationProbe() {
    const location = useLocation();
    return <output data-href={location.href} data-testid="router-location" />;
  }

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderDashboard(initialEntry: string, selectedRepositoryFullName?: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <RepositoryDashboard selectedRepositoryFullName={selectedRepositoryFullName} />
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

  function setLoadingWorkspace() {
    workspaceModelMock.mockReturnValue({ state: "loading" });
  }

  function setSettledWorkspace(
    selection:
      | { state: "root" }
      | { state: "missing"; githubRepositoryFullName: string }
      | {
          state: "selected";
          workspace: {
            repository: {
              repositoryId: string;
              deletion: {
                state: "not_deleting";
                deleteAction: { state: "available" | "unavailable" };
              };
              hasConnectedGitHubRepository: boolean;
            };
          };
        },
  ) {
    workspaceModelMock.mockReturnValue({
      folderState: { assignments: [], folders: [] },
      organizationTreeSettings: [],
      organizations: [],
      state: "ready",
      selection,
      sidebarSummaries: { state: "loaded", summaries: [] },
      repositories: [],
    });
  }

  it("keeps a dialog deep link while the repository model is loading", async () => {
    setLoadingWorkspace();

    await renderDashboard("/repo?delete&dev");

    expect(readLocationHref()).toContain("delete");
    expect(readLocationHref()).toContain("dev");
  });

  it("clears an unavailable dialog from the repository root route", async () => {
    setSettledWorkspace({ state: "root" });

    await renderDashboard("/repo?delete&dev#repositories");

    expect(readLocationHref()).toContain("/repo?");
    expect(readLocationHref()).not.toContain("delete");
    expect(readLocationHref()).toContain("dev");
    expect(readLocationHref()).toContain("#repositories");
  });

  it("passes the global organization inventory to the root repository picker", async () => {
    workspaceModelMock.mockReturnValue({
      folderState: { assignments: [], folders: [] },
      organizationTreeSettings: [],
      organizations: [],
      selection: { state: "root" },
      sidebarSummaries: { state: "loaded", summaries: [] },
      state: "ready",
      repositories: [],
    });

    await renderDashboard("/repo");

    expect(repositoryPickerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        globalInventory: true,
        organizations: [],
        repositories: [],
      }),
      undefined,
    );
  });

  it("clears an unavailable dialog from a missing repository route", async () => {
    setSettledWorkspace({
      state: "missing",
      githubRepositoryFullName: "samebase/missing",
    });

    await renderDashboard("/repo/samebase/missing?add-convex&dev", "samebase/missing");

    expect(readLocationHref()).toContain("/repo/samebase/missing?");
    expect(readLocationHref()).not.toContain("add-convex");
    expect(readLocationHref()).toContain("dev");
    expect(rootElement?.textContent).toContain("Repository unavailable");
    expect(rootElement?.textContent).toContain("All repositories");
    expect(rootElement?.textContent).not.toContain("samebase/missing");
    expect(rootElement?.querySelector("a")?.getAttribute("href")).toContain("/repo");
  });

  it("keeps a permitted dialog for the selected repository", async () => {
    setSettledWorkspace({
      state: "selected",
      workspace: {
        repository: {
          repositoryId: "repository:test",
          deletion: {
            state: "not_deleting",
            deleteAction: { state: "available" },
          },
          hasConnectedGitHubRepository: true,
        },
      },
    });

    await renderDashboard("/repo/samebase/samebase?delete&dev", "samebase/samebase");

    expect(readLocationHref()).toContain("delete");
    expect(readLocationHref()).toContain("dev");
  });
});
