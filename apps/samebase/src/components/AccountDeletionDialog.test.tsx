// @vitest-environment jsdom

import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";

const testState = vi.hoisted(() => ({
  completionCapability: "a".repeat(64),
  deletionPolicy: vi.fn<() => "immediate" | "seven_days" | undefined>(() => "seven_days"),
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

describe("AccountDeletionDialog", () => {
  beforeEach(() => {
    testState.requestDeletion.mockReset();
    testState.requestDeletion.mockResolvedValue({
      state: "accepted",
      status: { completionCapability: testState.completionCapability },
    });
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it.each([
    [
      "seven_days",
      "immediate",
      "Permanent deletion will start seven days",
      "Schedule deletion",
      "immediately",
    ],
    [
      "immediate",
      "seven_days",
      "Permanent deletion will start immediately",
      "Delete account",
      "seven days",
    ],
  ] as const)(
    "keeps the confirmed %s policy after a live policy change",
    async (deletionStartMode, changedPolicy, timing, actionLabel, absentTiming) => {
      testState.deletionPolicy.mockReturnValue(deletionStartMode);
      const container = await mountDialog();

      expect(container.textContent).toContain(timing);
      await enterConfirmation(container);
      testState.deletionPolicy.mockReturnValue(changedPolicy);
      await act(async () => root?.render(<AccountDeletionDialog onClose={vi.fn()} />));

      expect(container.textContent).toContain(timing);
      expect(container.textContent).not.toContain(absentTiming);
      const deleteButton = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === actionLabel,
      );
      if (deleteButton === undefined) {
        throw new Error("Account deletion action was not found.");
      }

      await act(async () => {
        deleteButton.click();
        await vi.waitFor(() => expect(testState.requestDeletion).toHaveBeenCalledOnce());
      });

      expect(testState.requestDeletion).toHaveBeenCalledWith({
        completionCapability: testState.completionCapability,
        deletionConfirmationText: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
        deletionStartMode,
      });
    },
  );
});
