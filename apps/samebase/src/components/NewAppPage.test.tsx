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
import { CONVEX_US_EAST_REGION } from "../../shared/convexDeploymentRegions";
import { NewAppPage } from "./NewAppPage";

const cloudflareBuildTokenTestState = vi.hoisted(() => ({
  refetch: vi.fn(async () => undefined),
  state: "loaded",
}));

vi.mock("@/components/useCloudflareBuildTokens", () => ({
  useCloudflareBuildTokenSelection: () => ({
    canWrite: cloudflareBuildTokenTestState.state === "loaded",
    selectedUuid: cloudflareBuildTokenTestState.state === "loaded" ? "build-token-1" : "",
    selectionUnavailable: false,
    setRequestedUuid: vi.fn(),
  }),
  useCloudflareBuildTokens: () => {
    if (cloudflareBuildTokenTestState.state === "loading") {
      return {
        data: undefined,
        error: null,
        isFetching: true,
        isPending: true,
        refetch: cloudflareBuildTokenTestState.refetch,
      };
    }
    if (cloudflareBuildTokenTestState.state === "paused") {
      return {
        data: undefined,
        error: null,
        isFetching: false,
        isPending: true,
        refetch: cloudflareBuildTokenTestState.refetch,
      };
    }
    if (cloudflareBuildTokenTestState.state === "failed") {
      return {
        data: undefined,
        error: new Error("Could not load API tokens."),
        isFetching: false,
        isPending: false,
        refetch: cloudflareBuildTokenTestState.refetch,
      };
    }
    return {
      data: {
        accountId: "account-acme-production",
        lastUsedBuildTokenUuid:
          cloudflareBuildTokenTestState.state === "loaded" ? "build-token-1" : null,
        tokens:
          cloudflareBuildTokenTestState.state === "loaded"
            ? [{ name: "Workers Builds - 2026-08-14 01:54", uuid: "build-token-1" }]
            : [],
      },
      error: null,
      isFetching: false,
      isPending: false,
      refetch: cloudflareBuildTokenTestState.refetch,
    };
  },
}));

vi.mock("@/components/useConvexDeploymentRegions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/useConvexDeploymentRegions")>();
  return {
    ...actual,
    useConvexDeploymentRegions: () => ({
      data: {
        defaultRegion: "aws-us-east-1" as const,
        regions: [
          {
            available: true,
            displayName: "US East (N. Virginia)",
            name: "aws-us-east-1" as const,
          },
          {
            available: true,
            displayName: "EU West (Ireland)",
            name: "aws-eu-west-1" as const,
          },
        ],
      },
      error: null,
      isFetching: false,
      isPending: false,
      refetch: vi.fn(async () => undefined),
    }),
  };
});

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

function availableNames(cloudflareStatus: "available" | "not_required" = "available") {
  const available = { message: null, status: "available" as const, suggestion: null };
  return {
    cloudflare:
      cloudflareStatus === "available"
        ? available
        : { message: null, status: "not_required" as const, suggestion: null },
    convex: available,
    github: available,
  };
}

describe("NewAppPage", () => {
  let mountedElement: HTMLDivElement | null;
  let mountedRoot: Root | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    cloudflareBuildTokenTestState.refetch.mockReset();
    cloudflareBuildTokenTestState.refetch.mockResolvedValue(undefined);
    cloudflareBuildTokenTestState.state = "loaded";
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
      cloudflareBuildTokenUuid: "build-token-1",
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("starts from the saved region and keeps a one-time EU selection local to the app", async () => {
    const setDefaultRegion = vi.fn(async () => undefined);
    testState.actions.set(
      getFunctionName(api.convexDeploymentRegions.setDefault),
      setDefaultRegion,
    );
    const container = await mountPage();
    const label = [...container.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Convex production region",
    );
    const regionSelect = label ? document.getElementById(label.htmlFor) : null;
    if (!(regionSelect instanceof HTMLButtonElement)) {
      throw new Error("Convex production region selector was not rendered.");
    }

    expect(regionSelect.textContent).toContain("US East (N. Virginia)");
    await act(async () => regionSelect.click());
    const euOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (option) => option.textContent === "EU West (Ireland)",
    );
    if (!euOption) {
      throw new Error("EU West region option was not rendered.");
    }
    await act(async () => {
      euOption.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await act(async () => euOption.click());

    expect(regionSelect.textContent).toContain("EU West (Ireland)");
    expect(container.textContent).toContain("EU usage costs 1.3 times US usage.");
    expect(setDefaultRegion).not.toHaveBeenCalled();
  });

  it("hides the Worker field and creates an app after an empty token list is confirmed", async () => {
    vi.useFakeTimers();
    cloudflareBuildTokenTestState.state = "empty";
    const checkNames = vi.fn(async () => availableNames("not_required"));
    const createRepository = vi.fn(async () => undefined);
    testState.actions.set(
      getFunctionName(api.vault.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    testState.actions.set(getFunctionName(api.vault.actions.createRepository), createRepository);
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>("[aria-label='GitHub repo name']");
    if (!input) {
      throw new Error("GitHub repository name input was not rendered.");
    }

    expect(container.querySelector("[aria-label='Cloudflare Worker name']")).toBeNull();
    setInputValue(input, "no-token-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    expect(checkNames).toHaveBeenCalledWith({
      organizationId: organization.organizationId,
      githubRepositoryName: "no-token-app",
      convexProjectName: "no-token-app",
      cloudflareWorkerName: "no-token-app",
      cloudflareBuildTokenUuid: null,
    });

    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
    await act(async () => createButton?.click());
    await vi.waitFor(() =>
      expect(createRepository).toHaveBeenCalledWith({
        organizationId: organization.organizationId,
        name: "no-token-app",
        convexProjectName: "no-token-app",
        convexDeploymentRegion: CONVEX_US_EAST_REGION,
        cloudflareWorkerName: "no-token-app",
        cloudflareBuildTokenUuid: null,
        private: true,
      }),
    );
  });

  it.each([
    ["loading", "Loading API tokens..."],
    ["paused", "Loading API tokens..."],
    ["failed", "Could not load API tokens."],
  ])("keeps the %s API token state distinct and blocks creation", async (state, message) => {
    vi.useFakeTimers();
    cloudflareBuildTokenTestState.state = state;
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

    setInputValue(input, "blocked-token-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );

    expect(container.textContent).toContain(message);
    expect(container.textContent).not.toContain("You can create the app now");
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(true);
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
