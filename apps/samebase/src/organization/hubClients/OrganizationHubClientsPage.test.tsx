// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ViewerOrganization } from "@/organization/context";
import { OrganizationHubClientsPage } from "./OrganizationHubClientsPage";

const testState = vi.hoisted(() => ({
  readClients: vi.fn(),
  deleteClient: vi.fn(),
  accessKeys: ["access_dashboard"],
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      getFunctionName(reference) ===
      getFunctionName(api.hubClients.moderation.readClientsOfOrganization)
        ? testState.readClients
        : testState.deleteClient,
  };
});

vi.mock("@/routes/root.queries", () => ({
  rootQueries: {
    viewerAccess: {
      queryKey: ["viewer-access"],
      queryFn: async () => ({ accessKeys: testState.accessKeys }),
    },
  },
}));

// A table id is a string at runtime; the test needs one of the organizations table.
// @ts-expect-error the literal stands for a document id of `organizations`.
const ORGANIZATION_ID: Id<"organizations"> = "organization-1";

const organization: ViewerOrganization = {
  canCreateRepository: true,
  organizationId: ORGANIZATION_ID,
  githubOwnerId: "65",
  githubOwnerType: "organization",
  githubOwnerLogin: "octo-org",
  role: "owner",
};

const production = {
  clientId: "cl_production",
  appId: "gh-74-app",
  clientName: "prod",
  deploymentType: "production",
  redirectUris: ["https://my-app.example.com/auth/hub/callback"],
  createdAt: 1,
  renewedAt: 2,
  lastSignInAt: null,
  removeAt: null,
  registeredBy: {
    kind: "github",
    githubRepository: "octo-org/octo-repo",
    githubRepositoryDatabaseId: "74",
    githubOwnerId: "65",
    githubActorLogin: "octocat",
    app: "my-app",
  },
  connectors: ["github", "google"],
  ownerId: "65",
  signInPage: "shown",
  policyConnectors: ["github", "google"],
  usableConnectors: ["github", "google"],
  grantedConnectors: [],
} as const;

async function renderPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <OrganizationHubClientsPage
          organization={organization}
          search={{}}
          onSearchChange={() => undefined}
        />
      </QueryClientProvider>,
    );
  });
  // The clients and the access keys resolve after the first render.
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    rootElement,
    unmount: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

function buttonNamed(name: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === name || candidate.getAttribute("aria-label") === name,
  );
}

async function openClientMenu() {
  const trigger = buttonNamed("cl_production actions");
  await act(async () => {
    trigger?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    trigger?.click();
  });
}

describe("OrganizationHubClientsPage", () => {
  beforeEach(() => {
    testState.readClients.mockReset();
    testState.readClients.mockResolvedValue({ status: "on", clients: [production] });
    testState.deleteClient.mockReset();
    testState.deleteClient.mockResolvedValue({ status: "on", changed: true });
    testState.accessKeys = ["access_dashboard"];
  });

  it("lists the organization's clients without the owner filter or grouping", async () => {
    const page = await renderPage();
    try {
      const text = page.rootElement.textContent;
      expect(testState.readClients).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
      expect(text).toContain("octo-repo");
      expect(text).toContain("my-app");
      expect(text).toContain("my-app.example.com");
      expect(buttonNamed("Owner")).toBeUndefined();
      expect(buttonNamed("Stage")).toBeDefined();
    } finally {
      await page.unmount();
    }
  });

  it("says when this deployment does not read the hub", async () => {
    testState.readClients.mockResolvedValue({ status: "off" });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("does not read the identity hub");
    } finally {
      await page.unmount();
    }
  });

  it("offers no delete without the access to create apps", async () => {
    const page = await renderPage();
    try {
      await openClientMenu();
      expect(document.body.textContent).toContain("Copy client id");
      expect(document.body.textContent).not.toContain("Delete…");
    } finally {
      await page.unmount();
    }
  });

  it("deletes a client after a confirmation that names what stops", async () => {
    testState.accessKeys = ["access_dashboard", "access_app_create"];
    const page = await renderPage();
    try {
      await openClientMenu();
      const deleteItem = Array.from(document.querySelectorAll("[role=menuitem]")).find(
        (item) => item.textContent === "Delete…",
      );
      await act(async () => {
        deleteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.body.textContent).toContain(
        "Sign-in on https://my-app.example.com stops until the next production deploy of my-app gets a new client.",
      );

      const confirm = Array.from(document.querySelectorAll("[role=dialog] button")).find(
        (candidate) => candidate.textContent === "Delete",
      );
      await act(async () => {
        if (confirm instanceof HTMLButtonElement) {
          confirm.click();
        }
        await Promise.resolve();
      });

      expect(testState.deleteClient).toHaveBeenCalledWith({
        organizationId: ORGANIZATION_ID,
        clientId: "cl_production",
      });
      expect(testState.readClients).toHaveBeenCalledTimes(2);
    } finally {
      await page.unmount();
    }
  });
});
