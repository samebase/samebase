// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OrganizationStacks } from "../../../shared/stateStoreStacks";
import type { ViewerOrganization } from "@/organization/context";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationStacksPage } from "./OrganizationStacksPage";

const testState = vi.hoisted(() => ({ readStacks: vi.fn() }));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useAction: () => testState.readStacks,
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
  role: "member",
};

const found: OrganizationStacks = {
  cloudflare: {
    account: "Octo account",
    read: {
      state: "found",
      stacks: [
        {
          name: "shop",
          read: "ok",
          stages: [
            {
              name: "prod",
              run: {
                version: 1,
                repository: "octo-org/shop",
                stackFile: "alchemy.run.ts",
                branch: "main",
                pullRequest: null,
                headCommit: "0123456789abcdef0123456789abcdef01234567",
                runUrl: "https://github.com/octo-org/shop/actions/runs/1",
                source: "github-actions",
                recordedAt: "2026-11-12T10:00:00.000Z",
              },
              resources: [
                { fqn: "shop/Worker", resourceType: "Cloudflare.Worker", status: "created" },
              ],
            },
          ],
        },
        { name: "broken", read: "failed" },
      ],
    },
  },
  convex: { team: null, read: { state: "not_connected" } },
};

async function renderPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <TestRouterProvider initialEntries={["/org/octo-org/stacks"]}>
          <OrganizationStacksPage organization={organization} />
        </TestRouterProvider>
      </QueryClientProvider>,
    );
  });
  // The read resolves after the first render.
  await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    rootElement,
    unmount: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

describe("OrganizationStacksPage", () => {
  beforeEach(() => {
    testState.readStacks.mockReset();
  });

  it("lists the stacks of each store and says why a store shows none", async () => {
    testState.readStacks.mockResolvedValue(found);
    const page = await renderPage();
    try {
      const text = page.rootElement.textContent;
      expect(testState.readStacks).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
      expect(text).toContain("Octo account");
      expect(text).toContain("shop/Worker");
      expect(text).toContain("Cloudflare.Worker");
      expect(text).toContain("octo-org/shop@0123456");
      expect(text).toContain("Samebase could not read this stack.");
      expect(text).toContain("Connect Convex on Providers");
    } finally {
      await page.unmount();
    }
  });

  it("sends an old Cloudflare grant to the Providers page to connect again", async () => {
    testState.readStacks.mockResolvedValue({
      ...found,
      cloudflare: { account: "Octo account", read: { state: "reconnect" } },
    });
    const page = await renderPage();
    try {
      expect(page.rootElement.textContent).toContain("allow Secrets Store Read and Edit");
      expect(
        Array.from(page.rootElement.querySelectorAll("a")).map((link) => link.getAttribute("href")),
      ).toContain("/org/octo-org/providers");
    } finally {
      await page.unmount();
    }
  });
});
