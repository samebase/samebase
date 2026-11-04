// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminHubClientsPage } from "./AdminHubClientsPage";

const actionState = vi.hoisted(() => ({
  readOverview: vi.fn(),
  listRegistrations: vi.fn(),
  changeBlock: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.hubClients.moderation.readOverview)) {
        return actionState.readOverview;
      }
      if (name === getFunctionName(api.hubClients.moderation.listRegistrations)) {
        return actionState.listRegistrations;
      }
      return actionState.changeBlock;
    },
  };
});

const overview = {
  status: "on",
  counts: { day: { count: 3, atLeast: false }, week: { count: 1_000, atLeast: true } },
  blockList: {
    blocks: [
      {
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
        adminEmail: "nicu@samebase.com",
        createdAt: 1,
      },
    ],
    events: [
      {
        action: "block",
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
        adminEmail: "nicu@samebase.com",
        createdAt: 1,
      },
    ],
  },
  clientList: {
    clients: [
      {
        clientId: "cl_test",
        appId: "gh-74-4c9a75cca717efb68c856f26ba825073",
        clientName: "pr-12",
        deploymentType: "preview",
        redirectHost: "calm-cow-456.eu-west-1.convex.site",
        createdAt: 1,
        renewedAt: 2,
        lastSignInAt: null,
      },
    ],
    limitReached: false,
  },
};

const registrations = {
  status: "on",
  registrations: {
    page: [
      {
        clientId: "cl_test",
        githubRepositoryDatabaseId: "74",
        githubOwnerId: "65",
        githubRepository: "octo-org/octo-repo",
        githubActorId: "12",
        githubActorLogin: "octocat",
        commitSha: "example-sha",
        stage: "prod",
        app: "my-app",
        redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
        registeredAt: 1,
      },
    ],
    isDone: true,
    continueCursor: "next",
  },
};

async function renderPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminHubClientsPage />
      </QueryClientProvider>,
    );
  });
  // The overview resolves after the first render, and the registrations start after it.
  for (const _ of [1, 2]) {
    await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  }
  return {
    rootElement,
    unmount: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

/** Types into a React-controlled input. */
function type(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector);
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (input === null || descriptor?.set === undefined) {
    throw new Error(`No input ${selector}.`);
  }
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AdminHubClientsPage", () => {
  beforeEach(() => {
    actionState.readOverview.mockReset();
    actionState.readOverview.mockResolvedValue(overview);
    actionState.listRegistrations.mockReset();
    actionState.listRegistrations.mockResolvedValue(registrations);
    actionState.changeBlock.mockReset();
    actionState.changeBlock.mockResolvedValue({ status: "on", changed: true });
  });

  it("says that moderation is off without the key", async () => {
    actionState.readOverview.mockResolvedValue({ status: "off" });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("Moderation is off");
      expect(actionState.listRegistrations).not.toHaveBeenCalled();
    } finally {
      await page.unmount();
    }
  });

  it("lists the counts, the registrations, the clients, the blocks, and their events", async () => {
    const page = await renderPage();
    try {
      const text = page.rootElement.textContent;
      expect(text).toContain("3 registrations in the last day, 1000+ in the last week.");
      expect(text).toContain("octo-org/octo-repo");
      expect(text).toContain("https://ideal-dolphin-15.convex.site/auth/hub/callback");
      expect(text).toContain("owner 65: Phishing page");
      expect(text).toContain("block owner 65: Phishing page");
      expect(text).toContain("gh-74-4c9a75cca717efb68c856f26ba825073");
      expect(text).toContain("calm-cow-456.eu-west-1.convex.site");
      expect(text).toContain("Never");
      expect(text).not.toContain("The newest");
      expect(actionState.listRegistrations).toHaveBeenCalledWith({ cursor: null });
    } finally {
      await page.unmount();
    }
  });

  it("says when the client list reached its limit", async () => {
    actionState.readOverview.mockResolvedValue({
      ...overview,
      clientList: { ...overview.clientList, limitReached: true },
    });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("The newest 1 clients.");
    } finally {
      await page.unmount();
    }
  });

  it("unblocks with the id and the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => {
        type(page.rootElement, "#admin-hub-clients-github-id", "74");
        type(page.rootElement, "#admin-hub-clients-reason", "Fixed");
      });
      const unblock = Array.from(page.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Unblock",
      );
      await act(async () => {
        unblock?.click();
        await Promise.resolve();
      });

      expect(actionState.changeBlock).toHaveBeenCalledWith({
        action: "unblock",
        kind: "repository",
        githubId: "74",
        reason: "Fixed",
      });
    } finally {
      await page.unmount();
    }
  });
});
