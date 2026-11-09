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
    lookupRepository: vi.fn(),
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
      if (name === getFunctionName(api.hubClients.moderation.lookupRepository)) {
        return testState.lookupRepository;
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
  issuer: "https://auth.example.test",
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
    // The hub has recorded owner 65 for this repository since the row was set.
    repositories: [{ repositoryId: "81", ownerId: "90", active: false, reason: "A team we know" }],
  },
  connectorGrants: {
    connectors: ["google", "github", "google-apps", "github-apps"],
    grants: [
      {
        repositoryId: "81",
        ownerId: "90",
        connector: "google",
        active: false,
        reason: "Our other app",
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
    testState.lookupRepository.mockReset();
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
        "https://auth.example.test: 3 registrations in the last day, 1000+ in the last week.",
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

  it("marks a client that no enrolled connector lets sign in, unless it is blocked", async () => {
    const [preview, development, production] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [
          // Blocked: the block says it already.
          { ...preview, usableConnectors: null },
          development,
          // The policy no longer gives `github` or `google`, and no grant does.
          { ...production, usableConnectors: [] },
        ],
      },
    });
    const page = await renderPage();
    try {
      const rows = rowTexts(page.rootElement);
      expect(rows[1]).toMatch(/^ProductionNo sign-inmy-app/);
      expect(rows[3]).toMatch(/^PR 12Blockedmy-app/);
      expect(rows[4]).toMatch(/^DevelopmentBlockedmy-app/);
      expect(page.rootElement.textContent.match(/No sign-in(?!s)/g)).toHaveLength(1);
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
        hub: "samebase",
        action: "unblock",
        kind: "repository",
        githubId: "74",
        reason: "Fixed",
      });
    } finally {
      await page.unmount();
    }
  });

  it("reads and changes the public hub after the switch, and drops the other hub's form", async () => {
    const page = await renderPage();
    try {
      expect(testState.readOverview).toHaveBeenLastCalledWith({ hub: "samebase" });
      await act(async () => button(page.rootElement, "Blocks 1").click());
      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-reason", "Typed for samebase"),
      );
      testState.readOverview.mockResolvedValue({ ...overview, issuer: "https://id.example.test" });
      await act(async () => button(page.rootElement, "Public hub").click());
      // The public hub's view mounts, asks, and renders the answer over a few ticks.
      await vi.waitFor(async () => {
        await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
        expect(page.rootElement.textContent).toContain("https://id.example.test: 3 registrations");
      });

      expect(testState.readOverview).toHaveBeenLastCalledWith({ hub: "public" });
      await act(async () => button(page.rootElement, "Blocks 1").click());
      expect(
        page.rootElement.querySelector<HTMLInputElement>("#admin-hub-clients-reason")?.value,
      ).toBe("");
      await act(async () => {
        type(page.rootElement, "#admin-hub-clients-github-id", "74");
        type(page.rootElement, "#admin-hub-clients-reason", "Spam");
      });
      await act(async () => {
        button(page.rootElement, "Block").click();
        await Promise.resolve();
      });
      expect(testState.changeBlock).toHaveBeenLastCalledWith({
        hub: "public",
        action: "block",
        kind: "repository",
        githubId: "74",
        reason: "Spam",
      });
    } finally {
      await page.unmount();
    }
  });

  it("skips the sign-in page for every app and removes a repository's exemption, each with the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => button(page.rootElement, "Sign-in page").click());
      const text = page.rootElement.textContent;
      expect(text).toContain("other-org/own: A team we know");
      // A row kept through a transfer covers no client, and the admin can still remove it.
      expect(text).toContain(
        "Bound to the owner with GitHub id 90. Not active: the hub recorded another owner.",
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
        hub: "samebase",
        target: { scope: "every_app" },
        skip: true,
        reason: "Launch week",
      });

      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-sign-in-page-change-reason", "Done"),
      );
      await act(async () => {
        button(page.rootElement, "Show").click();
        await Promise.resolve();
      });
      // The row's owner, so a row that no longer counts can go too.
      expect(testState.changeSignInPage).toHaveBeenLastCalledWith({
        hub: "samebase",
        target: { scope: "repository", repositoryId: "81", expectedOwnerId: "90" },
        skip: false,
        reason: "Done",
      });

      // A repository by name, which samebase.com resolves at the hub or on GitHub.
      testState.lookupRepository.mockResolvedValue({
        status: "found",
        repositoryId: "555",
        ownerId: "66",
        name: "octocat/Hello-World",
      });
      await act(async () =>
        type(page.rootElement, "[id$=-repository-name]", "octocat/hello-world"),
      );
      await act(async () => {
        button(page.rootElement, "Skip sign-in page").click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(testState.lookupRepository).toHaveBeenLastCalledWith({
        hub: "samebase",
        fullName: "octocat/hello-world",
      });
      expect(document.querySelector("[role=dialog]")?.textContent).toContain(
        "Skip the sign-in page for octocat/Hello-World?",
      );
      await act(async () => type(document.body, "#admin-hub-clients-sign-in-page-reason", "Ours"));
      await act(async () => {
        document
          .querySelector<HTMLFormElement>("#admin-hub-clients-sign-in-page-form")
          ?.requestSubmit();
        await Promise.resolve();
      });
      expect(testState.changeSignInPage).toHaveBeenLastCalledWith({
        hub: "samebase",
        target: { scope: "repository", repositoryId: "555", expectedOwnerId: "66" },
        skip: true,
        reason: "Ours",
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
      expect(dialog?.textContent).toContain("trusts the owner with GitHub id 65,");
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
        hub: "samebase",
        target: { scope: "repository", repositoryId: "74", expectedOwnerId: "65" },
        skip: true,
        reason: "Known",
      });
      expect(document.body.textContent).toContain(
        "The hub recorded another owner of the repository.",
      );
    } finally {
      await page.unmount();
    }
  });

  it("grants a private connector to a client's repository from its menu, bound to the recorded owner", async () => {
    // The hub's policy gives cl_test the public pair; the private pair needs a grant.
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
      expect(dialog?.textContent).toContain("production, previews, and development servers");
      expect(dialog?.textContent).toContain("gives this repository google-apps, github-apps");
      expect(dialog?.textContent).toContain("GitHub id 65");
      // One box per connector the policy does not give: the private pair, never the public one.
      const boxes = Array.from(dialog?.querySelectorAll("label") ?? []).filter(
        (label) => label.querySelector("[data-slot=checkbox]") !== null,
      );
      expect(boxes.map((label) => label.textContent)).toEqual(["google", "github"]);
      const google = boxes[0];
      await act(async () => {
        google.querySelector<HTMLElement>("[data-slot=checkbox]")?.click();
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
        hub: "samebase",
        repositoryId: "74",
        connector: "google",
        expectedOwnerId: "65",
        grant: true,
        reason: "Ours",
      });
    } finally {
      await page.unmount();
    }
  });

  /** Opens Connectors… of cl_test, whose policy gives the public pair, and checks `google`. */
  async function checkGoogleInConnectorsDialog() {
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
    const google = Array.from(document.querySelectorAll("[role=dialog] label")).find(
      (label) => label.textContent === "google",
    );
    await act(async () => {
      google?.querySelector<HTMLElement>("[data-slot=checkbox]")?.click();
    });
    await act(async () => type(document.body, "#admin-hub-clients-connectors-reason", "Ours"));
  }

  async function submitConnectorsDialog() {
    await act(async () => {
      document
        .querySelector<HTMLFormElement>("#admin-hub-clients-connectors-form")
        ?.requestSubmit();
      await Promise.resolve();
    });
  }

  it("reports a change as refused when moderation went off while the page was open", async () => {
    const [first, ...rest] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [{ ...first, policyConnectors: ["google-apps", "github-apps"] }, ...rest],
      },
    });
    testState.changeConnectorGrant.mockResolvedValueOnce({ status: "off" });
    const page = await renderPage();
    try {
      await checkGoogleInConnectorsDialog();
      await submitConnectorsDialog();
      await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));

      const text = page.rootElement.textContent;
      expect(text).toContain("Refused: google: Moderation is off: the hub changed nothing.");
      expect(text).not.toContain("Saved:");
    } finally {
      await page.unmount();
    }
  });

  it("keeps the connectors dialog open while its save runs", async () => {
    const [first, ...rest] = overview.clientList.clients;
    testState.readOverview.mockResolvedValue({
      ...overview,
      clientList: {
        ...overview.clientList,
        clients: [{ ...first, policyConnectors: ["google-apps", "github-apps"] }, ...rest],
      },
    });
    let finish: (answer: { status: "on"; result: "changed" }) => void = () => undefined;
    testState.changeConnectorGrant.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const page = await renderPage();
    try {
      await checkGoogleInConnectorsDialog();
      await submitConnectorsDialog();
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.querySelector("[role=dialog]")).not.toBeNull();

      await act(async () => {
        finish({ status: "on", result: "changed" });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(document.querySelector("[role=dialog]")).toBeNull();
      expect(page.rootElement.textContent).toContain("Saved: google.");
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

  it("lists the connector grants and revokes one with the row's owner and the reason", async () => {
    const page = await renderPage();
    try {
      await act(async () => button(page.rootElement, "Connector grants 1").click());
      const text = page.rootElement.textContent;
      expect(text).toContain("google for other-org/own: Our other app");
      expect(text).toContain("Not active: the hub recorded another owner.");
      expect(button(page.rootElement, "Revoke").disabled).toBe(true);

      await act(async () =>
        type(page.rootElement, "#admin-hub-clients-connector-grants-reason", "Done"),
      );
      await act(async () => {
        button(page.rootElement, "Revoke").click();
        await Promise.resolve();
      });
      expect(testState.changeConnectorGrant).toHaveBeenLastCalledWith({
        hub: "samebase",
        repositoryId: "81",
        connector: "google",
        expectedOwnerId: "90",
        grant: false,
        reason: "Done",
      });
    } finally {
      await page.unmount();
    }
  });

  it("asks for a repository's ids when neither the hub nor GitHub knows its name", async () => {
    testState.lookupRepository.mockResolvedValue({ status: "not_found" });
    const page = await renderPage();
    const submit = async () =>
      await act(async () => {
        button(page.rootElement, "Grant a repository").click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    try {
      await act(async () => button(page.rootElement, "Connector grants 1").click());
      expect(page.rootElement.querySelector("[id$=-repository-id]")).toBeNull();
      await act(async () => type(page.rootElement, "[id$=-repository-name]", "octo-org/secret"));
      await submit();
      expect(document.querySelector("[role=dialog]")).toBeNull();

      await act(async () => {
        type(page.rootElement, "[id$=-repository-id]", "555");
        type(page.rootElement, "[id$=-owner-id]", "66");
      });
      await submit();
      expect(testState.lookupRepository).toHaveBeenCalledTimes(1);
      // No client of the repository: every connector of the hub is a choice.
      expect(document.querySelector("[role=dialog]")?.textContent).toContain(
        "Connectors of octo-org/secret",
      );
      const google = Array.from(document.querySelectorAll("[role=dialog] label")).find(
        (label) => label.textContent === "google",
      );
      await act(async () => {
        google?.querySelector<HTMLElement>("[data-slot=checkbox]")?.click();
      });
      await act(async () => type(document.body, "#admin-hub-clients-connectors-reason", "Ours"));
      await submitConnectorsDialog();
      expect(testState.changeConnectorGrant).toHaveBeenLastCalledWith({
        hub: "samebase",
        repositoryId: "555",
        connector: "google",
        expectedOwnerId: "66",
        grant: true,
        reason: "Ours",
      });
    } finally {
      await page.unmount();
    }
  });
});
