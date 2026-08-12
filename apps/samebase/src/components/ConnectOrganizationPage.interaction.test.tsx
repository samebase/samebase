// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  navigate: vi.fn(),
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
import { ConnectOrganizationPage } from "./ConnectOrganizationPage";

const { act } = React;

describe("ConnectOrganizationPage", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    testState.actions.clear();
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
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
          <ConnectOrganizationPage />
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
        expect(rootElement.textContent).toContain("No GitHub App installations");
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
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ConnectOrganizationPage />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(rootElement.textContent).not.toContain("private-owner");
    expect(rootElement.querySelector('[aria-label="Loading GitHub App installations"]')).not.toBe(
      null,
    );
  });
});
