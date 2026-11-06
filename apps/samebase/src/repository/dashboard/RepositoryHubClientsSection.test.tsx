// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { HubClientsSection } from "./RepositoryHubClientsSection";

const actionState = vi.hoisted(() => ({
  readClients: vi.fn(),
  deleteClient: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      getFunctionName(reference) ===
      getFunctionName(api.hubClients.moderation.readClientsOfRepository)
        ? actionState.readClients
        : actionState.deleteClient,
  };
});

// A table id is a string at runtime; the test needs one of the repositories table.
// @ts-expect-error the literal stands for a document id of `repositories`.
const REPOSITORY_ID: Id<"repositories"> = "repository-1";

const registeredBy = {
  kind: "github",
  githubRepository: "octo-org/octo-repo",
  githubRepositoryDatabaseId: "74",
  githubOwnerId: "65",
  githubActorLogin: "octocat",
  app: "my-app",
} as const;

const production = {
  clientId: "cl_production",
  appId: "gh-74-app",
  clientName: "prod",
  deploymentType: "production",
  redirectUri: "https://my-app.example.com/auth/hub/callback",
  createdAt: 1,
  renewedAt: 2,
  lastSignInAt: null,
  removeAt: null,
  registeredBy,
} as const;

async function renderSection(canDelete: boolean) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <HubClientsSection canDelete={canDelete} repositoryId={REPOSITORY_ID} />
      </QueryClientProvider>,
    );
  });
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    rootElement,
    unmount: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
}

describe("HubClientsSection", () => {
  beforeEach(() => {
    actionState.readClients.mockReset();
    actionState.readClients.mockResolvedValue({ status: "on", clients: [production] });
    actionState.deleteClient.mockReset();
    actionState.deleteClient.mockResolvedValue({ status: "on", changed: true });
  });

  it("shows nothing while the hub's moderation is off", async () => {
    actionState.readClients.mockResolvedValue({ status: "off" });
    const section = await renderSection(true);
    try {
      expect(section.rootElement.textContent).toBe("");
    } finally {
      await section.unmount();
    }
  });

  it("lists each client with its app, stage, return address, and last sign-in", async () => {
    const section = await renderSection(false);
    try {
      const text = section.rootElement.textContent;
      expect(text).toContain("my-app, prod");
      expect(text).toContain(production.redirectUri);
      expect(text).toContain("No sign-in yet");
      expect(button("Delete")).toBeUndefined();
    } finally {
      await section.unmount();
    }
  });

  it("deletes a client after a confirmation that names what stops", async () => {
    const section = await renderSection(true);
    try {
      await act(async () => button("Delete")?.click());
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

      expect(actionState.deleteClient).toHaveBeenCalledWith({
        repositoryId: REPOSITORY_ID,
        clientId: "cl_production",
      });
      expect(actionState.readClients).toHaveBeenCalledTimes(2);
    } finally {
      await section.unmount();
    }
  });
});
