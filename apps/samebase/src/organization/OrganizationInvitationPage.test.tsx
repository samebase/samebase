// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    isLoading: true,
  },
  getInvitation: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: () => testState.getInvitation,
    useConvexAuth: () => testState.auth,
    useMutation: () => vi.fn(),
  };
});

vi.mock("@/auth/authClient", () => ({
  useAppAuthActions: () => ({ signOut: vi.fn() }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/organization/OrganizationInvitationPageView", () => ({
  OrganizationInvitationPageView: ({
    invitation,
  }: {
    invitation: { state: string; viewerState?: string };
  }) => (
    <output data-testid="invitation-state">
      {invitation.state === "available" ? invitation.viewerState : invitation.state}
    </output>
  ),
}));

import { OrganizationInvitationPage } from "./OrganizationInvitationPage";

const availableInvitation = (viewerState: "can_accept" | "signed_out") => ({
  organizationOwnerLogin: "samebase",
  state: "available" as const,
  targetLogin: "noter-guest",
  viewerState,
});

describe("OrganizationInvitationPage", () => {
  let queryClient: QueryClient;
  let root: Root;
  let rootElement: HTMLDivElement;

  async function renderPage() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrganizationInvitationPage code="invitation-code" />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    testState.auth.isAuthenticated = false;
    testState.auth.isLoading = true;
    testState.getInvitation.mockReset();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
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

  it("waits for authentication and reads again when its state changes", async () => {
    testState.getInvitation.mockImplementation(async () =>
      availableInvitation(testState.auth.isAuthenticated ? "can_accept" : "signed_out"),
    );

    await renderPage();

    expect(testState.getInvitation).not.toHaveBeenCalled();

    testState.auth.isLoading = false;
    await renderPage();

    await vi.waitFor(() => {
      expect(testState.getInvitation).toHaveBeenCalledTimes(1);
      expect(rootElement.textContent).toBe("signed_out");
    });

    testState.auth.isAuthenticated = true;
    await renderPage();

    await vi.waitFor(() => {
      expect(testState.getInvitation).toHaveBeenCalledTimes(2);
      expect(rootElement.textContent).toBe("can_accept");
    });
  });

  it("polls the server while the invitation page stays open", async () => {
    vi.useFakeTimers();
    testState.auth.isAuthenticated = true;
    testState.auth.isLoading = false;
    let isUnavailable = false;
    testState.getInvitation.mockImplementation(async () =>
      isUnavailable ? { state: "unavailable" as const } : availableInvitation("can_accept"),
    );

    await renderPage();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(testState.getInvitation).toHaveBeenCalledTimes(1);
    expect(rootElement.textContent).toBe("can_accept");

    isUnavailable = true;
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(testState.getInvitation).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(rootElement.textContent).toBe("unavailable");
    });
  });

  it("keeps cached invitation data after a failed poll and polls again", async () => {
    vi.useFakeTimers();
    testState.auth.isAuthenticated = true;
    testState.auth.isLoading = false;
    testState.getInvitation
      .mockResolvedValueOnce(availableInvitation("can_accept"))
      .mockRejectedValueOnce(new Error("Invitation refresh failed."))
      .mockRejectedValueOnce(new Error("Invitation refresh retry failed."))
      .mockResolvedValueOnce({ state: "unavailable" as const });

    await renderPage();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(rootElement.textContent).toBe("can_accept");

    await act(async () => vi.advanceTimersByTimeAsync(61_000));

    expect(testState.getInvitation).toHaveBeenCalledTimes(3);
    expect(rootElement.textContent).toBe("can_accept");

    await act(async () => vi.advanceTimersByTimeAsync(59_000));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(testState.getInvitation).toHaveBeenCalledTimes(4);
    await vi.waitFor(() => {
      expect(rootElement.textContent).toBe("unavailable");
    });
  });
});
