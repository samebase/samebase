// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../convex/_generated/dataModel";
import type { ViewerOrganization } from "@/lib/organizationContext";

const testState = vi.hoisted<{
  actions: Map<string, (args: unknown) => Promise<unknown>>;
  navigate: ReturnType<typeof vi.fn>;
  organizations: ViewerOrganization[];
  viewerId: string;
}>(() => ({
  actions: new Map(),
  navigate: vi.fn(),
  organizations: [],
  viewerId: "viewer-a",
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: () => vi.fn(async () => undefined),
    useQuery: () => ({ _id: testState.viewerId }),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => testState.navigate,
  };
});

import { api } from "../../convex/_generated/api";
import { OrganizationContext } from "@/lib/organizationContext";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationsPage } from "./OrganizationsPage";

const { act } = React;

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for the organization entry.
  return value;
}

function organization(githubOwnerLogin: string): ViewerOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType: "organization",
    organizationId: fakeOrganizationId(`organization-${githubOwnerLogin}`),
    role: "member",
  };
}

describe("OrganizationsPage", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    testState.actions.clear();
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
    testState.organizations = [];
    testState.viewerId = "viewer-a";
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    rootElement.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TestRouterProvider initialEntries={["/org"]}>
            <OrganizationContext.Provider
              value={{ organizations: testState.organizations, surface: { kind: "organizations" } }}
            >
              <OrganizationsPage />
            </OrganizationContext.Provider>
          </TestRouterProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it("lists with the durable authorization and replaces the route after Connect succeeds", async () => {
    const listOptions = vi.fn(async () => ({
      status: "ready",
      options: [
        {
          status: "connect",
          installationId: "101",
          githubOwnerType: "organization",
          githubOwnerLogin: "history-owner",
        },
      ],
    }));
    const connectInstallation = vi.fn(async () => ({
      status: "connected",
      organizationOwnerLogin: "History-Owner",
    }));
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), listOptions);
    testState.actions.set(
      getFunctionName(api.githubAppConnection.connectInstallation),
      connectInstallation,
    );

    await renderPage();
    await act(async () => {
      await vi.waitFor(() => {
        expect(listOptions).toHaveBeenCalledWith({});
        expect(
          rootElement.querySelector('button[aria-label="Connect history-owner"]'),
        ).not.toBeNull();
      });
    });
    const connectButton = rootElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Connect history-owner"]',
    );
    if (connectButton === null) {
      throw new Error("Expected the Connect action.");
    }
    await act(async () => {
      connectButton.click();
      await vi.waitFor(() => {
        expect(connectInstallation).toHaveBeenCalledWith({ installationId: "101" });
        expect(testState.navigate).toHaveBeenCalledWith({
          href: "/org/History-Owner/vaults",
          replace: true,
        });
      });
    });
  });

  it("keeps memberships visible when GitHub authorization is required", async () => {
    testState.organizations = [organization("member-org")];
    testState.actions.set(
      getFunctionName(api.githubAppConnection.listOptions),
      vi.fn(async () => ({ status: "authorization_required" })),
    );

    await renderPage();
    await act(async () => {
      await vi.waitFor(() => {
        expect(rootElement.textContent).toContain("member-org");
        expect(rootElement.textContent).toContain("Authorize GitHub");
      });
    });
    expect(rootElement.querySelector('a[href="/org/member-org/vaults"]')).not.toBeNull();
  });

  it("retries a failed installation load without showing GitHub authorization", async () => {
    const listOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error("GitHub unavailable"))
      .mockResolvedValueOnce({ status: "ready", options: [] });
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), listOptions);

    await renderPage();
    await act(async () => {
      await vi.waitFor(() => {
        expect(rootElement.textContent).toContain("Could not load GitHub App installations.");
      });
    });
    expect(rootElement.textContent).not.toContain("Authorize GitHub");
    const retryButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    if (retryButton === undefined) {
      throw new Error("Expected the installation load retry action.");
    }

    await act(async () => {
      retryButton.click();
      await vi.waitFor(() => {
        expect(listOptions).toHaveBeenCalledTimes(2);
        expect(rootElement.textContent).toContain("No organizations");
      });
    });
  });

  it("does not show a previous user's cached installation options", async () => {
    const listOptions = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ready",
        options: [
          {
            status: "connect",
            installationId: "private-installation",
            githubOwnerType: "organization",
            githubOwnerLogin: "private-owner",
          },
        ],
      })
      .mockReturnValueOnce(new Promise(() => {}));
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), listOptions);

    await renderPage();
    await act(async () => {
      await vi.waitFor(() => expect(rootElement.textContent).toContain("private-owner"));
    });

    testState.viewerId = "viewer-b";
    await renderPage();

    expect(rootElement.textContent).not.toContain("private-owner");
    expect(rootElement.querySelector('[aria-label="Loading GitHub App installations"]')).not.toBe(
      null,
    );
  });
});
