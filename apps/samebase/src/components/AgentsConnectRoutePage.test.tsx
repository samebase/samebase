// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { authState, consumeHandoffMock, setSessionMock, signInMock } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    isLoading: true,
  },
  consumeHandoffMock: vi.fn(),
  setSessionMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ setSession: setSessionMock }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => authState,
  useMutation: () => signInMock,
}));

vi.mock("@/lib/agentBrowserHandoffPrehydration", () => ({
  consumeStoredAgentBrowserHandoff: consumeHandoffMock,
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

import { AgentsConnectRoutePage } from "./AgentsConnectRoutePage";

describe("AgentsConnectRoutePage", () => {
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    consumeHandoffMock.mockReset();
    setSessionMock.mockReset();
    signInMock.mockReset();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    rootElement.remove();
  });

  it("waits for the existing browser session before consuming the handoff", async () => {
    consumeHandoffMock.mockReturnValue({
      returnToPath: "/repo/",
      token: `agbh_${"a".repeat(43)}`,
    });
    signInMock.mockImplementation(() => new Promise(() => {}));

    await act(async () => root.render(<AgentsConnectRoutePage />));

    expect(consumeHandoffMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();

    authState.isLoading = false;
    await act(async () => root.render(<AgentsConnectRoutePage />));

    expect(consumeHandoffMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledWith({ token: `agbh_${"a".repeat(43)}` });
  });

  it("adopts the minted session and opens the return path", async () => {
    authState.isLoading = false;
    consumeHandoffMock.mockReturnValue({
      returnToPath: "/repo/",
      token: `agbh_${"a".repeat(43)}`,
    });
    const tokens = {
      accessToken: "access-token",
      accessTokenExpiresAt: 1,
      refreshToken: "refresh-token",
      refreshTokenExpiresAt: 2,
      userId: "user-id",
    };
    signInMock.mockResolvedValue({ status: "complete", tokens });
    setSessionMock.mockResolvedValue(undefined);
    const replaceMock = vi.fn();
    vi.stubGlobal("location", { replace: replaceMock });

    await act(async () => {
      root.render(<AgentsConnectRoutePage />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/repo/");
    });
    expect(setSessionMock).toHaveBeenCalledWith(tokens);
    vi.unstubAllGlobals();
  });

  it("shows the failure state and keeps the session when the handoff is rejected", async () => {
    authState.isLoading = false;
    consumeHandoffMock.mockReturnValue({
      returnToPath: "/repo/",
      token: `agbh_${"a".repeat(43)}`,
    });
    signInMock.mockResolvedValue({ status: "error", userError: { error: "HANDOFF_REJECTED" } });

    await act(async () => {
      root.render(<AgentsConnectRoutePage />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rootElement.textContent).toContain("Connection link failed.");
    });
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("shows the failure state when sign-in rejects", async () => {
    authState.isLoading = false;
    consumeHandoffMock.mockReturnValue({
      returnToPath: "/repo/",
      token: `agbh_${"a".repeat(43)}`,
    });
    signInMock.mockRejectedValue(new Error("invalid handoff"));

    await act(async () => {
      root.render(<AgentsConnectRoutePage />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rootElement.textContent).toContain("Connection link failed.");
    });
  });

  it("keeps the failure state under Strict Mode's effect replay", async () => {
    authState.isLoading = false;
    consumeHandoffMock.mockReturnValue({
      returnToPath: "/repo/",
      token: `agbh_${"a".repeat(43)}`,
    });
    signInMock.mockRejectedValue(new Error("invalid handoff"));

    await act(async () => {
      root.render(
        <StrictMode>
          <AgentsConnectRoutePage />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(rootElement.textContent).toContain("Connection link failed.");
    });
    expect(consumeHandoffMock).toHaveBeenCalledTimes(1);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });
});
