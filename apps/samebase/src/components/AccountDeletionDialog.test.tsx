// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";

const testState = vi.hoisted(() => ({
  completionCapability: "a".repeat(64),
  deletionPolicy: vi.fn<() => { deletionStartMode: "immediate" | "seven_days" } | undefined>(
    () => ({ deletionStartMode: "seven_days" }),
  ),
  navigate: vi.fn(),
  requestDeletion: vi.fn(),
  writeBrowserMarker: vi.fn(() => true),
}));

vi.mock("convex/react", () => ({
  useMutation: () => testState.requestDeletion,
  useQuery: () => testState.deletionPolicy(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: testState.navigate }),
}));

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: (props: ComponentProps<"label">) => <label {...props} />,
}));

vi.mock("@/lib/accountDeletionBrowserState", () => ({
  createAccountDeletionCompletionCapability: () => testState.completionCapability,
  readAccountDeletionBrowserMarker: () => null,
  writeAccountDeletionBrowserMarker: testState.writeBrowserMarker,
}));

import { AccountDeletionDialog } from "./AccountDeletionDialog";

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountDialog() {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => {
    root?.render(<AccountDeletionDialog onClose={vi.fn()} />);
  });
  return rootElement;
}

async function enterConfirmation(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("input");
  if (input === null) {
    throw new Error("Account deletion confirmation input was not found.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, ACCOUNT_DELETION_CONFIRMATION_PHRASE);
  await act(async () => input.dispatchEvent(new Event("input", { bubbles: true })));
}

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
}

describe("AccountDeletionDialog", () => {
  beforeEach(() => {
    testState.deletionPolicy.mockReset();
    testState.deletionPolicy.mockReturnValue({ deletionStartMode: "seven_days" });
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
    testState.requestDeletion.mockReset();
    testState.requestDeletion.mockResolvedValue({
      state: "accepted",
      status: { completionCapability: testState.completionCapability },
    });
    testState.writeBrowserMarker.mockClear();
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("shows the seven-day terms and submits the policy that the user confirmed", async () => {
    const container = await mountDialog();

    expect(container.textContent).toContain("Permanent deletion will start seven days");
    const deleteButton = findButton(container, "Schedule deletion");
    if (deleteButton === undefined) {
      throw new Error("Schedule deletion action was not found.");
    }
    expect(deleteButton.disabled).toBe(true);

    await enterConfirmation(container);
    await act(async () => {
      deleteButton.click();
      await vi.waitFor(() => expect(testState.requestDeletion).toHaveBeenCalledOnce());
    });

    expect(testState.requestDeletion).toHaveBeenCalledWith({
      completionCapability: testState.completionCapability,
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      deletionStartMode: "seven_days",
    });
  });

  it("shows immediate terms and submits the immediate policy", async () => {
    testState.deletionPolicy.mockReturnValue({ deletionStartMode: "immediate" });
    const container = await mountDialog();

    expect(container.textContent).toContain("Permanent deletion will start immediately");
    expect(container.textContent).toContain(
      "Samebase will send you a confirmation email as account deletion finishes.",
    );
    expect(container.textContent).not.toContain("seven days");
    const deleteButton = findButton(container, "Delete account");
    if (deleteButton === undefined) {
      throw new Error("Immediate account deletion action was not found.");
    }

    await enterConfirmation(container);
    await act(async () => {
      deleteButton.click();
      await vi.waitFor(() => expect(testState.requestDeletion).toHaveBeenCalledOnce());
    });

    expect(testState.requestDeletion).toHaveBeenCalledWith({
      completionCapability: testState.completionCapability,
      deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
      deletionStartMode: "immediate",
    });
  });

  it("keeps the destructive action hidden while the policy loads", async () => {
    testState.deletionPolicy.mockReturnValue(undefined);
    const container = await mountDialog();

    expect(container.textContent).toBe("");
    expect(testState.requestDeletion).not.toHaveBeenCalled();
  });
});
