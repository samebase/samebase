// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReactNode } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { VaultDashboardAppRootDialog } from "./VaultDashboard";

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

function renderAppRootDialog({
  appRoot = ".",
  folderSuggestions = [],
  mode = "app",
  onAppRootChange = vi.fn(),
  onModeChange,
  onSubmit = vi.fn(),
}: {
  appRoot?: string;
  folderSuggestions?: readonly string[];
  mode?: "app" | "monorepo";
  onAppRootChange?: (appRoot: string) => void;
  onModeChange: (mode: "app" | "monorepo") => void;
  onSubmit?: () => void;
}) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  act(() => {
    root?.render(
      <VaultDashboardAppRootDialog
        appRoot={appRoot}
        error={null}
        folderSuggestions={folderSuggestions}
        isSubmitting={false}
        mode={mode}
        onAppRootChange={onAppRootChange}
        onModeChange={onModeChange}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        open
        vault={{
          appRoots: [],
          hasAppRoots: false,
          hasRootAppRoot: false,
          id: fakeVaultId(),
          repositoryFullName: "ada/demo",
        }}
      />,
    );
  });

  return rootElement;
}

describe("VaultDashboardAppRootDialog interactions", () => {
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

  it("lets the user switch from app to monorepo mode", () => {
    const onModeChange = vi.fn();
    const container = renderAppRootDialog({ onModeChange });
    const monorepoButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Monorepo",
    );
    if (!monorepoButton) {
      throw new Error("Expected Monorepo mode button.");
    }

    act(() => {
      monorepoButton.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(onModeChange).toHaveBeenCalledWith("monorepo");
  });

  it("selects a folder suggestion with Enter before submitting", () => {
    const onAppRootChange = vi.fn();
    const onModeChange = vi.fn();
    const onSubmit = vi.fn();
    const container = renderAppRootDialog({
      appRoot: "api",
      folderSuggestions: ["apps/api", "apps/samebase"],
      mode: "monorepo",
      onAppRootChange,
      onModeChange,
      onSubmit,
    });
    const appRootInput = container.querySelector('input[aria-label="App root"]');
    if (!(appRootInput instanceof HTMLInputElement)) {
      throw new Error("Expected app root input.");
    }

    act(() => {
      appRootInput.focus();
    });

    expect(container.textContent).toContain("apps/api");

    act(() => {
      appRootInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    expect(onAppRootChange).toHaveBeenCalledWith("apps/api");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
