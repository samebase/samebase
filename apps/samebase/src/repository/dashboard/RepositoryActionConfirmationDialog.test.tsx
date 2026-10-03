// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vite-plus/test";

import { RepositoryActionConfirmationDialog } from "./RepositoryActionConfirmationDialog";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

const request = {
  state: "needs_confirmation" as const,
  effect:
    "Samebase removes the Worker scout from scout-owner/scout. The Worker keeps running in Cloudflare, and Samebase changes no Cloudflare setting or key.",
  acknowledgement: "I approve removing Worker scout from scout-owner/scout in Samebase",
  token: "sbcf_token",
  expiresAt: 1_800_000_000_000,
};

async function renderDialog(onConfirm: () => Promise<void>) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(
      <RepositoryActionConfirmationDialog
        confirmLabel="Remove from repository"
        onCancel={() => {}}
        onConfirm={onConfirm}
        request={request}
        title="Remove the Worker from this repository?"
      />,
    );
  });
  const confirmButton = () => {
    const button = [...rootElement.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "Remove from repository",
    );
    if (!button) {
      throw new Error("Expected the confirm button.");
    }
    return button;
  };
  const checkbox = rootElement.querySelector('[role="checkbox"]');
  if (!(checkbox instanceof HTMLElement)) {
    throw new Error("Expected the acknowledgement checkbox.");
  }
  return {
    rootElement,
    confirmButton,
    checkbox,
    cleanup: async () => {
      await act(async () => root.unmount());
      rootElement.remove();
    },
  };
}

describe("RepositoryActionConfirmationDialog", () => {
  it("sends the token and the exact sentence only after the user ticks the sentence", async () => {
    const onConfirm = vi.fn(async () => {});
    const dialog = await renderDialog(onConfirm);

    try {
      expect(dialog.rootElement.textContent).toContain(request.effect);
      expect(dialog.rootElement.querySelector("label")?.textContent).toBe(request.acknowledgement);
      expect(dialog.confirmButton().disabled).toBe(true);

      await act(async () => {
        dialog.checkbox.click();
      });
      expect(dialog.confirmButton().disabled).toBe(false);
      await act(async () => {
        dialog.confirmButton().click();
      });

      expect(onConfirm).toHaveBeenCalledWith({
        token: request.token,
        acknowledgement: request.acknowledgement,
      });
    } finally {
      await dialog.cleanup();
    }
  });

  it("shows a failure and offers only Close, because the token can be used already", async () => {
    const onConfirm = vi.fn(async () => {
      throw new ConvexError("Cloudflare did not report the configured repository root.");
    });
    const dialog = await renderDialog(onConfirm);

    try {
      await act(async () => {
        dialog.checkbox.click();
      });
      await act(async () => {
        dialog.confirmButton().click();
      });

      expect(dialog.rootElement.textContent).toContain(
        "Cloudflare did not report the configured repository root.",
      );
      expect(dialog.confirmButton().disabled).toBe(true);
      expect(
        [...dialog.rootElement.querySelectorAll("button")].map((button) => button.textContent),
      ).toContain("Close");
      await act(async () => {
        dialog.confirmButton().click();
      });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    } finally {
      await dialog.cleanup();
    }
  });
});
