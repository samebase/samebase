import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";
import type { UserPermission } from "../../shared/userPermissions";
import { PermissionGate } from "./PermissionGate";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useLocation: (options?: {
    select?: (location: { pathname: string }) => unknown;
  }) =>
    options?.select
      ? options.select({ pathname: "/machines" })
      : { pathname: "/machines" },
}));

function accessWithPermissions(permissions: UserPermission[]) {
  return {
    isAuthenticated: true,
    isApproved: true,
    isAdmin: false,
    permissions,
  };
}

describe("PermissionGate", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it("renders children when the current user has the required permission", () => {
    useQueryMock.mockReturnValue(accessWithPermissions(["machines.access"]));

    const markup = renderToStaticMarkup(
      <PermissionGate requiredPermission="machines.access">
        <main>Machines workspace</main>
      </PermissionGate>,
    );

    expect(markup).toContain("Machines workspace");
    expect(markup).not.toContain("Page not found");
  });

  it("renders a not-found state when the current user lacks the permission", () => {
    useQueryMock.mockReturnValue(accessWithPermissions([]));

    const markup = renderToStaticMarkup(
      <PermissionGate requiredPermission="machines.access">
        <main>Machines workspace</main>
      </PermissionGate>,
    );

    expect(markup).toContain("Page not found");
    expect(markup).toContain("/machines");
    expect(markup).not.toContain("Machines workspace");
  });

  it("does not require access for ungated routes", () => {
    useQueryMock.mockReturnValue(undefined);

    const markup = renderToStaticMarkup(
      <PermissionGate>
        <main>Dashboard shell</main>
      </PermissionGate>,
    );

    expect(markup).toContain("Dashboard shell");
  });
});
