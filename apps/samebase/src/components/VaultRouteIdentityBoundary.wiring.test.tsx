// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { DashboardRoutePage } from "./DashboardRoutePage";
import { FileView } from "./FileView/FileView";
import { VaultConvexSchemaGraphView } from "./VaultConvexSchemaGraphView";
import { VaultDatabaseView } from "./VaultDatabaseView";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const boundaryMock = vi.hoisted(() => vi.fn((_props: { owner: string; repoName: string }) => null));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/VaultRouteIdentityBoundary", () => ({
  VaultRouteIdentityBoundary: boundaryMock,
}));

describe("vault route identity boundary wiring", () => {
  it.each([
    {
      name: "dashboard overview",
      render: () => (
        <DashboardRoutePage selectedRepositoryFullName="route-owner/route-repository" />
      ),
    },
    {
      name: "dashboard settings",
      render: () => (
        <DashboardRoutePage
          page="settings"
          selectedRepositoryFullName="route-owner/route-repository"
        />
      ),
    },
    {
      name: "file",
      render: () => (
        <TestRouterProvider
          initialEntries={["/vault/route-owner/route-repository/fs/main/README.md"]}
        >
          <FileView />
        </TestRouterProvider>
      ),
    },
    {
      name: "database",
      render: () => (
        <VaultDatabaseView
          branch="main"
          convexProjectId="project:test"
          owner="route-owner"
          repoName="route-repository"
        />
      ),
    },
    {
      name: "schema",
      render: () => (
        <VaultConvexSchemaGraphView
          branch="main"
          convexProjectId="project:test"
          owner="route-owner"
          repoName="route-repository"
        />
      ),
    },
  ])("passes the $name route identity to the shared boundary", ({ render }) => {
    boundaryMock.mockClear();

    renderToStaticMarkup(render());

    expect(boundaryMock).toHaveBeenCalledOnce();
    expect(boundaryMock.mock.calls[0]?.[0]).toMatchObject({
      owner: "route-owner",
      repoName: "route-repository",
    });
  });
});
