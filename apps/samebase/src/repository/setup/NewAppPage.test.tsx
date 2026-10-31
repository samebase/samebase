// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  CONVEX_EU_WEST_REGION,
  CONVEX_US_EAST_REGION,
} from "../../../shared/convexDeploymentRegions";
import { NewAppPage } from "./NewAppPage";

const cloudflareBuildTokenTestState = vi.hoisted(() => ({
  refetch: vi.fn(async () => undefined),
  state: "loaded",
}));

vi.mock("@/repository/setup/useCloudflareBuildTokens", () => ({
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

const convexRegionTestState = vi.hoisted(() => {
  let defaultRegion: "aws-us-east-1" | "aws-eu-west-1" = "aws-us-east-1";

  return {
    get defaultRegion() {
      return defaultRegion;
    },
    set defaultRegion(value: "aws-us-east-1" | "aws-eu-west-1") {
      defaultRegion = value;
    },
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

/** The organization's Cloudflare connection; the Convex connection is always connected. */
const cloudflareConnectionTestState = vi.hoisted(() => {
  const state: { connection: unknown } = { connection: undefined };
  return state;
});

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
        return cloudflareConnectionTestState.connection;
      }
      if (name === getFunctionName(api.convexDeploymentRegions.getDefault)) {
        return convexRegionTestState.defaultRegion;
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
    convexRegionTestState.defaultRegion = CONVEX_US_EAST_REGION;
    cloudflareConnectionTestState.connection = {
      accountId: "account-acme-production",
      accountName: "acme-production",
      authMethod: "oauth",
      state: "connected",
    };
    testState.actions.clear();
    testState.fallbackAction.mockReset();
    testState.fallbackAction.mockResolvedValue(undefined);
    mountedElement = null;
    mountedRoot = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60 * 1000 } },
    });
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
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
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

  it("shows the final GitHub and Cloudflare names without blocking creation", async () => {
    vi.useFakeTimers();
    const checkNames = vi.fn(async () => availableNames());
    testState.actions.set(
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const repositoryInput = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
    const workerInput = container.querySelector<HTMLInputElement>(
      "[aria-label='Cloudflare Worker name']",
    );
    if (!repositoryInput || !workerInput) {
      throw new Error("Expected the New App name inputs.");
    }

    setInputValue(repositoryInput, " Field/Notes ");
    await act(async () => repositoryInput.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll("code")].map((element) => element.textContent),
      ).toContain("Field-Notes"),
    );
    const useRepositoryName = container.querySelector<HTMLButtonElement>(
      "[aria-label='Use Field-Notes']",
    );
    if (!useRepositoryName) {
      throw new Error("Expected the final GitHub repository name action.");
    }
    await act(async () =>
      useRepositoryName.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(repositoryInput.value).toBe("Field-Notes");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.querySelector("[aria-label='Use Field-Notes']")).toBeNull(),
    );

    setInputValue(workerInput, "Worker_Name");
    await act(async () => workerInput.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll("code")].map((element) => element.textContent),
      ).toContain("worker-name"),
    );
    const useWorkerName = container.querySelector<HTMLButtonElement>(
      "[aria-label='Use worker-name']",
    );
    if (!useWorkerName) {
      throw new Error("Expected the final Cloudflare Worker name action.");
    }
    await act(async () => useWorkerName.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(workerInput.value).toBe("worker-name");
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.querySelector("[aria-label='Use worker-name']")).toBeNull(),
    );

    expect(checkNames).toHaveBeenLastCalledWith({
      organizationId: organization.organizationId,
      githubRepositoryName: "Field-Notes",
      convexProjectName: "field-notes",
      cloudflareWorkerName: "worker-name",
      cloudflareBuildTokenUuid: "build-token-1",
    });
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("moves a provider create race into the affected name field", async () => {
    vi.useFakeTimers();
    const checkNames = vi.fn(async () => ({
      ...availableNames(),
      convex: {
        status: "taken" as const,
        message: "Convex project name already exists.",
        suggestion: "race-app-2",
      },
    }));
    const createRepository = vi.fn(async () => {
      throw new ConvexError("A Convex project named race-app-2 already exists.");
    });
    testState.actions.set(
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    testState.actions.set(getFunctionName(api.repository.create), createRepository);
    const container = await mountPage();
    const repositoryInput = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
    if (!repositoryInput) {
      throw new Error("GitHub repository name input was not rendered.");
    }

    setInputValue(repositoryInput, "race-app");
    await act(async () => repositoryInput.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    expect(container.textContent).toContain("race-app already exists; using race-app-2.");

    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
    await act(async () => createButton?.click());

    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        "A Convex project named race-app-2 already exists. Choose another name.",
      ),
    );
    expect(createRepository).toHaveBeenCalledWith(
      expect.objectContaining({ convexProjectName: "race-app-2" }),
    );
    expect(createButton?.disabled).toBe(true);
    const useSuggestionButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Use race-app-3",
    );
    if (!useSuggestionButton) {
      throw new Error("Convex project name suggestion was not rendered.");
    }
    await act(async () => useSuggestionButton.click());

    const convexProjectInput = container.querySelector<HTMLInputElement>(
      "[aria-label='Convex project name']",
    );
    expect(convexProjectInput?.value).toBe("race-app-3");
    expect(container.textContent).not.toContain(
      "A Convex project named race-app-2 already exists. Choose another name.",
    );
  });

  it("starts from the saved EU region and offers only US and EU choices", async () => {
    convexRegionTestState.defaultRegion = CONVEX_EU_WEST_REGION;
    const container = await mountPage();
    await vi.waitFor(() =>
      expect(document.getElementById("new-app-convex-production-region")).toBeInstanceOf(
        HTMLButtonElement,
      ),
    );
    const label = [...container.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Convex production region",
    );
    const regionSelect = label ? document.getElementById(label.htmlFor) : null;
    if (!(regionSelect instanceof HTMLButtonElement)) {
      throw new Error("Convex production region selector was not rendered.");
    }

    expect(regionSelect.textContent).toContain("EU West (Ireland)");
    expect(container.textContent).toContain("EU usage costs 1.3 times US usage.");
    await act(async () => regionSelect.click());
    expect(
      [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
        (option) => option.textContent,
      ),
    ).toEqual(["🇺🇸 US East (N. Virginia)", "🇪🇺 EU West (Ireland)"]);
    const usOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (option) => option.textContent === "🇺🇸 US East (N. Virginia)",
    );
    if (!usOption) {
      throw new Error("US East region option was not rendered.");
    }
    await act(async () => {
      usOption.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await act(async () => usOption.click());

    expect(regionSelect.textContent).toContain("US East (N. Virginia)");
  });

  async function openSetupOptions(container: HTMLElement): Promise<HTMLElement[]> {
    const label = [...container.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Setup",
    );
    const setupSelect = label ? document.getElementById(label.htmlFor) : null;
    if (!(setupSelect instanceof HTMLButtonElement)) {
      throw new Error("Setup selector was not rendered.");
    }
    expect(setupSelect.textContent).toContain("Set up by Samebase");
    await act(async () => setupSelect.click());
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  }

  async function chooseGitHubActionsSetup(container: HTMLElement): Promise<void> {
    const actionsOption = (await openSetupOptions(container)).at(1);
    if (!actionsOption) {
      throw new Error("GitHub Actions setup option was not rendered.");
    }
    expect(actionsOption.textContent).toBe(
      "Set up by GitHub Actions in the repository (experimental)",
    );
    await act(async () => {
      actionsOption.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await act(async () => actionsOption.click());
  }

  it.each([
    {
      name: "a connected Cloudflare account",
      cloudflare: {
        accountId: "account-acme-production",
        accountName: "acme-production",
        authMethod: "oauth",
        state: "connected",
      },
    },
    { name: "no Cloudflare connection", cloudflare: { state: "not_configured" } },
  ])(
    "creates an app that GitHub Actions set up, with $name and no CI tokens",
    async ({ cloudflare }) => {
      vi.useFakeTimers();
      cloudflareConnectionTestState.connection = cloudflare;
      const checkNames = vi.fn(async () => availableNames("not_required"));
      const createRepository = vi.fn(async () => undefined);
      testState.actions.set(
        getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
        checkNames,
      );
      testState.actions.set(getFunctionName(api.repository.create), createRepository);
      const container = await mountPage();

      await chooseGitHubActionsSetup(container);
      expect(container.textContent).toContain(
        "Samebase saves the organization's Convex token as the repository secret CONVEX_ACCESS_TOKEN.",
      );
      expect(container.textContent).not.toContain("Cloudflare");
      expect(container.querySelector("[aria-label='Convex project name']")).toBeNull();
      expect(container.querySelector("[aria-label='Cloudflare Worker name']")).toBeNull();
      expect(document.getElementById("new-app-convex-production-region")).toBeNull();

      const input = container.querySelector<HTMLInputElement>(
        "[aria-label='GitHub repository name']",
      );
      if (!input) {
        throw new Error("GitHub repository name input was not rendered.");
      }
      setInputValue(input, "actions-app");
      await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
      await act(async () => vi.advanceTimersByTimeAsync(350));
      await flushQueryUpdates();
      await vi.waitFor(() =>
        expect(container.textContent).toContain("GitHub repository name is available."),
      );
      expect(checkNames).toHaveBeenLastCalledWith({
        organizationId: organization.organizationId,
        githubRepositoryName: "actions-app",
        convexProjectName: "actions-app",
        cloudflareWorkerName: "actions-app",
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
          githubRepositoryName: "actions-app",
          convexProjectName: "actions-app",
          cloudflareWorkerName: "actions-app",
          cloudflareBuildTokenUuid: null,
          private: true,
          provisioning: "repository_actions",
        }),
      );
    },
  );

  it("keeps the Cloudflare requirement of the Samebase setup", async () => {
    cloudflareConnectionTestState.connection = { state: "not_configured" };
    const container = await mountPage();

    expect(container.textContent).toContain(
      "Configure Cloudflare in Providers before creating an app.",
    );
    expect(
      container.querySelector<HTMLInputElement>("[aria-label='GitHub repository name']")?.disabled,
    ).toBe(true);
  });

  it("hides the Worker field and creates an app after an empty token list is confirmed", async () => {
    vi.useFakeTimers();
    cloudflareBuildTokenTestState.state = "empty";
    const checkNames = vi.fn(async () => availableNames("not_required"));
    const createRepository = vi.fn(async () => undefined);
    testState.actions.set(
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    testState.actions.set(getFunctionName(api.repository.create), createRepository);
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
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
        githubRepositoryName: "no-token-app",
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
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
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
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    const container = await mountPage();
    const input = container.querySelector<HTMLInputElement>(
      "[aria-label='GitHub repository name']",
    );
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
