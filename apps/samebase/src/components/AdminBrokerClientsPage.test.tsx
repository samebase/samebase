// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AdminBrokerClientsPage } from "./AdminBrokerClientsPage";

const testState = vi.hoisted(() => ({
  readLoginBroker: vi.fn(),
  readLoginSiteFiles: vi.fn(),
  changeLoginHostBlock: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.brokerClients.moderation.readLoginBroker)) {
        return testState.readLoginBroker;
      }
      if (name === getFunctionName(api.brokerClients.moderation.readLoginSiteFiles)) {
        return testState.readLoginSiteFiles;
      }
      return testState.changeLoginHostBlock;
    },
  };
});

async function renderPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminBrokerClientsPage />
      </QueryClientProvider>,
    );
  });
  // The site list resolves after the first render, and the site files after the site list.
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
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

function button(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  );
  if (match === undefined) {
    throw new Error(`No button ${text}.`);
  }
  return match;
}

describe("AdminBrokerClientsPage", () => {
  beforeEach(() => {
    testState.readLoginBroker.mockReset();
    testState.readLoginBroker.mockResolvedValue({ status: "off" });
    testState.readLoginSiteFiles.mockReset();
    testState.readLoginSiteFiles.mockResolvedValue({ status: "off" });
    testState.changeLoginHostBlock.mockReset();
  });

  it("says that moderation is off without the key", async () => {
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("Moderation is off");
    } finally {
      await page.unmount();
    }
  });

  it("blocks a typed host and unblocks a row's host at login.samebase.com, each control off while one runs", async () => {
    testState.readLoginBroker.mockResolvedValue({
      status: "on",
      siteList: {
        clients: [
          {
            clientId: "https://notes.example.test/oauth-client.json",
            host: "notes.example.test",
            createdAt: 1,
            lastSignInAt: null,
          },
          {
            clientId: "https://old-preview.example.test/oauth-client.json",
            host: "old-preview.example.test",
            createdAt: 0,
            lastSignInAt: null,
          },
        ],
        limitReached: true,
      },
      hostBlockList: {
        blocks: [{ host: "spam.example.test", createdAt: 2 }],
        limitReached: false,
      },
    });
    testState.readLoginSiteFiles.mockResolvedValue({
      status: "on",
      files: [
        {
          clientId: "https://notes.example.test/oauth-client.json",
          file: {
            status: "refused",
            reason: "The document's jwks holds private or symmetric key material.",
            json: '{\n  "client_id": "https://notes.example.test/oauth-client.json"\n}',
          },
        },
        {
          clientId: "https://old-preview.example.test/oauth-client.json",
          file: { status: "gone" },
        },
      ],
    });
    let finish: (answer: { status: "on"; changed: boolean }) => void = () => undefined;
    testState.changeLoginHostBlock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    testState.changeLoginHostBlock.mockResolvedValue({ status: "on", changed: true });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain(
        "https://notes.example.test/oauth-client.json",
      );
      expect(page.rootElement.textContent).toContain(
        "File refused: The document's jwks holds private or symmetric key material.",
      );
      // A refused file that is JSON still shows, folded, so the admin sees why.
      expect(page.rootElement.querySelector("details pre")?.textContent).toContain(
        '"client_id": "https://notes.example.test/oauth-client.json"',
      );
      expect(page.rootElement.textContent).toContain("The newest 2 sites.");
      // A site whose file is gone is folded away under "Gone (1)", not among the live sites.
      expect(
        [...page.rootElement.querySelectorAll("details")].find(
          (element) => element.querySelector(":scope > summary")?.textContent === "Gone (1)",
        )?.textContent,
      ).toContain("https://old-preview.example.test/oauth-client.json");
      await act(async () => button(page.rootElement, "Host blocks 1").click());

      await act(async () =>
        type(page.rootElement, "#admin-broker-clients-login-host", "other.example.test"),
      );
      await act(async () => {
        button(page.rootElement, "Block").click();
        await Promise.resolve();
      });
      expect(testState.changeLoginHostBlock).toHaveBeenLastCalledWith({
        action: "block",
        host: "other.example.test",
      });
      expect(button(page.rootElement, "Blocking...").disabled).toBe(true);
      expect(button(page.rootElement, "Unblock").disabled).toBe(true);

      await act(async () => {
        finish({ status: "on", changed: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => {
        button(page.rootElement, "Unblock").click();
        await Promise.resolve();
      });
      expect(testState.changeLoginHostBlock).toHaveBeenLastCalledWith({
        action: "unblock",
        host: "spam.example.test",
      });
    } finally {
      await page.unmount();
    }
  });
});
