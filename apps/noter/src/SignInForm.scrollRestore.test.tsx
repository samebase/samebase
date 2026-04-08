// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_LANDING_SCROLL_SHELL_TEST_ID } from "@/lib/publicLanding";
import {
  clearPendingPublicLandingScrollTop,
  readPendingPublicLandingScrollTop,
  setPendingPublicLandingScrollTop,
} from "@/lib/publicLandingScrollState";
import { SignInForm } from "./SignInForm";

vi.mock("@/authClient", () => ({
  setAuthProvider: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: vi.fn(),
  }),
}));

vi.mock("@/lib/rootRouteSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rootRouteSearch")>();

  return {
    ...actual,
    useRootRouteSearch: () => ({}),
  };
});

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/PublicLandingLogo", () => ({
  PublicLandingLogo: () => <div>Logo</div>,
}));

vi.mock("@/components/LandingCopy", () => ({
  LandingCopy: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));

vi.mock("@/components/ProsemarkReadOnly", () => ({
  ProsemarkReadOnly: ({ value }: { value: string }) => <div>{value}</div>,
}));

vi.mock("./SignInWithGoogle", () => ({
  SignInWithGoogle: () => <button type="button">Continue with Google</button>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("SignInForm landing scroll handoff", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
    clearPendingPublicLandingScrollTop();
    vi.useRealTimers();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("preserves the pending scroll handoff through the StrictMode probe mount", () => {
    vi.useFakeTimers();
    const requestAnimationFrameMock: typeof window.requestAnimationFrame = (
      callback,
    ) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    };
    const cancelAnimationFrameMock: typeof window.cancelAnimationFrame = (
      handle,
    ) => {
      window.clearTimeout(handle);
    };
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;

    setPendingPublicLandingScrollTop(220);
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <React.StrictMode>
          <TestRouterProvider>
            <SignInForm />
          </TestRouterProvider>
        </React.StrictMode>,
      );
    });

    const scrollShell = rootElement.querySelector(
      `[data-testid="${PUBLIC_LANDING_SCROLL_SHELL_TEST_ID}"]`,
    );
    expect(scrollShell).toBeInstanceOf(HTMLDivElement);
    if (!(scrollShell instanceof HTMLDivElement)) {
      throw new Error("Expected landing scroll shell element");
    }
    expect(scrollShell.scrollTop).toBe(220);
    expect(readPendingPublicLandingScrollTop()).toBe(220);

    act(() => {
      vi.runAllTimers();
    });

    expect(readPendingPublicLandingScrollTop()).toBeNull();
  });
});
