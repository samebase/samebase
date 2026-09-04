// @vitest-environment jsdom

import type { ViewerOrganization } from "@/organization/context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { OrganizationMembersPage } from "./OrganizationMembersPage";

const testState = vi.hoisted(() => ({
  getPage: vi.fn(),
  githubRelationships: vi.fn(async () => []),
}));

vi.mock("@/organization/OrganizationMembersPageView", async () => {
  const { useState } = await import("react");

  return {
    OrganizationMembersPageView: ({
      page,
    }: {
      page: { pendingInvitations?: Array<{ invitationId: string }> };
    }) => {
      const [githubLogin, setGithubLogin] = useState("");

      return (
        <div>
          <input
            aria-label="GitHub username"
            onChange={(event) => setGithubLogin(event.target.value)}
            value={githubLogin}
          />
          <output data-testid="pending-invitation-count">
            {page.pendingInvitations?.length ?? 0}
          </output>
        </div>
      );
    },
  };
});

vi.mock("convex/react", () => ({
  useAction: () => testState.githubRelationships,
  useMutation: () => vi.fn(),
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; the test only needs a stable identity.
  return value;
}

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

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization",
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner",
} satisfies ViewerOrganization;

const otherOrganization = {
  ...organization,
  githubOwnerLogin: "other-owner",
  organizationId: fakeOrganizationId("organization_other"),
} satisfies ViewerOrganization;

const page = {
  members: [],
  organization: { organizationId: "organization_samebase" },
  pendingInvitations: [{ invitationId: "invitation_octocat" }],
  viewerRole: "owner",
};

class TestErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <output data-testid="members-page-error">{this.state.error.message}</output>
    );
  }
}

describe("OrganizationMembersPage", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:34:45.000Z"));
    testState.getPage.mockReset();
    testState.getPage
      .mockResolvedValueOnce(page)
      .mockImplementation(() => new Promise(() => undefined));
    testState.githubRelationships.mockClear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { queryFn: testState.getPage, retry: false } },
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    rootElement.remove();
    vi.useRealTimers();
  });

  it("keeps member UI state and the GitHub result while the page time advances", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrganizationMembersPage organization={organization} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    const input = rootElement.querySelector<HTMLInputElement>("[aria-label='GitHub username']");
    if (!input) {
      throw new Error("GitHub username input was not rendered.");
    }
    setInputValue(input, "octocat");
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));

    expect(rootElement.querySelector("[data-testid=pending-invitation-count]")?.textContent).toBe(
      "1",
    );
    expect(testState.githubRelationships).toHaveBeenCalledTimes(1);
    expect(testState.getPage).toHaveBeenCalledTimes(1);
    expect(testState.getPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queryKey: [
          "convexQuery",
          expect.anything(),
          {
            now: Date.UTC(2026, 7, 11, 12, 34),
            organizationId: organization.organizationId,
          },
        ],
      }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(
      rootElement.querySelector<HTMLInputElement>("[aria-label='GitHub username']")?.value,
    ).toBe("octocat");
    expect(rootElement.querySelector("[data-testid=pending-invitation-count]")?.textContent).toBe(
      "1",
    );
    expect(testState.githubRelationships).toHaveBeenCalledTimes(1);
    expect(testState.getPage).toHaveBeenCalledTimes(2);
  });

  it("does not show the previous organization while the next organization loads", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrganizationMembersPage organization={organization} />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(rootElement.querySelector("[aria-label='GitHub username']")).not.toBeNull();

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrganizationMembersPage organization={otherOrganization} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(rootElement.querySelector("[aria-label='GitHub username']")).toBeNull();
    expect(testState.getPage).toHaveBeenCalledTimes(2);
  });

  it("stops showing cached member data after the page query fails", async () => {
    const accessError = new Error("Organization access is required.");
    testState.getPage.mockReset();
    testState.getPage.mockResolvedValueOnce(page).mockRejectedValueOnce(accessError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TestErrorBoundary>
            <OrganizationMembersPage organization={organization} />
          </TestErrorBoundary>
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rootElement.querySelector("[aria-label='GitHub username']")).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(rootElement.querySelector("[aria-label='GitHub username']")).toBeNull();
    expect(rootElement.querySelector("[data-testid=members-page-error]")?.textContent).toBe(
      accessError.message,
    );
    consoleError.mockRestore();
  });
});
