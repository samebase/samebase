// @vitest-environment jsdom

import { ConvexError } from "convex/values";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  requestDeletion: vi.fn(),
}));

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: React.ComponentProps<"button"> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock("@/lib/accountDeletionBrowserState", () => ({
  createAccountDeletionCompletionCapability: () => "a".repeat(64),
  readAccountDeletionBrowserMarker: () => null,
  writeAccountDeletionBrowserMarker: () => true,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: testState.navigate }),
}));

vi.mock("convex/react", () => ({
  useMutation: () => testState.requestDeletion,
}));

import { AccountDeletionDialog } from "./AccountDeletionDialog";

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, value);
}

function getButton(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

describe("AccountDeletionDialog", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
    testState.requestDeletion.mockReset();
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => mountedRoot.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  async function submitDeletion(error: unknown): Promise<HTMLDivElement> {
    testState.requestDeletion.mockRejectedValueOnce(error);
    await act(async () => {
      root?.render(<AccountDeletionDialog onClose={vi.fn()} />);
    });
    if (!rootElement) {
      throw new Error("Account deletion dialog was not mounted.");
    }
    const mountedRoot = rootElement;
    const input = mountedRoot.querySelector<HTMLInputElement>("input");
    if (!input) {
      throw new Error("Account deletion confirmation input was not rendered.");
    }

    setInputValue(input, ACCOUNT_DELETION_CONFIRMATION_PHRASE);
    await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => {
      getButton(mountedRoot, "Delete account").click();
      await Promise.resolve();
    });
    return mountedRoot;
  }

  it("shows the organization deletion requirement from Convex", async () => {
    const errorMessage =
      "Leave or delete the samebase organization before you delete your account.";

    const mounted = await submitDeletion(new ConvexError(errorMessage));

    expect(mounted.querySelector('[role="alert"]')?.textContent).toBe(errorMessage);
    expect(testState.requestDeletion).toHaveBeenCalledWith({
      completionCapability: "a".repeat(64),
      confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
    });
    expect(testState.navigate).not.toHaveBeenCalled();
  });

  it("hides a generic transport failure", async () => {
    const mounted = await submitDeletion(new Error("private transport detail"));

    expect(mounted.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not start account deletion. Please try again.",
    );
    expect(mounted.textContent).not.toContain("private transport detail");
    expect(testState.navigate).not.toHaveBeenCalled();
  });
});
