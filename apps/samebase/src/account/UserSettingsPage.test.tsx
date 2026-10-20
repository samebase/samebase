// @vitest-environment jsdom

import "@/test/reactActEnvironment";
import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { UserSettingsPage } from "./UserSettingsPage";

const { act } = React;

const testState = vi.hoisted(() => ({
  mutations: new Map<string, (args: unknown) => Promise<unknown>>(),
  queries: new Map<string, unknown>(),
  route: {
    search: {},
    state: {},
  },
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(() => true),
    navigate: vi.fn(async () => undefined),
  },
  signOut: vi.fn(),
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => ({ signOut: testState.signOut }),
}));

vi.mock("@/account/AccountDeletionDialog", () => ({
  AccountDeletionDialog: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close deletion dialog</button>
  ),
}));

vi.mock("@/account/McpClientsSettingsSection", () => ({
  McpClientsSettingsSection: () => (
    <section data-testid="mcp-clients-settings-section">MCP clients</section>
  ),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children, className, to }: React.ComponentProps<"a"> & { to: string }) => (
      <a className={className} href={to}>
        {children}
      </a>
    ),
    getRouteApi: () => ({
      useNavigate: () => testState.router.navigate,
      useSearch: () => testState.route.search,
    }),
    useLocation: ({ select }: { select: (location: { state: unknown }) => unknown }) =>
      select({ state: testState.route.state }),
    useRouter: () => ({
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
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) =>
      testState.mutations.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) =>
      args === "skip" ? undefined : testState.queries.get(getFunctionName(reference)),
  };
});

function setDefaultQueries() {
  testState.queries.set(getFunctionName(api.users.currentViewerAccess), {
    accessKeys: [
      "access_public",
      "access_account_deletion",
      "access_account_settings",
      "access_user_preferences",
    ],
    role: "role_member",
    termsAccepted: true,
  });
  testState.queries.set(getFunctionName(api.users.getUserSettings), {
    accountEmail: "nicu@samebase.com",
    displayName: "Current name",
    signInMethods: {
      github: null,
      google: { email: "nicu@samebase.com" },
      password: null,
    },
  });
  testState.queries.set(getFunctionName(api.users.getSessionRecordingConsent), {
    state: "denied",
  });
  testState.queries.set(getFunctionName(api.users.getProductUpdateEmailConsent), {
    state: "denied",
  });
}

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountSettingsPage(
  termsAccepted = true,
  role: "role_member" | "role_pending_access" | "role_terms_pending" = "role_member",
) {
  testState.queries.set(getFunctionName(api.users.currentViewerAccess), {
    accessKeys:
      role === "role_terms_pending"
        ? ["access_public", "access_account_deletion", "access_account_settings"]
        : [
            "access_public",
            "access_account_deletion",
            "access_account_settings",
            "access_user_preferences",
          ],
    role,
    termsAccepted,
  });
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
    testState.mutations.clear();
    testState.queries.clear();
    testState.route.search = {};
    testState.route.state = {};
    testState.router.back.mockReset();
    testState.router.canGoBack.mockReset();
    testState.router.canGoBack.mockReturnValue(true);
    testState.router.navigate.mockReset();
    testState.router.navigate.mockResolvedValue(undefined);
    testState.signOut.mockReset();
    window.history.replaceState({}, "", "/settings");
    setDefaultQueries();
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("lists the sign-in methods without a Connect action", async () => {
    testState.queries.set(getFunctionName(api.users.getUserSettings), {
      accountEmail: "account@samebase.com",
      displayName: "Current name",
      signInMethods: {
        github: null,
        google: null,
        password: null,
      },
    });
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("Not connected");
    expect(findButton(container, "Connect GitHub")).toBeUndefined();
    expect(findButton(container, "Connect Google")).toBeUndefined();
  });

  it("shows only account exit actions before Terms acceptance", async () => {
    const container = await mountSettingsPage(false, "role_terms_pending");

    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Sign out",
      "Delete account",
    ]);
    expect(container.textContent).not.toContain("Profile");
    expect(container.textContent).not.toContain("Sign-in methods");
    expect(container.textContent).not.toContain("MCP clients");
  });

  it("shows only account exit actions before account approval", async () => {
    const container = await mountSettingsPage(true, "role_pending_access");

    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Sign out",
      "Delete account",
    ]);
    expect(container.textContent).not.toContain("Profile");
    expect(container.textContent).not.toContain("Sign-in methods");
    expect(container.textContent).not.toContain("MCP clients");
  });

  it("shows the GitHub sign-in row and hides the connected Google account", async () => {
    testState.queries.set(getFunctionName(api.users.getUserSettings), {
      accountEmail: "account@samebase.com",
      displayName: "Current name",
      signInMethods: {
        github: { login: "octocat" },
        google: { email: "google@example.com" },
        password: null,
      },
    });
    const container = await mountSettingsPage();
    const signInMethodsSection = container.querySelector(
      '[aria-labelledby="settings-sign-in-methods-heading"]',
    );

    expect(signInMethodsSection).not.toBeNull();
    expect(signInMethodsSection?.id).toBe("sign-in-methods");
    expect(
      [...(signInMethodsSection?.querySelectorAll("dt") ?? [])].map((term) => term.textContent),
    ).toEqual(["GitHub"]);
    expect(signInMethodsSection?.textContent).not.toContain("google@example.com");
    expect(signInMethodsSection?.textContent).toContain("@octocat");
    expect(findButton(container, "Connect Google")).toBeUndefined();
    expect(findButton(container, "Connect GitHub")).toBeUndefined();
    expect(container.textContent).not.toContain("Remove");
    expect(container.textContent).not.toContain("GitHub access");
    expect(container.textContent).not.toContain("Personal repository creation");
  });

  it("labels the stable address as Account email", async () => {
    testState.queries.set(getFunctionName(api.users.getUserSettings), {
      accountEmail: "account@samebase.com",
      displayName: "Current name",
      signInMethods: {
        github: null,
        google: { email: "google@example.com" },
        password: null,
      },
    });
    const container = await mountSettingsPage();
    const accountSection = container.querySelector('[aria-labelledby="settings-account-heading"]');

    expect(accountSection?.textContent).toContain("Account email");
    expect(accountSection?.textContent).toContain("account@samebase.com");
    expect(accountSection?.textContent).not.toContain("Sign-in email");
  });

  it("changes the saved session recording choice", async () => {
    testState.queries.set(getFunctionName(api.users.getSessionRecordingConsent), {
      state: "granted",
    });
    const setSessionRecordingConsent = vi.fn(async () => null);
    testState.mutations.set(
      getFunctionName(api.users.setSessionRecordingConsent),
      setSessionRecordingConsent,
    );
    const container = await mountSettingsPage();
    const checkbox = container.querySelector<HTMLButtonElement>("#settings-session-recording");

    expect(container.textContent).toContain("Privacy");
    expect(container.textContent).toContain("Help improve Samebase");
    expect(container.textContent).toContain(
      "Share recordings of how you use Samebase. Inputs and code stay hidden.",
    );
    expect(container.querySelector('a[href="/privacy"]')?.textContent).toBe("What gets recorded");

    await act(async () => {
      checkbox?.click();
      await Promise.resolve();
    });

    expect(setSessionRecordingConsent).toHaveBeenCalledWith({ decision: "denied" });
  });

  it("changes the saved product-update email choice", async () => {
    testState.queries.set(getFunctionName(api.users.getProductUpdateEmailConsent), {
      state: "granted",
    });
    const setProductUpdateEmailConsent = vi.fn(async () => null);
    testState.mutations.set(
      getFunctionName(api.users.setProductUpdateEmailConsent),
      setProductUpdateEmailConsent,
    );
    const container = await mountSettingsPage();
    const checkbox = container.querySelector<HTMLButtonElement>("#settings-product-update-emails");

    expect(container.textContent).toContain("Email");
    expect(container.textContent).toContain("Product updates");
    expect(container.textContent).not.toContain("Receive occasional Samebase product updates");

    await act(async () => {
      checkbox?.click();
      await Promise.resolve();
    });

    expect(setProductUpdateEmailConsent).toHaveBeenCalledWith({
      decision: "denied",
      source: "account_settings",
    });
  });

  it("saves the profile", async () => {
    const committedPresentation = {
      kind: "displayName",
      label: "Nicu",
    } satisfies AccountPresentation;
    const setDisplayName = vi.fn(async () => committedPresentation);
    testState.mutations.set(getFunctionName(api.users.setDisplayName), setDisplayName);
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
    expect(container.textContent).toContain("Saved");
  });
});
