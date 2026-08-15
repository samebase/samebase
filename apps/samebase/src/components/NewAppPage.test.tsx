// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { NewAppPage } from "./NewAppPage";

vi.mock("@/components/useCloudflareBuildTokens", () => ({
  useCloudflareBuildTokenSelection: () => ({
    canWrite: true,
    selectedUuid: "build-token-1",
    selectionUnavailable: false,
    setRequestedUuid: vi.fn(),
  }),
  useCloudflareBuildTokens: () => ({
    data: {
      accountId: "account-acme-production",
      tokens: [{ name: "Workers Builds - 2026-08-14 01:54", uuid: "build-token-1" }],
    },
    error: null,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for component arguments.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
};

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  fallbackAction: vi.fn(async () => undefined),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? testState.fallbackAction,
    useQuery: (reference: Parameters<typeof actual.useQuery>[0]) => {
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.users.getConvexConnectionStatus)) {
        return {
          authMethod: "oauth",
          state: "connected",
          teamId: "team-acme-platform",
          teamSlug: "acme-platform",
        };
      }
      if (name === getFunctionName(api.users.getCloudflareConnectionStatus)) {
        return {
          accountId: "account-acme-production",
          accountName: "acme-production",
          authMethod: "oauth",
          state: "connected",
        };
      }
      return undefined;
    },
  };
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  if (!valueDescriptor || typeof valueDescriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  valueDescriptor.set.call(input, value);
}

function availableNames() {
  const available = { message: null, status: "available" as const, suggestion: null };
  return { cloudflare: available, convex: available, github: available };
}

describe("NewAppPage", () => {
  let mountedElement: HTMLDivElement | null;
  let mountedRoot: Root | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    testState.actions.clear();
    testState.fallbackAction.mockReset();
    testState.fallbackAction.mockResolvedValue(undefined);
    mountedElement = null;
    mountedRoot = null;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    if (mountedRoot !== null) {
      await act(async () => mountedRoot?.unmount());
    }
    queryClient.clear();
    mountedElement?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function mountPage(): Promise<HTMLDivElement> {
    mountedElement = document.createElement("div");
    document.body.append(mountedElement);
    mountedRoot = createRoot(mountedElement);
    await act(async () => {
      mountedRoot?.render(
        <QueryClientProvider client={queryClient}>
          <TestRouterProvider initialEntries={["/org/samebase/new-app"]}>
            <NewAppPage organization={organization} />
          </TestRouterProvider>
        </QueryClientProvider>,
      );
    });
    return mountedElement;
  }

  async function flushQueryUpdates(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("sends a blocked personal owner to the selected Providers page for authorization", () => {
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TestRouterProvider initialEntries={["/org/nicubunu/new-app"]}>
          <NewAppPage
            organization={{
              canCreateRepository: false,
              githubOwnerId: "123",
              githubOwnerLogin: "nicubunu",
              githubOwnerType: "user",
              organizationId: fakeOrganizationId("organization_nicubunu"),
              role: "owner",
            }}
          />
        </TestRouterProvider>
      </QueryClientProvider>,
    );

    expect(markup).toContain("Authorize repository creation for nicubunu");
    expect(markup).toContain('href="/org/nicubunu/providers"');
    expect(markup).toContain("Providers");
    expect(markup).toContain("API token");
    expect(markup).not.toContain("Install GitHub App");
  });

  it("checks only the latest provider names after the debounce", async () => {
    vi.useFakeTimers();
    const checkNames = vi.fn(async () => availableNames());
    testState.actions.set(
      getFunctionName(api.vault.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>("[aria-label='GitHub repo name']");
    if (!input) {
      throw new Error("GitHub repository name input was not rendered.");
    }

    setInputValue(input, "first-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    setInputValue(input, "second-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));

    await act(async () => vi.advanceTimersByTimeAsync(349));
    expect(checkNames).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Checking GitHub repository...");
    const pendingCreateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(pendingCreateButton?.disabled).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    await flushQueryUpdates();
    expect(checkNames).toHaveBeenCalledTimes(1);
    expect(checkNames).toHaveBeenCalledWith({
      organizationId: organization.organizationId,
      githubRepositoryName: "second-app",
      convexProjectName: "second-app",
      cloudflareWorkerName: "second-app",
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("shows a name-check error and keeps creation blocked", async () => {
    vi.useFakeTimers();
    const checkNames = vi.fn(async () => {
      throw new Error("Provider name check failed.");
    });
    testState.actions.set(
      getFunctionName(api.vault.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>("[aria-label='GitHub repo name']");
    if (!input) {
      throw new Error("GitHub repository name input was not rendered.");
    }

    setInputValue(input, "broken-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();

    expect(checkNames).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(container.textContent).toContain("Provider name check failed."));
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(true);
  });
});
