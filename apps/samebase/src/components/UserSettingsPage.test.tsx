// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { UserSettingsPage } from "./UserSettingsPage";

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // stable values for client function arguments.
  return value;
}

const ORGANIZATION_ID = fakeOrganizationId("organization_samebase");
const SECOND_ORGANIZATION_ID = fakeOrganizationId("organization_acme");

const organization = {
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: ORGANIZATION_ID,
  role: "owner" as const,
};

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  fetchAccessToken: vi.fn(),
  mutations: new Map<string, (args: unknown) => Promise<unknown>>(),
  queries: new Map<string, unknown>(),
  queryCalls: new Array<{ args: unknown; name: string }>(),
  route: {
    search: {},
    state: {},
  },
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(() => true),
    navigate: vi.fn(async () => undefined),
  },
  setupPopup: vi.fn<(getSetupUrl: () => Promise<string>) => Promise<void>>(),
  signOut: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ fetchAccessToken: testState.fetchAccessToken }),
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => ({ signOut: testState.signOut }),
}));

vi.mock("@/components/AccountDeletionDialog", () => ({
  AccountDeletionDialog: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close deletion dialog</button>
  ),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/githubAppSetupFlow", () => ({
  getCurrentRootRelativeUrl: () => "/settings",
  openGitHubAppSetupPopup: (getSetupUrl: () => Promise<string>) =>
    testState.setupPopup(getSetupUrl),
}));

vi.mock("@/routing/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/routing/availability")>();
  return { ...actual, readBrowserRouteEnvironment: () => "local" };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  const buildLocation = (args: {
    search?:
      | Record<string, unknown>
      | ((current: Record<string, unknown>) => Record<string, unknown>);
    to: string;
  }) => {
    const search =
      typeof args.search === "function" ? args.search(testState.route.search) : args.search;
    const params = new window.URLSearchParams();
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value === true) params.set(key, "");
      if (typeof value === "string") params.set(key, value);
    }
    return { href: `${args.to}${params.size > 0 ? `?${params.toString()}` : ""}` };
  };
  return {
    ...actual,
    getRouteApi: () => ({
      useNavigate: () => testState.router.navigate,
      useSearch: () => testState.route.search,
    }),
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useLocation: ({ select }: { select: (location: { state: unknown }) => unknown }) =>
      select({ state: testState.route.state }),
    useRouter: () => ({
      buildLocation,
      history: {
        back: testState.router.back,
        canGoBack: testState.router.canGoBack,
      },
      navigate: testState.router.navigate,
    }),
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) =>
      testState.mutations.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      const name = getFunctionName(reference);
      testState.queryCalls.push({ args, name });
      return args === "skip" ? undefined : testState.queries.get(name);
    },
  };
});

function createJwt(accountPresentation: AccountPresentation) {
  return [
    "header",
    Buffer.from(
      JSON.stringify({
        accountLabelKind: accountPresentation.kind,
        accountLabel: accountPresentation.label,
        exp: 4_100_000_000,
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
}

function setDefaultQueries(organizations: unknown[]) {
  testState.queries.set(getFunctionName(api.users.getUserSettings), {
    displayName: "Current name",
    signInEmail: "nicu@samebase.com",
  });
  testState.queries.set(getFunctionName(api.organizations.listForViewer), organizations);
  testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
    canStartCheckout: true,
    plan: "free",
    status: "inactive",
  });
  testState.queries.set(getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage), {
    cloudflareWorkers: { limit: 5, used: { count: 1, state: "exact" } },
    convexProjects: { limit: 5, used: { count: 2, state: "exact" } },
  });
}

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountSettingsPage() {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => root?.render(<UserSettingsPage />));
  return rootElement;
}

function findButton(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
}

describe("UserSettingsPage", () => {
  beforeEach(() => {
    testState.actions.clear();
    testState.fetchAccessToken.mockReset();
    testState.mutations.clear();
    testState.queries.clear();
    testState.queryCalls = [];
    testState.route.search = {};
    testState.route.state = {};
    testState.router.back.mockReset();
    testState.router.canGoBack.mockReset();
    testState.router.canGoBack.mockReturnValue(true);
    testState.router.navigate.mockReset();
    testState.router.navigate.mockResolvedValue(undefined);
    testState.setupPopup.mockReset();
    testState.setupPopup.mockImplementation(async (getSetupUrl) => {
      await getSetupUrl();
    });
    testState.signOut.mockReset();
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("offers GitHub App installation when billing has no organization", async () => {
    setDefaultQueries([]);
    const getInstallationUrl = vi.fn(
      async () => "https://github.com/apps/samebase-dev/installations/new",
    );
    testState.mutations.set(
      getFunctionName(api.githubAppInstallation.getGitHubAppInstallationUrl),
      getInstallationUrl,
    );
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("Billing");
    expect(container.textContent).toContain("Install GitHub App");
    expect(container.textContent).not.toContain("Current plan");

    await act(async () => {
      findButton(container, "Install GitHub App")?.click();
      await Promise.resolve();
    });

    expect(getInstallationUrl).toHaveBeenCalledWith({ returnToPath: "/settings" });
  });

  it("reads and starts billing for the only organization", async () => {
    setDefaultQueries([organization]);
    const createCheckout = vi.fn(() => new Promise<never>(() => undefined));
    testState.actions.set(getFunctionName(api.billing.createPolarCheckoutSession), createCheckout);
    const container = await mountSettingsPage();

    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.billing.getViewerBillingStatus),
    });
    expect(testState.queryCalls).toContainEqual({
      args: { organizationId: ORGANIZATION_ID },
      name: getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage),
    });

    await act(async () => {
      findButton(container, "Upgrade to Pro, $4/month")?.click();
      await Promise.resolve();
    });

    expect(createCheckout).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      returnUrl: `${window.location.origin}/settings?checkout=cancel`,
      successUrl: `${window.location.origin}/settings?checkout=success`,
    });
  });

  it("shows billing state but hides billing management for a member", async () => {
    setDefaultQueries([{ ...organization, role: "member" }]);
    testState.queries.set(getFunctionName(api.billing.getViewerBillingStatus), {
      canStartCheckout: false,
      plan: "pro",
      status: "active",
    });
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("Current plan");
    expect(container.textContent).toContain("Pro");
    expect(findButton(container, "Manage subscription")).toBeUndefined();
    expect(findButton(container, "Upgrade to Pro, $4/month")).toBeUndefined();
  });

  it("requires a local owner choice before reading billing for several organizations", async () => {
    setDefaultQueries([
      organization,
      {
        githubOwnerId: "789",
        githubOwnerLogin: "acme",
        githubOwnerType: "organization",
        organizationId: SECOND_ORGANIZATION_ID,
        role: "owner",
      },
    ]);
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("GitHub owner");
    expect(container.textContent).not.toContain("Current plan");
    expect(testState.queryCalls).toContainEqual({
      args: "skip",
      name: getFunctionName(api.billing.getViewerBillingStatus),
    });
  });

  it("saves the profile and refreshes the session", async () => {
    setDefaultQueries([organization]);
    const committedPresentation = {
      kind: "displayName",
      label: "Nicu",
    } satisfies AccountPresentation;
    const setDisplayName = vi.fn(async () => committedPresentation);
    testState.mutations.set(getFunctionName(api.users.setDisplayName), setDisplayName);
    testState.fetchAccessToken.mockResolvedValue(createJwt(committedPresentation));
    const container = await mountSettingsPage();
    const form = container.querySelector("form");
    const input = container.querySelector<HTMLInputElement>('[name="displayName"]');
    if (form === null || input === null) throw new Error("Profile form did not render.");

    const valueDescriptor = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    );
    if (!valueDescriptor || typeof valueDescriptor.set !== "function") {
      throw new Error("HTML input value setter is unavailable.");
    }
    valueDescriptor.set.call(input, "Nicu");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(setDisplayName).toHaveBeenCalledWith({ displayName: "Nicu" });
    expect(testState.fetchAccessToken).toHaveBeenCalledWith({ forceRefreshToken: true });
    expect(container.textContent).toContain("Saved");
  });
});
