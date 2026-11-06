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
      return actionState.changeBlock;
    },
  };
});

const EXPIRY = 1_801_209_600_000;
const ISSUED_AT = 1_800_000_000_000;

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
        firstParty: false,
        clientName: "pr-12",
        deploymentType: "preview",
        redirectUri: "https://calm-cow-456.eu-west-1.convex.site/auth/hub/callback",
        createdAt: 1,
        renewedAt: 2,
        lastSignInAt: 3,
        removeAt: EXPIRY,
        registeredBy: {
          kind: "github",
          githubRepository: "octo-org/octo-repo",
          githubRepositoryDatabaseId: "74",
          githubOwnerId: "65",
          githubActorLogin: "octocat",
          app: "my-app",
        },
      },
      {
        clientId: "cl_laptop",
        appId: "gh-74-4c9a75cca717efb68c856f26ba825073-preview",
        firstParty: false,
        clientName: "development",
        deploymentType: "development",
        redirectUri: "http://127.0.0.1:3211/auth/hub/callback",
        createdAt: 1,
        renewedAt: 2,
        lastSignInAt: null,
        removeAt: EXPIRY,
        registeredBy: {
          kind: "initial_access_token",
          githubRepository: "octo-org/octo-repo",
          githubRepositoryDatabaseId: "74",
          githubOwnerId: "65",
          app: "my-app",
          issuedAt: ISSUED_AT,
        },
      },
      {
        clientId: "cl_production",
        appId: "gh-81-4c9a75cca717efb68c856f26ba825073",
        firstParty: true,
        clientName: "prod",
        deploymentType: "production",
        redirectUri: "https://samebase.com/auth/hub/callback",
        createdAt: 1,
        renewedAt: 2,
        lastSignInAt: 3,
        removeAt: null,
        registeredBy: {
          kind: "github",
          githubRepository: "octo-org/own",
          githubRepositoryDatabaseId: "81",
          githubOwnerId: "65",
          githubActorLogin: "octocat",
          app: "my-app",
        },
      },
    ],
    limitReached: false,
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
  // The overview resolves after the first render.
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    rootElement,
    unmount: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

/** The cell texts of the client row with `clientId`. */
function cellsOf(container: HTMLElement, clientId: string) {
  const row = Array.from(container.querySelectorAll("tr")).find((candidate) =>
    candidate.textContent.includes(clientId),
  );
  return Array.from(row?.cells ?? [], (cell) => cell.textContent);
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
    actionState.changeBlock.mockReset();
    actionState.changeBlock.mockResolvedValue({ status: "on", changed: true });
  });

  it("says that moderation is off without the key", async () => {
    actionState.readOverview.mockResolvedValue({ status: "off" });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("Moderation is off");
    } finally {
      await page.unmount();
    }
  });

  it("lists the counts, the clients with who made them, the blocks, and their events", async () => {
    const page = await renderPage();
    try {
      const text = page.rootElement.textContent;
      expect(text).toContain("3 registrations in the last day, 1000+ in the last week.");
      expect(text).toContain("owner 65: Phishing page");
      expect(text).toContain("block owner 65: Phishing page");
      const time = (value: number) => new Date(value).toLocaleString();
      expect(cellsOf(page.rootElement, "cl_test")).toEqual([
        time(1),
        "octo-org/octo-repo 74",
        "65",
        "octocat",
        "my-app gh-74-4c9a75cca717efb68c856f26ba825073",
        "pr-12 cl_test",
        "preview",
        "https://calm-cow-456.eu-west-1.convex.site/auth/hub/callback",
        time(EXPIRY),
        time(2),
        time(3),
      ]);
      expect(cellsOf(page.rootElement, "cl_laptop")).toEqual([
        time(1),
        "octo-org/octo-repo 74",
        "65",
        `Laptop, token of ${time(ISSUED_AT)}`,
        "my-app gh-74-4c9a75cca717efb68c856f26ba825073-preview",
        "development cl_laptop",
        "development",
        "http://127.0.0.1:3211/auth/hub/callback",
        time(EXPIRY),
        time(2),
        "Never",
      ]);
      expect(cellsOf(page.rootElement, "cl_production")).toEqual([
        time(1),
        "octo-org/own 81",
        "65",
        "octocat",
        "my-app (own) gh-81-4c9a75cca717efb68c856f26ba825073",
        "prod cl_production",
        "production",
        "https://samebase.com/auth/hub/callback",
        "Never",
        time(2),
        time(3),
      ]);
      expect(text).not.toContain("The newest");
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
      expect(page.rootElement.textContent).toContain("The newest 3 clients.");
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
