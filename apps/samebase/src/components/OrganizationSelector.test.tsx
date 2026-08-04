// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { OrganizationSelector } from "./OrganizationSelector";

type TestOrganizationSelection =
  | {
      state: "selection_required";
      organizations: Array<{ organizationId: string; label: string }>;
    }
  | {
      state: "selected";
      organizationId: string;
      organizations: Array<{ organizationId: string; label: string }>;
    };

const navigateMock = vi.hoisted(() => vi.fn());
const locationState = vi.hoisted(() => ({
  hash: "",
  pathname: "/vault",
}));
const searchState = vi.hoisted((): { organization?: string } => ({}));
const selectionState = vi.hoisted((): { value: TestOrganizationSelection } => ({
  value: {
    state: "selection_required",
    organizations: [
      { organizationId: "organization_alpha", label: "Alpha organization" },
      { organizationId: "organization_beta", label: "Beta organization" },
    ],
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => locationState,
  useRouter: () => ({ navigate: navigateMock }),
}));

vi.mock("@/hooks/useOrganizationSelection", () => ({
  useOrganizationSelection: () => selectionState.value,
}));

vi.mock("@/routeSearch/root", () => ({
  useRootRouteSearch: () => searchState,
}));

describe("OrganizationSelector", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    navigateMock.mockClear();
    selectionState.value = {
      state: "selection_required",
      organizations: [
        { organizationId: "organization_alpha", label: "Alpha organization" },
        { organizationId: "organization_beta", label: "Beta organization" },
      ],
    };
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
    }
    root = null;
    rootElement?.remove();
    rootElement = null;
  });

  it("shows the selected organization label instead of its id", async () => {
    await act(async () => {
      root?.render(<OrganizationSelector />);
    });

    selectionState.value = {
      state: "selected",
      organizationId: "organization_beta",
      organizations: [
        { organizationId: "organization_alpha", label: "Alpha organization" },
        { organizationId: "organization_beta", label: "Beta organization" },
      ],
    };
    await act(async () => {
      root?.render(<OrganizationSelector />);
    });

    const trigger = rootElement?.querySelector('[aria-label="Organization"]');
    expect(trigger?.textContent).toContain("Beta organization");
    expect(trigger?.textContent).not.toContain("organization_beta");
  });
});
