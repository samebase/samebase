// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocation } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { OrganizationSelector } from "./OrganizationSelector";
import { TestRouterProvider } from "@/test/TestRouterProvider";

vi.mock("@/hooks/useOrganizationSelection", () => ({
  useOrganizationSelection: () => ({
    state: "selected",
    organizationId: "organization_alpha",
    organizations: [{ organizationId: "organization_alpha", label: "Alpha organization" }],
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.href}</div>;
}

describe("OrganizationSelector routing", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    rootElement?.remove();
    rootElement = null;
  });

  it("keeps the MCP request when it adds the sole organization", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <TestRouterProvider
          initialEntries={[
            "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1",
          ]}
        >
          <OrganizationSelector />
          <LocationProbe />
        </TestRouterProvider>,
      );
    });

    const location = rootElement.querySelector('[data-testid="location"]')?.textContent;
    const url = new URL(location ?? "", "http://samebase.test");
    expect(url.searchParams.get("organization")).toBe("organization_alpha");
    expect(url.searchParams.get("mcp_consent_request")).toBe("mcpar_test");
    expect(url.searchParams.has("mcp_login_required")).toBe(true);
  });
});
