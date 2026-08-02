// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { type AccountPresentation } from "../../shared/accountPresentation";
import type { BillingResourceUsage } from "../../convex/billingResourceQuotas";
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
  back: vi.fn(),
  buildLocation: vi.fn(),
  canGoBack: vi.fn(),
  navigate: vi.fn(),
}));
const locationState = vi.hoisted<{
  search: Record<string, unknown>;
  state: { settingsDeleteAccountDialog?: true };
}>(() => ({ search: {}, state: {} }));
const mutationState = vi.hoisted(() => ({
  requestDeletion: vi.fn(),
  setDisplayName: vi.fn(),
}));
const actionState = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  reconcileBilling: vi.fn(),
}));
const routeEnvironmentState = vi.hoisted<{ value: "local" | "preview" | "production" }>(() => ({
  value: "local",
}));
type AccountDeletionStakes = {
  vaultCount: number;
  uncommittedFileChangeCount: number | "more_than_cap";
  hasActiveSubscription: boolean;
  affectedVaults:
    | {
        state: "complete";
        vaults: Array<{
          vaultId: string;
          repositoryFullName: string;
          uncommittedFileChangeCount: number;
          branches: Array<{ branch: string; uncommittedFileChangeCount: number }>;
        }>;
      }
    | { state: "unavailable" };
};

const EMPTY_ACCOUNT_DELETION_STAKES = {
  vaultCount: 0,
  uncommittedFileChangeCount: 0,
  hasActiveSubscription: false,
  affectedVaults: { state: "complete", vaults: [] },
} satisfies AccountDeletionStakes;
const queryState = vi.hoisted<{
  billing: {
    provider?: "polar";
    plan: "free" | "pro";
    status: "inactive" | "active" | "past_due";
    currentPeriodEndAt?: number;
    cancelAtPeriodEnd?: boolean;
    canStartCheckout: boolean;
  };
  billingUsage: BillingResourceUsage;
  settings: { displayName?: string; hasActiveSubscription: boolean; signInEmail: string };
  stakes: AccountDeletionStakes | undefined;
  viewerAccess: { accessKeys: string[]; role: "role_member" | "role_staff" };
}>(() => ({
  billing: {
    plan: "free",
    status: "inactive",
    canStartCheckout: true,
  },
  billingUsage: {
    cloudflareWorkers: { used: { state: "exact", count: 1 }, limit: 5 },
    convexProjects: { used: { state: "exact", count: 2 }, limit: 5 },
  },
  settings: {
    displayName: "Current name",
    hasActiveSubscription: false,
    signInEmail: "nicu@samebase.com",
  },
  stakes: {
    vaultCount: 0,
    uncommittedFileChangeCount: 0,
    hasActiveSubscription: false,
    affectedVaults: { state: "complete", vaults: [] },
  },
  viewerAccess: {
    accessKeys: ["access_public", "access_dashboard", "access_files_read"],
    role: "role_staff",
  },
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => authState,
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => appAuthState,
}));

vi.mock("@/routing/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/routing/availability")>();
  return {
    ...actual,
    readBrowserRouteEnvironment: () => routeEnvironmentState.value,
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    getRouteApi: () => ({
      useNavigate: () => routerState.navigate,
      useSearch: () => locationState.search,
    }),
    Link: ({
      children,
      className,
      to,
      ...linkProps
    }: {
      children: ReactNode;
      className?: string;
      to: string;
      "aria-label"?: string;
    }) => (
      <a {...linkProps} className={className} href={to}>
        {children}
      </a>
    ),
    useLocation: ({
      select,
    }: {
      select: (location: { state: { settingsDeleteAccountDialog?: true } }) => unknown;
    }) => select({ state: locationState.state }),
    useRouter: () => ({
      buildLocation: routerState.buildLocation,
      history: {
        back: routerState.back,
        canGoBack: routerState.canGoBack,
      },
      navigate: routerState.navigate,
    }),
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");
  return {
    ...actual,
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(reference)) {
        case "billing:createPolarCheckoutSession":
          return actionState.createCheckoutSession;
        case "billing:createPolarCustomerPortalSession":
          return actionState.createCustomerPortalSession;
        case "billing:reconcileViewerBillingFromPolar":
          return actionState.reconcileBilling;
        default:
          throw new Error(`Unexpected action: ${getFunctionName(reference)}`);
      }
    },
    useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(reference) === "accountDeletion/index:request"
        ? mutationState.requestDeletion
        : mutationState.setDisplayName,
    useQuery: (reference: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (getFunctionName(reference) === "accountDeletion/index:stakes") {
        return args === "skip" ? undefined : queryState.stakes;
      }
      if (getFunctionName(reference) === "users:currentViewerAccess") {
        return queryState.viewerAccess;
      }
      if (getFunctionName(reference) === "billing:getViewerBillingStatus") {
        return queryState.billing;
      }
      if (getFunctionName(reference) === "billingResourceQuotas:getViewerBillingResourceUsage") {
        return queryState.billingUsage;
      }
      return queryState.settings;
    },
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
  const render = async () => {
    await act(async () => {
      root.render(<UserSettingsPage />);
    });
  };
  await render();
  return { render, root, rootElement };
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

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (!descriptor || typeof descriptor.set !== "function") {
    throw new Error("HTMLInputElement value setter is unavailable.");
  }
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openDeleteDialog(mounted: Awaited<ReturnType<typeof mountSettingsPage>>) {
  await act(async () => {
    Array.from(mounted.rootElement.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete account")
      ?.click();
  });
  locationState.search = { ...locationState.search, "delete-account": true };
  locationState.state = { settingsDeleteAccountDialog: true };
  await mounted.render();
  routerState.navigate.mockClear();

  const confirmButton = Array.from(document.body.querySelectorAll("button")).find(
    (button) => button.textContent === "Delete account" && !mounted.rootElement.contains(button),
  );
  const phraseInput = document.getElementById("settings-delete-account-confirmation");
  if (!(phraseInput instanceof HTMLInputElement)) {
    throw new Error("Confirmation phrase input did not render.");
  }
  return { confirmButton, phraseInput };
}

async function typeConfirmationPhrase(input: HTMLInputElement, phrase: string) {
  await act(async () => {
    setInputValue(input, phrase);
  });
}

describe("UserSettingsPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    authState.fetchAccessToken.mockReset();
    appAuthState.signOut.mockReset();
    actionState.createCheckoutSession.mockReset();
    actionState.createCustomerPortalSession.mockReset();
    actionState.reconcileBilling.mockReset();
    actionState.reconcileBilling.mockResolvedValue(true);
    mutationState.requestDeletion.mockReset();
    mutationState.setDisplayName.mockReset();
    routerState.navigate.mockReset();
    routerState.navigate.mockResolvedValue(undefined);
    routerState.buildLocation.mockReset();
    routerState.buildLocation.mockImplementation(
      (args: {
        search?:
          | Record<string, unknown>
          | ((currentSearch: Record<string, unknown>) => Record<string, unknown>);
        to: string;
      }) => {
        const nextSearch =
          typeof args.search === "function" ? args.search(locationState.search) : args.search;
        const params = new window.URLSearchParams();
        for (const [key, value] of Object.entries(nextSearch ?? {})) {
          if (value === true) {
            params.set(key, "");
          } else if (typeof value === "string") {
            params.set(key, value);
          }
        }
        const searchSuffix = params.size === 0 ? "" : `?${params.toString()}`;
        return { href: `${args.to}${searchSuffix}` };
      },
    );
    routerState.back.mockReset();
    routerState.canGoBack.mockReset();
    routerState.canGoBack.mockReturnValue(true);
    locationState.search = {};
    locationState.state = {};
    routeEnvironmentState.value = "local";
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    queryState.settings = {
      displayName: "Current name",
      hasActiveSubscription: false,
      signInEmail: "nicu@samebase.com",
    };
    queryState.billing = {
      plan: "free",
      status: "inactive",
      canStartCheckout: true,
    };
    queryState.billingUsage = {
      cloudflareWorkers: { used: { state: "exact", count: 1 }, limit: 5 },
      convexProjects: { used: { state: "exact", count: 2 }, limit: 5 },
    };
    queryState.stakes = EMPTY_ACCOUNT_DELETION_STAKES;
  });

  it("shows the Free plan and separate resource usage", async () => {
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Billing");
      expect(mounted.rootElement.textContent).toContain("Current planFree");
      expect(mounted.rootElement.textContent).toContain("Cloudflare Workers1 of 5");
      expect(mounted.rootElement.textContent).toContain("Convex projects2 of 5");
      const upgrade = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Upgrade to Pro, $4/month",
      );
      expect(upgrade?.disabled).toBe(false);
      expect(mounted.rootElement.textContent).not.toContain("Manage subscription");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("hides checkout from a pending Free account", async () => {
    queryState.billing = {
      plan: "free",
      status: "inactive",
      canStartCheckout: false,
    };
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Current planFree");
      expect(mounted.rootElement.textContent).not.toContain("Upgrade to Pro");
      expect(mounted.rootElement.textContent).not.toContain("Manage subscription");
      expect(actionState.createCheckoutSession).not.toHaveBeenCalled();
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("labels an at-least resource count as a lower bound", async () => {
    queryState.billing = {
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.UTC(2026, 7, 31, 12),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    };
    queryState.billingUsage = {
      cloudflareWorkers: { used: { state: "at_least", count: 41 }, limit: 40 },
      convexProjects: { used: { state: "exact", count: 40 }, limit: 40 },
    };
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Cloudflare Workers41+ of 40");
      expect(mounted.rootElement.textContent).toContain("Convex projects40 of 40");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps payment recovery available for a pending Pro account", async () => {
    queryState.billing = {
      provider: "polar",
      plan: "pro",
      status: "past_due",
      currentPeriodEndAt: Date.UTC(2026, 7, 31, 12),
      cancelAtPeriodEnd: false,
      canStartCheckout: false,
    };
    queryState.billingUsage = {
      cloudflareWorkers: { used: { state: "exact", count: 8 }, limit: 40 },
      convexProjects: { used: { state: "exact", count: 6 }, limit: 40 },
    };
    actionState.createCustomerPortalSession.mockReturnValue(new Promise(() => {}));
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Current planPro");
      expect(mounted.rootElement.textContent).toContain("Cloudflare Workers8 of 40");
      expect(mounted.rootElement.textContent).toContain("Convex projects6 of 40");
      expect(mounted.rootElement.textContent).toContain("Billing period endAug 31, 2026");
      expect(mounted.rootElement.textContent).toContain("Payment needs attention.");
      expect(mounted.rootElement.textContent).toContain("Manage subscription");
      expect(mounted.rootElement.textContent).not.toContain("Upgrade to Pro");
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Manage subscription")
          ?.click();
        await Promise.resolve();
      });
      expect(actionState.createCustomerPortalSession).toHaveBeenCalledWith({
        returnUrl: `${window.location.origin}/settings`,
      });
      expect(actionState.createCheckoutSession).not.toHaveBeenCalled();
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps cancellation access until the shown end date", async () => {
    queryState.billing = {
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.UTC(2026, 8, 4, 12),
      cancelAtPeriodEnd: true,
      canStartCheckout: true,
    };
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Current planPro");
      expect(mounted.rootElement.textContent).toContain("Access endsSep 4, 2026");
      expect(mounted.rootElement.textContent).toContain("Manage subscription");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps Free while trusted checkout reconciliation is pending", async () => {
    vi.useFakeTimers();
    locationState.search = { checkout: "success" };
    actionState.reconcileBilling.mockReturnValue(new Promise(() => {}));
    const mounted = await mountSettingsPage();
    try {
      expect(mounted.rootElement.textContent).toContain("Current planFree");
      expect(mounted.rootElement.textContent).toContain("Payment received. Checking your plan...");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(actionState.reconcileBilling).toHaveBeenCalledWith({});
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("retries one false checkout reconciliation and accepts trusted Pro state", async () => {
    vi.useFakeTimers();
    locationState.search = { checkout: "success" };
    actionState.reconcileBilling.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(2);

      queryState.billing = {
        provider: "polar",
        plan: "pro",
        status: "active",
        currentPeriodEndAt: Date.UTC(2026, 7, 31, 12),
        cancelAtPeriodEnd: false,
        canStartCheckout: true,
      };
      await mounted.render();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(mounted.rootElement.textContent).toContain("Current planPro");
      expect(mounted.rootElement.textContent).toContain("Your Pro plan is active.");
      expect(mounted.rootElement.textContent).not.toContain("We could not confirm the payment.");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("shows a terminal error when reconciliation succeeds but the plan stays Free", async () => {
    vi.useFakeTimers();
    locationState.search = { checkout: "success" };
    actionState.reconcileBilling.mockResolvedValue(true);
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Payment received. Checking your plan...");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(999);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain("Payment received. Checking your plan...");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(1);
      expect(mounted.rootElement.textContent).toContain(
        "We could not confirm the payment. Refresh this page to try again.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("stops after two false checkout reconciliations with a terminal error", async () => {
    vi.useFakeTimers();
    locationState.search = { checkout: "success" };
    actionState.reconcileBilling.mockResolvedValue(false);
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(2);
      expect(mounted.rootElement.textContent).toContain("Current planFree");
      expect(mounted.rootElement.textContent).toContain(
        "We could not confirm the payment. Refresh this page to try again.",
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(actionState.reconcileBilling).toHaveBeenCalledTimes(2);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("does not reconcile a canceled checkout", async () => {
    locationState.search = { checkout: "cancel" };
    const mounted = await mountSettingsPage();
    try {
      expect(actionState.reconcileBilling).not.toHaveBeenCalled();
      expect(mounted.rootElement.textContent).toContain(
        "Checkout canceled. Your plan did not change.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("disables Polar actions and reconciliation in a preview", async () => {
    routeEnvironmentState.value = "preview";
    locationState.search = { checkout: "success" };
    const mounted = await mountSettingsPage();
    try {
      const upgrade = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Upgrade to Pro, $4/month",
      );
      expect(upgrade?.disabled).toBe(true);
      upgrade?.click();
      expect(actionState.createCheckoutSession).not.toHaveBeenCalled();
      expect(actionState.reconcileBilling).not.toHaveBeenCalled();
      expect(mounted.rootElement.textContent).toContain(
        "Checkout confirmation is disabled in this preview.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("starts checkout with typed success and cancel return URLs", async () => {
    locationState.search = { devtools: true };
    actionState.createCheckoutSession.mockReturnValue(new Promise(() => {}));
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Upgrade to Pro, $4/month")
          ?.click();
        await Promise.resolve();
      });

      expect(actionState.createCheckoutSession).toHaveBeenCalledWith({
        returnUrl: `${window.location.origin}/settings?devtools=&checkout=cancel`,
        successUrl: `${window.location.origin}/settings?devtools=&checkout=success`,
      });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("opens the customer portal for the current Pro account", async () => {
    locationState.search = { devtools: true };
    queryState.billing = {
      provider: "polar",
      plan: "pro",
      status: "active",
      currentPeriodEndAt: Date.UTC(2026, 7, 31, 12),
      cancelAtPeriodEnd: false,
      canStartCheckout: true,
    };
    actionState.createCustomerPortalSession.mockReturnValue(new Promise(() => {}));
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Manage subscription")
          ?.click();
        await Promise.resolve();
      });

      expect(actionState.createCustomerPortalSession).toHaveBeenCalledWith({
        returnUrl: `${window.location.origin}/settings?devtools=`,
      });
      expect(actionState.createCheckoutSession).not.toHaveBeenCalled();
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
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
        setInputValue(input, "Unsaved draft");
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

  it("opens the delete dialog from the delete-account query param", async () => {
    locationState.search = { "delete-account": true };
    const mounted = await mountSettingsPage();
    try {
      expect(document.body.textContent).toContain("Delete account?");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("opens the delete dialog through route search while preserving unrelated params", async () => {
    locationState.search = { devtools: true, primary: "red-600" };
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(mounted.rootElement.querySelectorAll("button"))
          .find((button) => button.textContent === "Delete account")
          ?.click();
      });

      const openNavigation = routerState.navigate.mock.calls[0]?.[0];
      if (typeof openNavigation?.search !== "function") {
        throw new Error("Delete account navigation did not include a search updater.");
      }
      expect(openNavigation.search(locationState.search)).toEqual({
        devtools: true,
        primary: "red-600",
        "delete-account": true,
      });
      if (typeof openNavigation.state !== "function") {
        throw new Error("Delete account navigation did not mark its history entry.");
      }
      expect(openNavigation.state({ __TSR_index: 4 })).toEqual({
        __TSR_index: 4,
        settingsDeleteAccountDialog: true,
      });

      locationState.search = { ...locationState.search, "delete-account": true };
      locationState.state = { settingsDeleteAccountDialog: true };
      await mounted.render();
      routerState.navigate.mockClear();

      await act(async () => {
        Array.from(document.body.querySelectorAll("button"))
          .find((button) => button.textContent === "Cancel")
          ?.click();
      });

      expect(routerState.back).toHaveBeenCalledTimes(1);
      expect(routerState.navigate).not.toHaveBeenCalled();
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("removes delete-account in place when closing a direct dialog URL", async () => {
    locationState.search = {
      devtools: true,
      "delete-account": true,
    };
    const mounted = await mountSettingsPage();
    try {
      await act(async () => {
        Array.from(document.body.querySelectorAll("button"))
          .find((button) => button.textContent === "Cancel")
          ?.click();
      });

      expect(routerState.back).not.toHaveBeenCalled();
      const closeNavigation = routerState.navigate.mock.calls[0]?.[0];
      if (typeof closeNavigation?.search !== "function") {
        throw new Error("Delete account close did not include a search updater.");
      }
      if (typeof closeNavigation.state !== "function") {
        throw new Error("Delete account close did not clear its history marker.");
      }
      expect(closeNavigation).toMatchObject({ replace: true, to: "." });
      expect(closeNavigation.search(locationState.search)).toEqual({
        devtools: true,
        "delete-account": undefined,
      });
      expect(
        closeNavigation.state({
          __TSR_index: 4,
          settingsDeleteAccountDialog: true,
        }),
      ).toEqual({
        __TSR_index: 4,
        settingsDeleteAccountDialog: undefined,
      });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("resets confirmation state when browser history closes and reopens the dialog", async () => {
    const mounted = await mountSettingsPage();
    try {
      const { phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");

      locationState.search = {};
      locationState.state = {};
      await mounted.render();
      expect(document.getElementById("settings-delete-account-confirmation")).toBeNull();

      locationState.search = { "delete-account": true };
      locationState.state = { settingsDeleteAccountDialog: true };
      await mounted.render();

      const reopenedInput = document.getElementById("settings-delete-account-confirmation");
      if (!(reopenedInput instanceof HTMLInputElement)) {
        throw new Error("Confirmation phrase input did not reopen.");
      }
      expect(reopenedInput.value).toBe("");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("separates the destructive consequence from the external-resource reassurance", async () => {
    const mounted = await mountSettingsPage();
    try {
      await openDeleteDialog(mounted);

      expect(document.body.textContent).toContain("Delete account?");
      expect(document.body.textContent).toContain(
        "This permanently deletes your Samebase account and data.",
      );
      expect(document.body.textContent).toContain(
        "Nothing outside Samebase is deleted: your apps, GitHub repositories, Convex projects, and Cloudflare Workers keep running.",
      );
      expect(document.body.textContent).not.toContain("will be permanently deleted");
      expect(document.body.textContent).not.toContain("Unused time is not automatically refunded.");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("shows the immediate subscription cancellation warning only when active", async () => {
    queryState.stakes = {
      ...EMPTY_ACCOUNT_DELETION_STAKES,
      hasActiveSubscription: true,
    };
    const mounted = await mountSettingsPage();
    try {
      await openDeleteDialog(mounted);

      expect(document.body.textContent).toContain(
        "Your Samebase subscription will be canceled immediately. Unused time is not automatically refunded.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("renders the stakes phrase and enables deletion only on an exact match", async () => {
    locationState.search = { devtools: true, primary: "red-600" };
    queryState.stakes = {
      vaultCount: 2,
      uncommittedFileChangeCount: 3,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId: "vault-1",
            repositoryFullName: "samebase/notes",
            uncommittedFileChangeCount: 3,
            branches: [
              { branch: "feature/review", uncommittedFileChangeCount: 2 },
              { branch: "main", uncommittedFileChangeCount: 1 },
            ],
          },
        ],
      },
    };
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);

      expect(document.body.textContent).toContain(
        "3 uncommitted file changes will be permanently deleted. They will not be pushed to GitHub.",
      );
      expect(document.body.textContent).toContain("samebase/notes");
      expect(document.body.textContent).toContain("feature/review · 2 files");
      expect(document.body.textContent).toContain("main · 1 file");
      const reviewLink = document.body.querySelector<HTMLAnchorElement>(
        '[aria-label="Review changes in samebase/notes on feature/review"]',
      );
      const expectedReviewHref =
        "/vault/samebase/notes/fs/feature%2Freview?devtools&primary=red-600&diff&compare";
      expect(reviewLink?.getAttribute("href")).toBe(expectedReviewHref);
      await act(async () => {
        reviewLink?.click();
      });
      expect(routerState.navigate).toHaveBeenCalledWith({ href: expectedReviewHref });
      expect(document.body.textContent).toContain("Type the phrase to confirm");
      expect(document.body.textContent).toContain(
        "delete my account, 2 vaults, and 3 uncommitted file changes",
      );
      expect(confirmButton?.disabled).toBe(true);

      await typeConfirmationPhrase(phraseInput, "delete my account");
      expect(confirmButton?.disabled).toBe(true);

      await typeConfirmationPhrase(
        phraseInput,
        "delete my account, 2 vaults, and 3 uncommitted file changes",
      );
      expect(confirmButton?.disabled).toBe(false);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps deletion disabled while the stakes are still loading", async () => {
    queryState.stakes = undefined;
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);

      await typeConfirmationPhrase(phraseInput, "delete my account");
      expect(confirmButton?.disabled).toBe(true);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("uses the vault page when a complete review list is unavailable", async () => {
    queryState.stakes = {
      vaultCount: 1,
      uncommittedFileChangeCount: "more_than_cap",
      hasActiveSubscription: false,
      affectedVaults: { state: "unavailable" },
    };
    const mounted = await mountSettingsPage();
    try {
      await openDeleteDialog(mounted);

      expect(document.body.textContent).toContain(
        "More than 500 uncommitted file changes will be permanently deleted.",
      );
      expect(
        Array.from(document.body.querySelectorAll<HTMLAnchorElement>("a"))
          .find((link) => link.textContent === "Review changes")
          ?.getAttribute("href"),
      ).toBe("/vault");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("keeps file-change stakes visible without offering members an inaccessible review link", async () => {
    queryState.viewerAccess = {
      accessKeys: ["access_public", "access_dashboard", "access_schema_graph"],
      role: "role_member",
    };
    queryState.stakes = {
      vaultCount: 1,
      uncommittedFileChangeCount: 2,
      hasActiveSubscription: false,
      affectedVaults: {
        state: "complete",
        vaults: [
          {
            vaultId: "vault-1",
            repositoryFullName: "samebase/notes",
            uncommittedFileChangeCount: 2,
            branches: [{ branch: "feature/review", uncommittedFileChangeCount: 2 }],
          },
        ],
      },
    };
    const mounted = await mountSettingsPage();
    try {
      await openDeleteDialog(mounted);

      expect(document.body.textContent).toContain("feature/review · 2 files");
      expect(document.body.textContent).not.toContain("Review changes");
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("asks for a new confirmation when the stakes changed during the request", async () => {
    mutationState.requestDeletion.mockImplementation(async () => {
      queryState.stakes = {
        vaultCount: 1,
        uncommittedFileChangeCount: 1,
        hasActiveSubscription: false,
        affectedVaults: {
          state: "complete",
          vaults: [
            {
              vaultId: "vault-1",
              repositoryFullName: "samebase/notes",
              uncommittedFileChangeCount: 1,
              branches: [{ branch: "main", uncommittedFileChangeCount: 1 }],
            },
          ],
        },
      };
      return { state: "stakes_changed" };
    });
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      expect(mutationState.requestDeletion).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain(
        "The account data changed. Review and confirm again.",
      );
      expect(document.body.textContent).toContain(
        "delete my account, 1 vault, and 1 uncommitted file change",
      );
      expect(document.body.textContent).toContain(
        "1 uncommitted file change will be permanently deleted. It will not be pushed to GitHub.",
      );
      expect(routerState.navigate).not.toHaveBeenCalled();
      expect(confirmButton?.disabled).toBe(true);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("shows a newly active subscription before allowing confirmation again", async () => {
    mutationState.requestDeletion.mockImplementation(async () => {
      queryState.stakes = {
        ...EMPTY_ACCOUNT_DELETION_STAKES,
        hasActiveSubscription: true,
      };
      return { state: "stakes_changed" };
    });
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      expect(document.body.textContent).toContain(
        "Your Samebase subscription will be canceled immediately. Unused time is not automatically refunded.",
      );
      expect(document.body.textContent).toContain(
        "The account data changed. Review and confirm again.",
      );
      expect(confirmButton?.disabled).toBe(true);
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("persists the completion capability before requesting deletion", async () => {
    const deletion = createDeferred<{
      state: "accepted";
      status: { completionCapability: string; runId: string };
    }>();
    mutationState.requestDeletion.mockReturnValue(deletion.promise);
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      const pageDelete = Array.from(mounted.rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Delete account",
      );
      expect(pageDelete?.disabled).toBe(true);
      expect(confirmButton?.disabled).toBe(true);
      expect(routerState.navigate).not.toHaveBeenCalled();
      const requestArgs = mutationState.requestDeletion.mock.calls[0]?.[0];
      expect(requestArgs?.completionCapability).toMatch(/^[0-9a-f]{64}$/);
      expect(requestArgs?.confirmationPhrase).toBe("delete my account");
      expect(JSON.parse(requestArgs?.confirmationStakesSnapshot ?? "null")).toEqual(
        EMPTY_ACCOUNT_DELETION_STAKES,
      );
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability: requestArgs?.completionCapability });

      await act(async () => {
        deletion.resolve({
          state: "accepted",
          status: {
            completionCapability: requestArgs?.completionCapability ?? "",
            runId: "run-1",
          },
        });
        await deletion.promise;
      });

      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability: requestArgs?.completionCapability });
      expect(routerState.navigate).toHaveBeenCalledWith({
        href: "/account-deletion",
        replace: true,
      });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("does not request deletion when the capability cannot be persisted", async () => {
    const blockedStorage = createTestStorage();
    blockedStorage.setItem = () => {
      throw new Error("blocked");
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    });
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      expect(mutationState.requestDeletion).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain(
        "Could not start account deletion. Please try again.",
      );
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });

  it("reuses the persisted completion capability when a deletion request is retried", async () => {
    mutationState.requestDeletion.mockRejectedValue(new Error("provider secret response"));
    const mounted = await mountSettingsPage();
    try {
      const { confirmButton, phraseInput } = await openDeleteDialog(mounted);
      await typeConfirmationPhrase(phraseInput, "delete my account");
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      expect(document.body.textContent).toContain(
        "Could not start account deletion. Please try again.",
      );
      expect(document.body.textContent).not.toContain("provider secret response");
      expect(confirmButton?.disabled).toBe(false);

      const firstCapability =
        mutationState.requestDeletion.mock.calls[0]?.[0]?.completionCapability;
      await act(async () => {
        confirmButton?.click();
        await Promise.resolve();
      });

      expect(mutationState.requestDeletion).toHaveBeenCalledTimes(2);
      expect(mutationState.requestDeletion.mock.calls[1]?.[0]?.completionCapability).toBe(
        firstCapability,
      );
      expect(
        JSON.parse(window.localStorage.getItem("samebase:account-deletion") ?? "null"),
      ).toEqual({ completionCapability: firstCapability });
    } finally {
      await unmount(mounted.root, mounted.rootElement);
    }
  });
});
