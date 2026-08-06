// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { type AccountPresentation } from "../../shared/accountPresentation";
import { UserSettingsPage } from "./UserSettingsPage";

const { act } = React;

const testState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
  fetchAccessToken: vi.fn(),
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
  openGitHubAppSetupPopup: (getSetupUrl: () => Promise<string>) =>
    testState.setupPopup(getSetupUrl),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
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
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      testState.actions.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useMutation: (reference: Parameters<typeof actual.useMutation>[0]) =>
      testState.mutations.get(getFunctionName(reference)) ?? vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0]) =>
      testState.queries.get(getFunctionName(reference)),
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

function setDefaultQueries() {
  testState.queries.set(getFunctionName(api.users.getUserSettings), {
    displayName: "Current name",
    signInEmail: "nicu@samebase.com",
  });
  testState.queries.set(getFunctionName(api.githubUserAuthorizations.getViewerStatus), {
    status: "not_connected",
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

  it("starts personal GitHub authorization from account settings", async () => {
    const getAuthorizationUrl = vi.fn(async () => "https://github.com/login/oauth/authorize");
    testState.mutations.set(
      getFunctionName(api.githubAppInstallation.getGitHubUserAuthorizationUrl),
      getAuthorizationUrl,
    );
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("Not connected");
    expect(container.textContent).not.toContain("Billing");
    await act(async () => {
      findButton(container, "Authorize GitHub account")?.click();
      await Promise.resolve();
    });

    expect(getAuthorizationUrl).toHaveBeenCalledWith({ returnToPath: "/settings" });
  });

  it("shows and revokes a current personal GitHub authorization", async () => {
    testState.queries.set(getFunctionName(api.githubUserAuthorizations.getViewerStatus), {
      githubUserLogin: "nicubunu",
      refreshTokenExpiresAt: Date.now() + 60_000,
      status: "authorized",
    });
    const revokeAuthorization = vi.fn(async () => null);
    testState.actions.set(
      getFunctionName(api.githubUserAuthorizations.revokeViewerAuthorization),
      revokeAuthorization,
    );
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("nicubunu");
    expect(container.textContent).toContain("Connected");
    await act(async () => {
      findButton(container, "Revoke authorization")?.click();
      await Promise.resolve();
    });

    expect(revokeAuthorization).toHaveBeenCalledWith({});
  });

  it("marks an expired personal GitHub authorization", async () => {
    testState.queries.set(getFunctionName(api.githubUserAuthorizations.getViewerStatus), {
      githubUserLogin: "nicubunu",
      refreshTokenExpiresAt: 0,
      status: "authorized",
    });
    const container = await mountSettingsPage();

    expect(container.textContent).toContain("Expired");
    expect(findButton(container, "Authorize GitHub account")).toBeDefined();
  });

  it("saves the profile and refreshes the session", async () => {
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
