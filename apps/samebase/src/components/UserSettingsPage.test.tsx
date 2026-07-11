// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { UserSettingsPage } from "./UserSettingsPage";

const authState = vi.hoisted(() => ({
  fetchAccessToken: vi.fn(),
}));
const mutationState = vi.hoisted(() => ({
  setDisplayName: vi.fn(),
}));
const queryState = vi.hoisted<{
  settings: { displayName?: string; signInEmail: string };
}>(() => ({
  settings: {
    displayName: "Current name",
    signInEmail: "nicu@samebase.com",
  },
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => authState,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mutationState.setDisplayName,
  useQuery: () => queryState.settings,
}));

async function mountSettingsPage() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => {
    root.render(<UserSettingsPage />);
  });
  return { root, rootElement };
}

async function unmount(root: Root, rootElement: HTMLElement) {
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
}

function readForm(rootElement: HTMLElement) {
  const form = rootElement.querySelector("form");
  const input = rootElement.querySelector<HTMLInputElement>('[name="displayName"]');
  if (form === null || input === null) {
    throw new Error("Settings form did not render.");
  }
  return { form, input };
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function createDeferred<Value>() {
  const control: { resolve: (value: Value) => void } = {
    resolve: () => {
      throw new Error("Deferred promise was not initialized.");
    },
  };
  const promise = new Promise<Value>((resolve) => {
    control.resolve = resolve;
  });
  return { promise, resolve: control.resolve };
}

describe("UserSettingsPage", () => {
  beforeEach(() => {
    authState.fetchAccessToken.mockReset();
    mutationState.setDisplayName.mockReset();
    queryState.settings = {
      displayName: "Current name",
      signInEmail: "nicu@samebase.com",
    };
  });

  it("keeps Save pending until the refreshed JWT is stored", async () => {
    const refresh = createDeferred<string | null>();
    mutationState.setDisplayName.mockResolvedValue(null);
    authState.fetchAccessToken.mockReturnValue(refresh.promise);
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      input.value = "  Nicu  ";
      await submit(form);
      await submit(form);

      expect(mutationState.setDisplayName).toHaveBeenCalledWith({ displayName: "  Nicu  " });
      expect(mutationState.setDisplayName).toHaveBeenCalledTimes(1);
      expect(authState.fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: true });
      expect(mounted.rootElement.textContent).toContain("Saving...");
      expect(mounted.rootElement.textContent).not.toContain("Saved");

      await act(async () => {
        refresh.resolve("new-jwt");
        await refresh.promise;
      });
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("clears the display name with an explicit null", async () => {
    mutationState.setDisplayName.mockResolvedValue(null);
    authState.fetchAccessToken.mockResolvedValue("new-jwt");
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      input.value = "   ";
      await submit(form);

      expect(mutationState.setDisplayName).toHaveBeenCalledWith({ displayName: null });
      expect(authState.fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: true });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("retries only the failed session refresh after the database save", async () => {
    mutationState.setDisplayName.mockResolvedValue(null);
    authState.fetchAccessToken
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce("new-jwt");
    const mounted = await mountSettingsPage();
    try {
      const { form } = readForm(mounted.rootElement);
      await submit(form);

      expect(mounted.rootElement.textContent).toContain("Refresh unavailable");
      const retry = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      expect(retry).toBeDefined();
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });

      expect(mutationState.setDisplayName).toHaveBeenCalledTimes(1);
      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(2);
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps the stale-session recovery visible when the draft changes", async () => {
    mutationState.setDisplayName.mockResolvedValue(null);
    authState.fetchAccessToken
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce("new-jwt");
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      await submit(form);

      expect(mounted.rootElement.textContent).toContain("Refresh unavailable");
      await act(async () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        );
        if (!descriptor || typeof descriptor.set !== "function") {
          throw new Error("HTMLInputElement value setter is unavailable.");
        }
        descriptor.set.call(input, "Unsaved draft");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(mounted.rootElement.textContent).toContain("Refresh unavailable");
      expect(mounted.rootElement.textContent).toContain("Retry");
      expect(mounted.rootElement.textContent).not.toContain("Saved");
      expect(mutationState.setDisplayName).toHaveBeenCalledTimes(1);
      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(1);

      const retry = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });

      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(2);
      expect(mounted.rootElement.textContent).not.toContain("Refresh unavailable");
      expect(mounted.rootElement.textContent).not.toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("does not refresh the token when saving fails", async () => {
    mutationState.setDisplayName.mockRejectedValue(new Error("Display name must be one line."));
    const mounted = await mountSettingsPage();
    try {
      const { form } = readForm(mounted.rootElement);
      await submit(form);

      expect(mounted.rootElement.textContent).toContain("Display name must be one line.");
      expect(authState.fetchAccessToken).not.toHaveBeenCalled();
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });
});
