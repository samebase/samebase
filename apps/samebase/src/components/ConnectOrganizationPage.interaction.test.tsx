// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
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
    useNavigate: () => testState.navigate,
  };
});

import { api } from "../../convex/_generated/api";
import { ConnectOrganizationPage } from "./ConnectOrganizationPage";

const { act } = React;

describe("ConnectOrganizationPage", () => {
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    testState.actions.clear();
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    rootElement.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<ConnectOrganizationPage session="connection-session" />);
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
    await vi.waitFor(() => expect(rootElement.querySelector("button")).not.toBeNull());
    const connectButton = rootElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Connect history-owner"]',
    );
    if (connectButton === null) {
      throw new Error("Expected the Connect action.");
    }
    await act(async () => connectButton.click());

    await vi.waitFor(() => {
      expect(testState.navigate).toHaveBeenCalledWith({
        href: "/org/History-Owner/vaults",
        replace: true,
      });
    });
  });

  it("opens the prior result when the completed session is loaded again", async () => {
    testState.actions.set(getFunctionName(api.githubAppConnection.listOptions), async () => ({
      status: "completed",
      organizationOwnerLogin: "History-Owner",
    }));

    await renderPage();

    await vi.waitFor(() => {
      expect(testState.navigate).toHaveBeenCalledWith({
        href: "/org/History-Owner/vaults",
        replace: true,
      });
    });
  });
});
