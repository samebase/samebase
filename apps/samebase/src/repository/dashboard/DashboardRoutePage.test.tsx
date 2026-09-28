// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

import { DashboardRoutePage } from "./DashboardRoutePage";

const repositoryDashboardMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/appShell/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/repository/dashboard/RepositoryDashboard", () => ({
  RepositoryDashboard: repositoryDashboardMock,
}));

describe("DashboardRoutePage", () => {
  it("passes the organization owner through to the repository dashboard", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(<DashboardRoutePage organizationOwner="samebase" />);
        await Promise.resolve();
      });

      expect(repositoryDashboardMock).toHaveBeenCalledWith(
        {
          organizationOwner: "samebase",
          page: undefined,
          selectedRepositoryFullName: undefined,
        },
        undefined,
      );
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
