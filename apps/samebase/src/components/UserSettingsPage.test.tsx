// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { UserSettingsPage } from "./UserSettingsPage";

const CURRENT_NAME_PRESENTATION = {
  kind: "displayName",
  label: "Current name",
} satisfies AccountPresentation;
const EMAIL_PRESENTATION = {
  kind: "email",
  label: "nicu@samebase.com",
} satisfies AccountPresentation;

function createJwt(accountPresentation: AccountPresentation) {
  return [
    "header",
    Buffer.from(
      JSON.stringify({
        accountLabelKind: accountPresentation.kind,
        accountLabel: accountPresentation.label,
        exp: 4100000000,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
}

const authState = vi.hoisted(() => ({
  fetchAccessToken: vi.fn(),
}));
const appAuthState = vi.hoisted(() => ({
  signOut: vi.fn(),
}));
const routerState = vi.hoisted(() => ({
  navigate: vi.fn(),
}));
const mutationState = vi.hoisted(() => ({
  requestDeletion: vi.fn(),
  setDisplayName: vi.fn(),
}));
const queryState = vi.hoisted<{
  settings: { displayName?: string; hasActiveSubscription: boolean; signInEmail: string };
}>(() => ({
  settings: {
    displayName: "Current name",
    hasActiveSubscription: false,
    signInEmail: "nicu@samebase.com",
  },
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => authState,
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => appAuthState,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useRouter: () => routerState };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  return {
    ...actual,
    useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(reference) === "accountDeletion/index:request"
        ? mutationState.requestDeletion
        : mutationState.setDisplayName,
    useQuery: () => queryState.settings,
  };
});

function createTestStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    get length() {
      return entries.size;
    },
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

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
    appAuthState.signOut.mockReset();
    mutationState.requestDeletion.mockReset();
    mutationState.setDisplayName.mockReset();
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    queryState.settings = {
      displayName: "Current name",
      hasActiveSubscription: false,
      signInEmail: "nicu@samebase.com",
    };
  });

  it("keeps Sign out prominent in the page header and pending until completion", async () => {
    const signOut = createDeferred<void>();
    appAuthState.signOut.mockReturnValue(signOut.promise);
    const mounted = await mountSettingsPage();
    try {
      const heading = mounted.rootElement.querySelector("h1");
      const button = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (candidate) => candidate.textContent === "Sign out",
      );

      expect(heading?.textContent).toBe("Settings");
      expect(button === undefined ? false : heading?.parentElement?.contains(button)).toBe(true);
      expect(button?.disabled).toBe(false);

      await act(async () => {
        button?.click();
        await Promise.resolve();
      });

      expect(appAuthState.signOut).toHaveBeenCalledTimes(1);
      expect(button?.disabled).toBe(true);
      expect(button?.textContent).toContain("Signing out...");

      await act(async () => {
        signOut.resolve();
        await signOut.promise;
      });
      expect(routerState.navigate).toHaveBeenCalledWith({ href: "/", replace: true, state: true });
      expect(button?.disabled).toBe(false);
      expect(button?.textContent).toBe("Sign out");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps Save pending until the refreshed JWT is stored", async () => {
    const refresh = createDeferred<string | null>();
    const committedPresentation = {
      kind: "displayName",
      label: "Nicu",
    } satisfies AccountPresentation;
    mutationState.setDisplayName.mockResolvedValue(committedPresentation);
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
        refresh.resolve(createJwt(committedPresentation));
        await refresh.promise;
      });
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("clears the display name with an explicit null", async () => {
    mutationState.setDisplayName.mockResolvedValue(EMAIL_PRESENTATION);
    authState.fetchAccessToken.mockResolvedValue(createJwt(EMAIL_PRESENTATION));
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      input.value = "   ";
      await submit(form);

      expect(mutationState.setDisplayName).toHaveBeenCalledWith({ displayName: null });
      expect(authState.fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: true });
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("retries only the failed session refresh after the database save", async () => {
    mutationState.setDisplayName.mockResolvedValue(CURRENT_NAME_PRESENTATION);
    authState.fetchAccessToken
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce(createJwt(CURRENT_NAME_PRESENTATION));
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
    mutationState.setDisplayName.mockResolvedValue(CURRENT_NAME_PRESENTATION);
    authState.fetchAccessToken
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce(createJwt(CURRENT_NAME_PRESENTATION));
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

  it("does not retry a stale session while a subsequent save is pending", async () => {
    const secondSave = createDeferred<AccountPresentation>();
    mutationState.setDisplayName
      .mockResolvedValueOnce(CURRENT_NAME_PRESENTATION)
      .mockReturnValueOnce(secondSave.promise);
    authState.fetchAccessToken
      .mockRejectedValueOnce(new Error("First refresh unavailable"))
      .mockRejectedValueOnce(new Error("Second refresh unavailable"))
      .mockResolvedValueOnce(createJwt(CURRENT_NAME_PRESENTATION));
    const mounted = await mountSettingsPage();
    try {
      const { form } = readForm(mounted.rootElement);
      await submit(form);
      expect(mounted.rootElement.textContent).toContain("First refresh unavailable");

      await submit(form);
      const retry = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      expect(retry).toBeDefined();
      expect(retry?.disabled).toBe(true);
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });
      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(1);

      await act(async () => {
        secondSave.resolve(CURRENT_NAME_PRESENTATION);
        await secondSave.promise;
        await Promise.resolve();
      });
      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(2);
      expect(mounted.rootElement.textContent).toContain("Second refresh unavailable");
      expect(retry?.disabled).toBe(false);

      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });
      expect(authState.fetchAccessToken).toHaveBeenCalledTimes(3);
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("rejects the valid stale token returned after another tab wins the refresh mutex", async () => {
    const competingTabRefresh = createDeferred<string | null>();
    const committedPresentation = {
      kind: "displayName",
      label: "Nicu",
    } satisfies AccountPresentation;
    mutationState.setDisplayName.mockResolvedValue(committedPresentation);
    authState.fetchAccessToken
      .mockReturnValueOnce(competingTabRefresh.promise)
      .mockResolvedValueOnce(createJwt(committedPresentation));
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      input.value = "Nicu";
      await submit(form);

      await act(async () => {
        competingTabRefresh.resolve(createJwt(EMAIL_PRESENTATION));
        await competingTabRefresh.promise;
      });

      expect(mounted.rootElement.textContent).toContain(
        "The refreshed session does not include the saved account label.",
      );
      expect(mounted.rootElement.textContent).not.toContain("Saved");
      const retry = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
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

  it("keeps a clear stale until the refreshed token contains the expected email", async () => {
    mutationState.setDisplayName.mockResolvedValue(EMAIL_PRESENTATION);
    authState.fetchAccessToken
      .mockResolvedValueOnce(createJwt(CURRENT_NAME_PRESENTATION))
      .mockResolvedValueOnce(createJwt(EMAIL_PRESENTATION));
    const mounted = await mountSettingsPage();
    try {
      const { form, input } = readForm(mounted.rootElement);
      input.value = "   ";
      await submit(form);

      expect(mounted.rootElement.textContent).toContain(
        "The refreshed session does not include the saved account label.",
      );
      const retry = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Retry",
      );
      await act(async () => {
        retry?.click();
        await Promise.resolve();
      });

      expect(mutationState.setDisplayName).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Saved");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it.each([null, "opaque-token"])(
    "keeps the committed presentation stale when refresh returns %j",
    async (token) => {
      mutationState.setDisplayName.mockResolvedValue(CURRENT_NAME_PRESENTATION);
      authState.fetchAccessToken.mockResolvedValue(token);
      const mounted = await mountSettingsPage();
      try {
        const { form } = readForm(mounted.rootElement);
        await submit(form);

        expect(mounted.rootElement.textContent).toContain("Retry");
        expect(mounted.rootElement.textContent).not.toContain("Saved");
        expect(mutationState.setDisplayName).toHaveBeenCalledTimes(1);
      } finally {
        await unmount(mounted.root, mounted.rootElement);
      }
    },
  );

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

  it("warns about local changes and preserves external resources", async () => {
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Delete account")
          ?.click();
      });

      expect(document.body.textContent).toContain("Delete account?");
      expect(document.body.textContent).toContain(
        "Your GitHub repositories, Convex projects, Cloudflare Workers, and other external resources keep running.",
      );
      expect(document.body.textContent).toContain(
        "Any uncommitted file changes in Samebase will be permanently deleted. They will not be pushed to GitHub.",
      );
      expect(document.body.textContent).not.toContain("Unused time is not automatically refunded.");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("shows the immediate subscription cancellation warning only when active", async () => {
    queryState.settings.hasActiveSubscription = true;
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Delete account")
          ?.click();
      });

      expect(document.body.textContent).toContain(
        "Your Samebase subscription will be canceled immediately. Unused time is not automatically refunded.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("writes the accepted run marker before navigating and keeps deletion controls pending", async () => {
    const deletion = createDeferred<{ runId: string }>();
    mutationState.requestDeletion.mockReturnValue(deletion.promise);
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Delete account")
          ?.click();
      });
      const dialogDelete = Array.from(document.body.querySelectorAll("button")).find(
        (button) =>
          button.textContent === "Delete account" && !mounted.rootElement.contains(button),
      );
      await act(async () => {
        dialogDelete?.click();
        await Promise.resolve();
      });

      const pageDelete = Array.from(mounted.rootElement.querySelectorAll("button")).find((button) =>
        button.textContent.includes("Deleting..."),
      );
      expect(pageDelete?.disabled).toBe(true);
      expect(dialogDelete?.disabled).toBe(true);
      expect(routerState.navigate).not.toHaveBeenCalled();

      await act(async () => {
        deletion.resolve({ runId: "run-1" });
        await deletion.promise;
      });

      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ runId: "run-1", observedFinalizing: false });
      expect(routerState.navigate).toHaveBeenCalledWith({
        href: "/account-deletion",
        replace: true,
      });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("shows a fixed inline failure and lets the user retry", async () => {
    mutationState.requestDeletion.mockRejectedValue(new Error("provider secret response"));
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Delete account")
          ?.click();
      });
      const dialogDelete = Array.from(document.body.querySelectorAll("button")).find(
        (button) =>
          button.textContent === "Delete account" && !mounted.rootElement.contains(button),
      );
      await act(async () => {
        dialogDelete?.click();
        await Promise.resolve();
      });

      expect(document.body.textContent).toContain(
        "Could not start account deletion. Please try again.",
      );
      expect(document.body.textContent).not.toContain("provider secret response");
      expect(dialogDelete?.disabled).toBe(false);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });
});
