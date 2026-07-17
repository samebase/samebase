// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { VaultDashboardAppDialog } from "./VaultDashboard";

const { act } = React;
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this interaction test
  // only needs a stable vault id for component props.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function renderAppDialog({
  rootDirectory = "/",
  folderSuggestions = [],
  location = "repository_root",
  onRootDirectoryChange = vi.fn(),
  onLocationChange,
  onOpenChange = vi.fn(),
  onSubmit = vi.fn(),
}: {
  rootDirectory?: string;
  folderSuggestions?: readonly string[];
  location?: "repository_root" | "folder";
  onRootDirectoryChange?: (rootDirectory: string) => void;
  onLocationChange: (location: "repository_root" | "folder") => void;
  onOpenChange?: (isOpen: boolean) => void;
  onSubmit?: () => void;
}) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  act(() => {
    root?.render(
      <VaultDashboardAppDialog
        rootDirectory={rootDirectory}
        error={null}
        folderSuggestions={folderSuggestions}
        isSubmitting={false}
        location={location}
        onRootDirectoryChange={onRootDirectoryChange}
        onLocationChange={onLocationChange}
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
        open
        vault={{
          hasApps: false,
          hasRepositoryRootApp: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );
  });

  return rootElement;
}

describe("VaultDashboardAppDialog interactions", () => {
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
  });

  it("lets the user switch from the repository root to a folder", () => {
    const onLocationChange = vi.fn();
    const container = renderAppDialog({ onLocationChange });
    const folderButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Folder",
    );
    if (!folderButton) {
      throw new Error("Expected Folder location button.");
    }

    act(() => {
      folderButton.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(onLocationChange).toHaveBeenCalledWith("folder");
  });

  it("keeps suggestions closed when the empty input receives focus", () => {
    const onLocationChange = vi.fn();
    const container = renderAppDialog({
      rootDirectory: "",
      folderSuggestions: ["apps/api", "apps/samebase"],
      location: "folder",
      onLocationChange,
    });
    const rootDirectoryInput = container.querySelector('input[aria-label="Root directory"]');
    if (!(rootDirectoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected root directory input.");
    }

    act(() => {
      rootDirectoryInput.focus();
    });

    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("leaves Enter available for typed root-directory submission until a suggestion is selected", () => {
    const onRootDirectoryChange = vi.fn();
    const onLocationChange = vi.fn();
    const onSubmit = vi.fn();
    const container = renderAppDialog({
      rootDirectory: "api",
      folderSuggestions: ["apps/api", "apps/samebase"],
      location: "folder",
      onRootDirectoryChange,
      onLocationChange,
      onSubmit,
    });
    const rootDirectoryInput = container.querySelector('input[aria-label="Root directory"]');
    if (!(rootDirectoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected root directory input.");
    }
    const form = container.querySelector("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Expected add-app form.");
    }

    act(() => {
      rootDirectoryInput.focus();
    });

    expect(container.textContent).toContain("apps/api");

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    act(() => {
      rootDirectoryInput.dispatchEvent(keyEvent);
    });
    expect(keyEvent.defaultPrevented).toBe(false);
    expect(onRootDirectoryChange).not.toHaveBeenCalled();

    act(() => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("selects a folder suggestion with ArrowDown then Enter before submitting", () => {
    const onRootDirectoryChange = vi.fn();
    const onLocationChange = vi.fn();
    const onSubmit = vi.fn();
    const container = renderAppDialog({
      rootDirectory: "api",
      folderSuggestions: ["apps/api", "apps/samebase"],
      location: "folder",
      onRootDirectoryChange,
      onLocationChange,
      onSubmit,
    });
    const rootDirectoryInput = container.querySelector('input[aria-label="Root directory"]');
    if (!(rootDirectoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected root directory input.");
    }

    act(() => {
      rootDirectoryInput.focus();
    });

    expect(container.textContent).toContain("apps/api");

    act(() => {
      rootDirectoryInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    act(() => {
      rootDirectoryInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });

    expect(onRootDirectoryChange).toHaveBeenCalledWith("apps/api");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes suggestions with Escape without bubbling to the document", () => {
    const onLocationChange = vi.fn();
    const documentKeyDown = vi.fn();
    document.addEventListener("keydown", documentKeyDown);
    const container = renderAppDialog({
      rootDirectory: "api",
      folderSuggestions: ["apps/api", "apps/samebase"],
      location: "folder",
      onLocationChange,
    });
    const rootDirectoryInput = container.querySelector('input[aria-label="Root directory"]');
    if (!(rootDirectoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected root directory input.");
    }

    act(() => {
      rootDirectoryInput.focus();
    });

    const escapeEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    act(() => {
      rootDirectoryInput.dispatchEvent(escapeEvent);
    });
    document.removeEventListener("keydown", documentKeyDown);

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(documentKeyDown).not.toHaveBeenCalled();
    expect(container.querySelector('[role="option"]')).toBeNull();
  });

  it("selects a suggestion on pointer down", () => {
    const onRootDirectoryChange = vi.fn();
    const onLocationChange = vi.fn();
    const container = renderAppDialog({
      rootDirectory: "api",
      folderSuggestions: ["apps/api", "apps/samebase"],
      location: "folder",
      onRootDirectoryChange,
      onLocationChange,
    });
    const rootDirectoryInput = container.querySelector('input[aria-label="Root directory"]');
    if (!(rootDirectoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected root directory input.");
    }

    act(() => {
      rootDirectoryInput.focus();
    });
    const option = container.querySelector('[role="option"]');
    if (!(option instanceof HTMLElement)) {
      throw new Error("Expected root directory suggestion.");
    }

    act(() => {
      option.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    });

    expect(onRootDirectoryChange).toHaveBeenCalledWith("apps/api");
  });
});
