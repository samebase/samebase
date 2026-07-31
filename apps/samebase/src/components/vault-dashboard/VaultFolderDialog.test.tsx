// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/components/AppDialogContent", () => ({
  AppDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

import { VaultFolderDialog } from "./VaultFolderDialog";

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  rootElement?.remove();
  rootElement = null;
});

async function renderDialog(element: ReactElement) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => {
    root?.render(element);
  });

  return rootElement;
}

async function setFolderName(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Folder name"]');
  if (!input) {
    throw new Error("Folder name input not found");
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function submitForm(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("Folder form not found");
  }
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function deferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {
    promise,
    resolve: () => resolve?.(),
  };
}

describe("VaultFolderDialog", () => {
  it("submits create and rename once when native form submission occurs", async () => {
    const onCreate = vi.fn(async () => {});
    const createContainer = await renderDialog(
      <VaultFolderDialog kind="create" onCreate={onCreate} onOpenChange={() => {}} />,
    );
    await setFolderName(createContainer, "Fixtures");
    await submitForm(createContainer);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("Fixtures");

    await act(async () => root?.unmount());
    root = null;
    rootElement?.remove();

    const onRename = vi.fn(async () => {});
    const renameContainer = await renderDialog(
      <VaultFolderDialog
        folderName="Fixtures"
        kind="rename"
        onOpenChange={() => {}}
        onRename={onRename}
      />,
    );
    await setFolderName(renameContainer, "Active");
    await submitForm(renameContainer);

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Active");
  });

  it("disables create controls and shows pending copy", async () => {
    const request = deferred();
    const container = await renderDialog(
      <VaultFolderDialog
        kind="create"
        onCreate={async () => request.promise}
        onOpenChange={() => {}}
      />,
    );
    await setFolderName(container, "Fixtures");
    await submitForm(container);

    expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Creating");
    expect(
      container.querySelector('input[aria-label="Folder name"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(container.querySelector('button[type="button"]')?.hasAttribute("disabled")).toBe(true);

    await act(async () => request.resolve());
  });

  it("announces server errors and marks the name input invalid", async () => {
    const container = await renderDialog(
      <VaultFolderDialog
        folderName="Fixtures"
        kind="rename"
        onOpenChange={() => {}}
        onRename={async () => Promise.reject(new Error("Folder name is already in use."))}
      />,
    );
    await submitForm(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Folder name is already in use.",
    );
    expect(
      container.querySelector('input[aria-label="Folder name"]')?.getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("shows delete pending copy and does not submit it from Enter", async () => {
    const request = deferred();
    const onDelete = vi.fn(async () => request.promise);
    const container = await renderDialog(
      <VaultFolderDialog
        folderName="Fixtures"
        kind="delete"
        onDelete={onDelete}
        onOpenChange={() => {}}
        vaultCount={2}
      />,
    );
    const deleteButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete folder",
    );
    if (!deleteButton) {
      throw new Error("Delete folder button not found");
    }

    await act(async () => deleteButton.click());

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(deleteButton.textContent).toBe("Deleting");
    expect(deleteButton.hasAttribute("disabled")).toBe(true);
    expect(container.querySelector("form")).toBeNull();

    await act(async () => request.resolve());
  });
});
