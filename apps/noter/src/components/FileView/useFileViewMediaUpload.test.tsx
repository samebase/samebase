// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import { useFileViewMediaUpload } from "./useFileViewMediaUpload";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this hook test only
  // needs a stable vault id for generated function arguments.
  return "k976ryb9d1m2gyvxhps87dac257mv5ps";
}

function MediaUploadProbe() {
  const mediaUpload = useFileViewMediaUpload({
    branch: "main",
    buildVaultFileUrl: (path) => `/vault/octo/repo/main/${path}`,
    deletePendingUploadBlob: vi.fn(async () => null),
    generateUploadUrl: vi.fn(async () => "/upload"),
    navigateByHref: vi.fn(),
    repositoryFullName: "octo/repo",
    selectedFile: "README.md",
    stageUploadedMedia: vi.fn(async () => null),
    vaultId: fakeVaultId(),
  });

  return (
    <div>
      <input
        data-testid="file-input"
        ref={mediaUpload.mediaUploadInputRef}
        type="file"
        onChange={mediaUpload.handleMediaUploadInputChange}
      />
      <div data-testid="pending-file">{mediaUpload.pendingMediaUpload?.file.name ?? ""}</div>
      <div data-testid="error-message">{mediaUpload.mediaUploadError ?? ""}</div>
    </div>
  );
}

function setInputFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
}

function dispatchBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useFileViewMediaUpload", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

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

  it("clears a stale pending upload after a later invalid file selection", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(<MediaUploadProbe />);
    });

    const input = rootElement.querySelector('[data-testid="file-input"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected file input");
    }

    setInputFile(input, new File(["image"], "cover.png", { type: "image/png" }));
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(rootElement.querySelector('[data-testid="pending-file"]')?.textContent).toBe(
      "cover.png",
    );
    expect(rootElement.querySelector('[data-testid="error-message"]')?.textContent).toBe("");
    expect(dispatchBeforeUnload()).toBe(true);

    setInputFile(input, new File(["text"], "notes.txt", { type: "text/plain" }));
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(rootElement.querySelector('[data-testid="pending-file"]')?.textContent).toBe("");
    expect(rootElement.querySelector('[data-testid="error-message"]')?.textContent).toBe(
      "Only image uploads are supported right now.",
    );
    expect(dispatchBeforeUnload()).toBe(false);
  });
});
