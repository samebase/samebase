// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { ConvexError } from "convex/values";
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
  Dialog: ({ children, open }: { children?: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.ComponentProps<"label">) => (
    <label {...props}>{children}</label>
  ),
}));

import { useApiKeyConnectDialog } from "./ApiKeyConnectDialog";

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

function TestDialog({ connectWithToken }: { connectWithToken: () => Promise<unknown> }) {
  const { apiKeyDialog, openApiKeyDialog } = useApiKeyConnectDialog({
    connectWithToken,
    provider: "cloudflare",
  });

  return (
    <>
      <button onClick={openApiKeyDialog}>Open</button>
      {apiKeyDialog}
    </>
  );
}

async function mountDialog(connectWithToken: () => Promise<unknown>) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => root?.render(<TestDialog connectWithToken={connectWithToken} />));
  await act(async () => rootElement?.querySelector("button")?.click());

  return rootElement;
}

async function submitToken(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("input");
  const connectButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Connect Cloudflare",
  );
  if (!input || !connectButton) {
    throw new Error("Cloudflare token controls were not found.");
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }

  descriptor.set.call(input, "test-token");
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    connectButton.click();
    await Promise.resolve();
  });
}

describe("useApiKeyConnectDialog", () => {
  it("shows public provider error data", async () => {
    const container = await mountDialog(async () =>
      Promise.reject(
        new ConvexError("Use a Cloudflare API token that can access ONLY ONE account."),
      ),
    );

    expect(container.textContent).toContain(
      "Paste a Cloudflare user API token that can access ONLY ONE account.",
    );
    await submitToken(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Use a Cloudflare API token that can access ONLY ONE account.",
    );
  });

  it("hides plain server error details", async () => {
    const container = await mountDialog(async () => Promise.reject(new Error("private detail")));

    await submitToken(container);

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not connect Cloudflare.",
    );
  });
});
