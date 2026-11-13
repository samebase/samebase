// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { completeProviderOAuthMock, navigateMock } = vi.hoisted(() => ({
  completeProviderOAuthMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => completeProviderOAuthMock,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: navigateMock }),
}));

import { ProviderOAuthCompletionPage } from "./ProviderOAuthCompletionPage";

describe("ProviderOAuthCompletionPage", () => {
  let root: Root;
  let rootElement: HTMLDivElement;

  beforeEach(() => {
    completeProviderOAuthMock.mockReset();
    navigateMock.mockReset();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    rootElement.remove();
    window.history.replaceState(null, "", "/");
  });

  async function renderAt(url: string) {
    window.history.replaceState({ key: "router-entry" }, "", url);
    await act(async () => {
      root.render(
        <StrictMode>
          <ProviderOAuthCompletionPage />
        </StrictMode>,
      );
      await Promise.resolve();
    });
  }

  it("removes the fragment before completing and continues to the returned path", async () => {
    const addressAtCompletion: string[] = [];
    completeProviderOAuthMock.mockImplementation(async () => {
      addressAtCompletion.push(window.location.href);
      return `${window.location.origin}/org/acme/providers?prod-ui#connections`;
    });

    await renderAt(
      "/oauth/provider-complete?prod-ui#provider=convex&state=state-value&code=code-value",
    );

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        href: "/org/acme/providers?prod-ui#connections",
        replace: true,
      });
    });
    expect(completeProviderOAuthMock).toHaveBeenCalledTimes(1);
    expect(completeProviderOAuthMock).toHaveBeenCalledWith({
      provider: "convex",
      state: "state-value",
      code: "code-value",
    });
    expect(addressAtCompletion).toEqual([
      `${window.location.origin}/oauth/provider-complete?prod-ui`,
    ]);
    expect(window.history.state).toEqual({ key: "router-entry" });
  });

  it("does not continue to a return URL on another origin", async () => {
    completeProviderOAuthMock.mockResolvedValue("https://evil.example/org/acme/providers");

    await renderAt("/oauth/provider-complete#provider=cloudflare_mcp&state=state-value&code=code");

    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledTimes(1);
    });
    expect(navigateMock).toHaveBeenCalledWith({
      href: "/org?authorization-provider=cloudflare&authorization-error=failed",
      replace: true,
    });
  });

  it("goes to the organization list without completing when the fragment is missing", async () => {
    await renderAt("/oauth/provider-complete");

    expect(completeProviderOAuthMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({ href: "/org", replace: true });
  });
});
