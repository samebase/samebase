// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  navigate: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: () => vi.fn(async () => undefined),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Navigate: (props: Parameters<typeof actual.Navigate>[0]) => {
      void testState.navigate(props);
      return null;
    },
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
          <ConnectOrganizationPage session="connection-session" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  it("replaces the connection route after Connect succeeds", async () => {
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), async () => ({
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
    testState.actions.set(
      getFunctionName(api.githubAppConnection.connectInstallation),
      async () => ({
        status: "connected",
        organizationOwnerLogin: "History-Owner",
      }),
    );

    await renderPage();
    await act(async () => {
      await vi.waitFor(() => expect(rootElement.querySelector("button")).not.toBeNull());
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
        expect(testState.navigate).toHaveBeenCalledWith({
          href: "/org/History-Owner/vaults",
          replace: true,
        });
      });
    });
  });

  it("opens the prior result when the completed session is loaded again", async () => {
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), async () => ({
      status: "completed",
      organizationOwnerLogin: "History-Owner",
    }));

    await renderPage();

    await act(async () => {
      await vi.waitFor(() => {
        expect(testState.navigate).toHaveBeenCalledWith({
          params: { owner: "History-Owner" },
          replace: true,
          to: "/org/$owner/vaults",
        });
      });
    });
  });
});
