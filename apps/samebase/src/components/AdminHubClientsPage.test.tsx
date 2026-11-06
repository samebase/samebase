// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminHubClientsPage } from "./AdminHubClientsPage";
import type { AdminHubClientsRouteSearch } from "@/routeSearch/adminHubClients";

const testState = vi.hoisted(() => {
  const search: AdminHubClientsRouteSearch = {};
  return { readOverview: vi.fn(), changeBlock: vi.fn(), navigate: vi.fn(), search };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.hubClients.moderation.readOverview)) {
        return testState.readOverview;
      }
      return testState.changeBlock;
    },
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    getRouteApi: () => ({
      useNavigate: () => testState.navigate,
      useSearch: () => testState.search,
    }),
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
        clientName: "pr-12",
        deploymentType: "preview",
        redirectUri: "https://calm-cow-456.eu-west-1.convex.site/auth/hub/callback",
        createdAt: 1,
        renewedAt: 2,
        lastSignInAt: null,
        removeAt: EXPIRY,
        registeredBy: {
          kind: "github",
          githubRepository: "octo-org/octo-repo",
          githubRepositoryDatabaseId: "74",
          githubOwnerId: "65",
          githubActorLogin: "renovate[bot]",
          app: "my-app",
        },
      },
      {
        clientId: "cl_laptop",
        appId: "gh-74-4c9a75cca717efb68c856f26ba825073-preview",
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
        clientName: "prod",
        deploymentType: "production",
        redirectUri: "https://samebase.com/auth/hub/callback",
        createdAt: 5,
        renewedAt: 6,
        lastSignInAt: 7,
        removeAt: null,
        registeredBy: {
          kind: "github",
          githubRepository: "other-org/own",
          githubRepositoryDatabaseId: "81",
          githubOwnerId: "90",
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

/** The text of each body row, cells joined by `|`. */
function rowTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("tbody tr"), (row) =>
    Array.from(row.querySelectorAll("td"), (cell) => cell.textContent).join("|"),
  );
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

function button(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );
  if (match === undefined) {
    throw new Error(`No button ${text}.`);
  }
  return match;
}

describe("AdminHubClientsPage", () => {
  beforeEach(() => {
    testState.readOverview.mockReset();
    testState.readOverview.mockResolvedValue(overview);
    testState.changeBlock.mockReset();
    testState.changeBlock.mockResolvedValue({ status: "on", changed: true });
    testState.navigate.mockReset();
    testState.search = {};
  });

  it("says that moderation is off without the key", async () => {
    testState.readOverview.mockResolvedValue({ status: "off" });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("Moderation is off");
    } finally {
      await page.unmount();
    }
  });

  it("groups the clients by repository, newest group first, production before previews", async () => {
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain(
        "3 registrations in the last day, 1000+ in the last week.",
      );
      const rows = rowTexts(page.rootElement);
      expect(rows).toHaveLength(5);
      expect(rows[0]).toMatch(/^other-org \/ own.*1 production.*Last sign-in/);
      expect(rows[1]).toMatch(/^Productionmy-app\|samebase\.com\|octocat\|.*\|Never\|$/);
      expect(rows[2]).toMatch(
        /^octo-org \/ octo-repo\s*Blocked.*1 preview.*1 development.*No sign-ins/,
      );
      expect(rows[3]).toMatch(
        /^PR 12Blockedmy-app\|calm-cow-456\.eu-west-1\.convex\.site\|renovate\[bot\]\|Never\|in \d+d\|$/,
      );
      expect(rows[4]).toMatch(
        /^DevelopmentBlockedmy-app\|127\.0\.0\.1:3211\|Laptop token\|Never\|/,
      );
      expect(page.rootElement.textContent).not.toContain("The newest");
    } finally {
      await page.unmount();
    }
  });

  it("shows a client's ids when its row is opened", async () => {
    const page = await renderPage();
    try {
      const row = Array.from(page.rootElement.querySelectorAll<HTMLElement>("tbody tr")).find(
        (candidate) => candidate.textContent.includes("127.0.0.1:3211"),
      );
      await act(async () => row?.click());
      const text = page.rootElement.textContent;
      expect(text).toContain("cl_laptop");
      expect(text).toContain("gh-74-4c9a75cca717efb68c856f26ba825073-preview");
      expect(text).toContain(`token of ${new Date(ISSUED_AT).toLocaleString()}`);
    } finally {
      await page.unmount();
    }
  });

  it("applies the search, the filters, and the grouping from the URL", async () => {
    testState.search = { q: "octo-repo", stage: "development,production", group: "none" };
    const page = await renderPage();
    try {
      const rows = rowTexts(page.rootElement);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatch(/^DevelopmentBlockedocto-repo · my-app\|127\.0\.0\.1:3211/);
    } finally {
      await page.unmount();
    }
  });

  it("says when no client matches and when the client list reached its limit", async () => {
    testState.search = { owner: "nobody" };
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: { ...overview.clientList, limitReached: true },
    });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("No clients match.");
    } finally {
      await page.unmount();
    }

    testState.search = {};
    const unfiltered = await renderPage();
    try {
      expect(unfiltered.rootElement.textContent).toContain("The newest 3 clients.");
    } finally {
      await unfiltered.unmount();
    }
  });

  it("lists the blocks and their events, and unblocks with the id and the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => button(page.rootElement, "Blocks 1").click());
      expect(page.rootElement.textContent).toContain("owner 65: Phishing page");
      expect(page.rootElement.textContent).toContain("block owner 65: Phishing page");
      await act(async () => {
        type(page.rootElement, "#admin-hub-clients-github-id", "74");
        type(page.rootElement, "#admin-hub-clients-reason", "Fixed");
      });
      await act(async () => {
        button(page.rootElement, "Unblock").click();
        await Promise.resolve();
      });

      expect(testState.changeBlock).toHaveBeenCalledWith({
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
