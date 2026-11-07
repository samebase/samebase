// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminHubClientsPage } from "./AdminHubClientsPage";
import type { HubClientsRouteSearch } from "@/routeSearch/hubClients";

const testState = vi.hoisted(() => {
  const search: HubClientsRouteSearch = {};
  return {
    readOverview: vi.fn(),
    changeBlock: vi.fn(),
    changeSignInPage: vi.fn(),
    changeConnectorGrant: vi.fn(),
    navigate: vi.fn(),
    search,
  };
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
      if (name === getFunctionName(api.hubClients.moderation.changeSignInPage)) {
        return testState.changeSignInPage;
      }
      if (name === getFunctionName(api.hubClients.moderation.changeConnectorGrant)) {
        return testState.changeConnectorGrant;
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
        connectors: ["github", "google"],
        ownerId: "65",
        signInPage: "shown",
        policyConnectors: ["github", "google"],
        usableConnectors: ["github", "google"],
        grantedConnectors: [],
      },
      {
        clientId: "cl_development",
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
        connectors: ["github", "google"],
        ownerId: "65",
        signInPage: "shown",
        policyConnectors: ["github", "google"],
        usableConnectors: ["github", "google"],
        grantedConnectors: [],
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
        connectors: ["github", "google"],
        ownerId: "65",
        signInPage: "shown",
        policyConnectors: ["github", "google"],
        usableConnectors: ["github", "google"],
        grantedConnectors: [],
      },
    ],
    limitReached: false,
  },
  signInPage: {
    everyApp: null,
    apps: [
      {
        appId: "gh-81-4c9a75cca717efb68c856f26ba825073",
        ownerId: "90",
        // The hub has recorded owner 65 for this repository since the row was set.
        active: false,
        reason: "A team we know",
        repository: "other-org/own",
        app: "my-app",
        production: true,
      },
    ],
  },
  connectorGrants: {
    connectors: ["google", "github", "google-apps", "github-apps"],
    grants: [
      {
        appId: "gh-81-4c9a75cca717efb68c856f26ba825073",
        connector: "google",
        ownerId: "90",
        active: false,
        reason: "Our other app",
        repository: "other-org/own",
        app: "my-app",
        production: true,
      },
    ],
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
    testState.changeSignInPage.mockReset();
    testState.changeSignInPage.mockResolvedValue({ status: "on", result: "changed" });
    testState.changeConnectorGrant.mockReset();
    testState.changeConnectorGrant.mockResolvedValue({ status: "on", result: "changed" });
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
      // The first cell ends with the line that narrow panes show in place of the other columns.
      expect(rows[1]).toMatch(
        /^Productionmy-appsamebase\.com · signed in \S+ ago\|samebase\.com\|octocat\|.*\|Never\|$/,
      );
      expect(rows[2]).toMatch(
        /^octo-org \/ octo-repo\s*Blocked.*1 preview.*1 development.*No sign-ins/,
      );
      expect(rows[3]).toMatch(
        /^PR 12Blockedmy-appcalm-cow-456\.eu-west-1\.convex\.site · never signed in\|calm-cow-456\.eu-west-1\.convex\.site\|renovate\[bot\]\|Never\|in \d+d\|$/,
      );
      expect(rows[4]).toMatch(
        /^DevelopmentBlockedmy-app127\.0\.0\.1:3211 · never signed in\|127\.0\.0\.1:3211\|Development\|Never\|/,
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
      expect(text).toContain("cl_development");
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
      expect(rows[0]).toMatch(/^DevelopmentBlockedocto-repo · my-app[^|]*\|127\.0\.0\.1:3211/);
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

  it("skips the sign-in page for every app and removes an app's exemption, each with the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => button(page.rootElement, "Sign-in page").click());
      const text = page.rootElement.textContent;
      expect(text).toContain("other-org/own my-app, production: A team we know");
      // A row kept through a transfer covers no client, and the admin can still remove it.
      expect(text).toContain(
        "Bound to the owner with GitHub id 90. Not active: the repository has another owner now.",
      );
      // Nothing goes to the hub without a reason.
      expect(button(page.rootElement, "Skip the sign-in page for every app").disabled).toBe(true);

      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-sign-in-page-change-reason", "Launch week"),
      );
      await act(async () => {
        button(page.rootElement, "Skip the sign-in page for every app").click();
        await Promise.resolve();
      });
      expect(testState.changeSignInPage).toHaveBeenLastCalledWith({
        target: { scope: "every_app" },
        skip: true,
        reason: "Launch week",
      });

      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-sign-in-page-change-reason", "Done"),
      );
      await act(async () => {
        button(page.rootElement, "Remove").click();
        await Promise.resolve();
      });
      // The row's owner, so a row that no longer counts can go too.
      expect(testState.changeSignInPage).toHaveBeenLastCalledWith({
        target: {
          scope: "app",
          appId: "gh-81-4c9a75cca717efb68c856f26ba825073",
          expectedOwnerId: "90",
        },
        skip: false,
        reason: "Done",
      });
    } finally {
      await page.unmount();
    }
  });

  it("binds a skip to the recorded owner, names it, and says when the repository moved on", async () => {
    // cl_test was registered by owner 11; the hub has recorded owner 65 since.
    const [first, ...rest] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [
          { ...first, registeredBy: { ...first.registeredBy, githubOwnerId: "11" } },
          ...rest,
        ],
      },
    });
    testState.changeSignInPage.mockResolvedValue({ status: "on", result: "owner_changed" });
    const page = await renderPage();
    try {
      const trigger = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.getAttribute("aria-label") === "cl_test actions",
      );
      await act(async () => {
        trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        trigger?.click();
      });
      const skip = Array.from(document.querySelectorAll("[role=menuitem]")).find(
        (item) => item.textContent === "Skip the sign-in page…",
      );
      await act(async () => {
        skip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const dialog = document.querySelector("[role=dialog]");
      expect(dialog?.textContent).toContain("recorded, GitHub id 65,");
      expect(dialog?.textContent).toContain("registered by an earlier owner, GitHub id 11");

      await act(async () => type(document.body, "#admin-hub-clients-sign-in-page-reason", "Known"));
      await act(async () => {
        document
          .querySelector<HTMLFormElement>("#admin-hub-clients-sign-in-page-form")
          ?.requestSubmit();
        await Promise.resolve();
      });
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
      expect(testState.changeSignInPage).toHaveBeenLastCalledWith({
        target: {
          scope: "app",
          appId: "gh-74-4c9a75cca717efb68c856f26ba825073",
          expectedOwnerId: "65",
        },
        skip: true,
        reason: "Known",
      });
      expect(document.body.textContent).toContain("The repository has another owner now.");
    } finally {
      await page.unmount();
    }
  });

  it("grants a private connector to a client's app from its menu, bound to the recorded owner", async () => {
    // The hub's policy gives cl_test's app the public pair; the private pair needs a grant.
    const [first, ...rest] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [{ ...first, policyConnectors: ["google-apps", "github-apps"] }, ...rest],
      },
    });
    const page = await renderPage();
    try {
      const trigger = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.getAttribute("aria-label") === "cl_test actions",
      );
      await act(async () => {
        trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        trigger?.click();
      });
      const connectors = Array.from(document.querySelectorAll("[role=menuitem]")).find(
        (item) => item.textContent === "Connectors…",
      );
      await act(async () => {
        connectors?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const dialog = document.querySelector("[role=dialog]");
      expect(dialog?.textContent).toContain("gives this app google-apps, github-apps");
      expect(dialog?.textContent).toContain("GitHub id 65");
      const google = Array.from(dialog?.querySelectorAll("label") ?? []).find(
        (label) => label.textContent === "google",
      );
      expect(dialog?.textContent).toContain("github");
      await act(async () => {
        google?.querySelector<HTMLElement>("[data-slot=checkbox]")?.click();
      });
      await act(async () => type(document.body, "#admin-hub-clients-connectors-reason", "Ours"));
      await act(async () => {
        document
          .querySelector<HTMLFormElement>("#admin-hub-clients-connectors-form")
          ?.requestSubmit();
        await Promise.resolve();
      });
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
      expect(testState.changeConnectorGrant).toHaveBeenCalledTimes(1);
      expect(testState.changeConnectorGrant).toHaveBeenLastCalledWith({
        appId: "gh-74-4c9a75cca717efb68c856f26ba825073",
        connector: "google",
        expectedOwnerId: "65",
        grant: true,
        reason: "Ours",
      });
    } finally {
      await page.unmount();
    }
  });

  it("keeps the report of a partial save when the reload after it fails", async () => {
    const [first, ...rest] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [{ ...first, policyConnectors: ["google-apps", "github-apps"] }, ...rest],
      },
    });
    testState.changeConnectorGrant
      .mockResolvedValueOnce({ status: "on", result: "changed" })
      .mockRejectedValueOnce(new Error("The hub is down"));
    const page = await renderPage();
    try {
      const trigger = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.getAttribute("aria-label") === "cl_test actions",
      );
      await act(async () => {
        trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        trigger?.click();
      });
      const connectors = Array.from(document.querySelectorAll("[role=menuitem]")).find(
        (item) => item.textContent === "Connectors…",
      );
      await act(async () => {
        connectors?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const dialog = document.querySelector("[role=dialog]");
      for (const name of ["google", "github"]) {
        const label = Array.from(dialog?.querySelectorAll("label") ?? []).find(
          (candidate) => candidate.textContent === name,
        );
        await act(async () => {
          label?.querySelector<HTMLElement>("[data-slot=checkbox]")?.click();
        });
      }
      await act(async () => type(document.body, "#admin-hub-clients-connectors-reason", "Ours"));
      const reads = testState.readOverview.mock.calls.length;
      // The reload after the save fails: the overview, and the dialog with it, go away.
      testState.readOverview.mockRejectedValueOnce(new Error("The hub is down"));
      await act(async () => {
        document
          .querySelector<HTMLFormElement>("#admin-hub-clients-connectors-form")
          ?.requestSubmit();
        await Promise.resolve();
      });
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

      expect(testState.changeConnectorGrant).toHaveBeenCalledTimes(2);
      expect(testState.readOverview.mock.calls.length).toBeGreaterThan(reads);
      const text = page.rootElement.textContent;
      expect(text).toContain("Saved: google. Refused: github: The hub refused the change.");
      expect(text).toContain("Could not reach the identity hub.");
    } finally {
      await page.unmount();
    }
  });

  it("lists the connector grants and removes one with the row's owner and the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => button(page.rootElement, "Connector grants 1").click());
      const text = page.rootElement.textContent;
      expect(text).toContain("google for other-org/own my-app, production: Our other app");
      expect(text).toContain("Not active: the repository has another owner now.");
      expect(button(page.rootElement, "Remove").disabled).toBe(true);

      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-connector-grants-reason", "Done"),
      );
      await act(async () => {
        button(page.rootElement, "Remove").click();
        await Promise.resolve();
      });
      expect(testState.changeConnectorGrant).toHaveBeenLastCalledWith({
        appId: "gh-81-4c9a75cca717efb68c856f26ba825073",
        connector: "google",
        expectedOwnerId: "90",
        grant: false,
        reason: "Done",
      });
    } finally {
      await page.unmount();
    }
  });
});
