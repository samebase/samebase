// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { VaultRouteIdentity } from "./VaultRouteIdentityBoundary";
import { DashboardRoutePage } from "./DashboardRoutePage";

const vaultDashboardMock = vi.hoisted(() => vi.fn(() => null));
const routeIdentityState = vi.hoisted<{ identity: VaultRouteIdentity }>(() => ({
  identity: { state: "missing" },
}));

vi.mock("@/components/AuthenticatedAppRoutePage", () => ({
  AuthenticatedAppRoutePage: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/vault-dashboard/VaultDashboard", () => ({
  VaultDashboard: vaultDashboardMock,
}));
vi.mock("@/components/VaultRouteIdentityBoundary", () => ({
  VaultRouteIdentityBoundary: ({
    children,
  }: {
    children: (identity: VaultRouteIdentity) => ReactNode;
  }) => children(routeIdentityState.identity),
}));

describe("DashboardRoutePage", () => {
  beforeEach(() => {
    routeIdentityState.identity = { state: "missing" };
    vaultDashboardMock.mockClear();
  });

  it("passes the organization owner through to the vault dashboard", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(<DashboardRoutePage organizationOwner="samebase" />);
        await Promise.resolve();
      });

      expect(vaultDashboardMock).toHaveBeenCalledWith(
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

  it("passes a confirmed missing route as an explicit null vault identity", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(<DashboardRoutePage selectedRepositoryFullName="samebase/missing" />);
        await Promise.resolve();
      });

      expect(vaultDashboardMock).toHaveBeenCalledWith(
        {
          activeVaultId: null,
          organizationOwner: undefined,
          page: undefined,
          selectedRepositoryFullName: "samebase/missing",
        },
        undefined,
      );
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
