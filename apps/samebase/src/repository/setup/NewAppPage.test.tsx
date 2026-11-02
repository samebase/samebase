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
import type { ViewerOrganization } from "@/organization/context";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { NewAppPage } from "./NewAppPage";

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for component arguments.
  return value;
}

const organization: ViewerOrganization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization",
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner",
};

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  fallbackAction: vi.fn(async () => undefined),
}));

/** The organization's Convex connection. */
const convexConnectionTestState = vi.hoisted(() => {
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
        return convexConnectionTestState.connection;
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
  return { convex: available, github: available };
}

describe("NewAppPage", () => {
  let mountedElement: HTMLDivElement | null;
  let mountedRoot: Root | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    convexConnectionTestState.connection = {
      authMethod: "oauth",
      state: "connected",
      teamId: "team-acme-platform",
      teamSlug: "acme-platform",
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

  async function mountPage(pageOrganization = organization): Promise<HTMLDivElement> {
    mountedElement = document.createElement("div");
    document.body.append(mountedElement);
    mountedRoot = createRoot(mountedElement);
    await act(async () => {
      mountedRoot?.render(
        <QueryClientProvider client={queryClient}>
          <TestRouterProvider initialEntries={["/org/samebase/new-app"]}>
            <NewAppPage organization={pageOrganization} />
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
    expect(markup).not.toContain("Install GitHub App");
  });

  it("disables the form for a member, with the reason", async () => {
    const checkNames = vi.fn(async () => availableNames());
    testState.actions.set(
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );

    const container = await mountPage({ ...organization, role: "member" });

    expect(container.textContent).toContain("Only an organization owner can create an app.");
    expect(
      container.querySelector<HTMLInputElement>("[aria-label='GitHub repository name']")?.disabled,
    ).toBe(true);
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(true);
    expect(checkNames).not.toHaveBeenCalled();
  });

  it("keeps the form enabled for an owner, without the member reason", async () => {
    const container = await mountPage();

    expect(container.textContent).not.toContain("Only an organization owner can create an app.");
    expect(
      container.querySelector<HTMLInputElement>("[aria-label='GitHub repository name']")?.disabled,
    ).toBe(false);
  });

  it("asks for a Convex connection before an app can be created", async () => {
    convexConnectionTestState.connection = { state: "not_configured" };
    const container = await mountPage();

    expect(container.textContent).toContain(
      "Configure Convex in Providers before creating an app.",
    );
    expect(
      container.querySelector<HTMLInputElement>("[aria-label='GitHub repository name']")?.disabled,
    ).toBe(true);
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
    });
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("shows the final GitHub name without blocking creation", async () => {
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
    if (!repositoryInput) {
      throw new Error("Expected the New App name input.");
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

    expect(checkNames).toHaveBeenLastCalledWith({
      organizationId: organization.organizationId,
      githubRepositoryName: "Field-Notes",
      convexProjectName: "field-notes",
    });
    const createButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "New App",
    );
    expect(createButton?.disabled).toBe(false);
  });

  it("creates an app that GitHub Actions set up, with no Cloudflare and no CI tokens", async () => {
    vi.useFakeTimers();
    const checkNames = vi.fn(async () => availableNames());
    const createRepository = vi.fn(async () => undefined);
    testState.actions.set(
      getFunctionName(api.repository.actions.checkCreateRepositoryResourceNames),
      checkNames,
    );
    testState.actions.set(getFunctionName(api.repository.create), createRepository);
    const container = await mountPage();

    expect(container.textContent).toContain("Connected to team acme-platform.");
    expect(container.textContent).toContain(
      "Samebase saves the organization's Convex token as the repository secret CONVEX_ACCESS_TOKEN.",
    );
    expect(container.textContent).not.toContain("Cloudflare");
    expect(container.textContent).not.toContain("Set up by Samebase");
    expect(container.querySelector("[aria-label='Convex project name']")).toBeNull();
    expect(container.querySelector("[aria-label='Cloudflare Worker name']")).toBeNull();
    expect(container.querySelector("[role='combobox']")).toBeNull();

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
        private: true,
      }),
    );
  });

  it("shows the server's refusal when a provider name was taken at submit", async () => {
    vi.useFakeTimers();
    const refusal =
      "A Convex project named race-app already exists, and the GitHub Actions of the repository would use that name. Choose another repository name.";
    const checkNames = vi.fn(async () => availableNames());
    const createRepository = vi.fn(async () => {
      throw new ConvexError(refusal);
    });
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

    setInputValue(input, "race-app");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => vi.advanceTimersByTimeAsync(350));
    await flushQueryUpdates();
    await vi.waitFor(() =>
      expect(container.textContent).toContain("GitHub repository name is available."),
    );
    const createButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New App",
    );
    await act(async () => createButton?.click());

    await vi.waitFor(() => expect(container.textContent).toContain(refusal));
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
