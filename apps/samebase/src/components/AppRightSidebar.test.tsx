// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { getFunctionName } from "convex/server";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AppRightSidebarContent } from "./AppRightSidebar";
import type { AppOrganizationSurface, ViewerOrganization } from "@/lib/organizationContext";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
}));
const queryState = vi.hoisted<{
  blockedQueryNames: Set<string>;
  index: number;
  results: unknown[];
  resultsByQueryName: Map<string, unknown>;
  seenQueryNames: string[];
}>(() => ({
  blockedQueryNames: new Set(),
  index: 0,
  results: [],
  resultsByQueryName: new Map(),
  seenQueryNames: [],
}));
const mutationState = vi.hoisted(() => new Map<string, (args: unknown) => Promise<unknown>>());
const organizationContextState = vi.hoisted<{
  organizations: ViewerOrganization[] | undefined;
  surface: AppOrganizationSurface;
}>(() => ({
  organizations: undefined,
  surface: { kind: "allVaults" },
}));
const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";
const PROFILE_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "Nicu",
  exp: 4100000000,
});
const PROFILE_PROVIDER_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "Nicu",
  authProvider: "password",
  exp: 4100000000,
});
const PROVIDER_STATUS_QUERY_NAMES = new Set([
  getFunctionName(api.users.getConvexConnectionStatus),
  getFunctionName(api.users.getCloudflareConnectionStatus),
]);

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for the organization context.
  return value;
}

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
}

function createTestStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

function createAsyncHandler() {
  const handler = vi.fn(() => Promise.resolve(undefined));
  const handlerWithOptimisticUpdate = Object.assign(handler, {
    withOptimisticUpdate: () => handlerWithOptimisticUpdate,
  });

  return handlerWithOptimisticUpdate;
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: createAsyncHandler,
    useConvexAuth: () => authState,
    useMutation: (mutation: Parameters<typeof actual.useMutation>[0]) =>
      mutationState.get(getFunctionName(mutation)) ?? createAsyncHandler(),
    useQuery: (query: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      if (args === "skip") {
        return undefined;
      }

      const queryName = getFunctionName(query);
      queryState.seenQueryNames.push(queryName);
      if (queryState.blockedQueryNames.has(queryName)) {
        throw new Error(`Unexpected provider status query: ${queryName}`);
      }
      if (queryState.resultsByQueryName.has(queryName)) {
        return queryState.resultsByQueryName.get(queryName);
      }

      const result =
        queryState.results.length === 0
          ? undefined
          : queryState.results[queryState.index % queryState.results.length];
      queryState.index += 1;
      return result;
    },
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: vi.fn(),
  useAppAuthActions: () => ({
    signOut: vi.fn(),
  }),
  useAppSignInActions: () => ({
    signInWithGoogle: vi.fn(),
    signInWithPassword: vi.fn(),
  }),
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@/lib/organizationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/organizationContext")>();
  return {
    ...actual,
    useOrganizationContext: () => organizationContextState,
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    Link: ({
      children,
      className,
      onClick,
      params,
      to,
    }: {
      children?: ReactNode;
      className?: string;
      onClick?: () => void;
      params?: { owner?: string };
      to: string;
    }) => (
      <a
        className={className}
        href={params?.owner ? to.replace("$owner", params.owner) : to}
        onClick={onClick}
      >
        {children}
      </a>
    ),
    useLocation: () => ({
      href: "/vault",
      pathname: "/vault",
      searchStr: "",
    }),
    useMatches: ({
      select,
    }: {
      select: (
        matches: Array<{ staticData: { access: "access_public" | "access_dashboard" } }>,
      ) => unknown;
    }) =>
      select([
        { staticData: { access: "access_public" } },
        { staticData: { access: "access_dashboard" } },
      ]),
    useNavigate: () => vi.fn(),
    useRouter: () => ({
      buildLocation: () => ({ href: "/" }),
    }),
  };
});

function prepareRightSidebar(queryResults: unknown[]) {
  queryState.index = 0;
  queryState.results = queryResults;
  queryState.resultsByQueryName = new Map();
  queryState.seenQueryNames = [];
}

function prepareRightSidebarNamed(queryResults: ReadonlyMap<string, unknown>) {
  queryState.index = 0;
  queryState.results = [];
  queryState.resultsByQueryName = new Map(queryResults);
  queryState.seenQueryNames = [];
}

function blockProviderStatusQueries() {
  queryState.blockedQueryNames = new Set(PROVIDER_STATUS_QUERY_NAMES);
}

function expectProviderStatusQueriesNotSeen() {
  for (const queryName of PROVIDER_STATUS_QUERY_NAMES) {
    expect(queryState.seenQueryNames).not.toContain(queryName);
  }
}

function createRightSidebarElement() {
  return (
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AppRightSidebarContent />
    </AppAuthPresentationProvider>
  );
}

function renderRightSidebar(queryResults: unknown[]) {
  prepareRightSidebar(queryResults);

  return renderToStaticMarkup(createRightSidebarElement());
}

async function renderRightSidebarAfterEffects(queryResults: unknown[]) {
  const mounted = await mountRightSidebarAfterEffects(queryResults);
  const markup = mounted.rootElement.innerHTML;
  await mounted.unmount();
  return markup;
}

async function renderRightSidebarAfterEffectsWithNamedQueries(
  queryResults: ReadonlyMap<string, unknown>,
) {
  prepareRightSidebarNamed(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(createRightSidebarElement());
    });

    return rootElement.innerHTML;
  } finally {
    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  }
}

async function mountRightSidebarAfterEffects(queryResults: unknown[]) {
  prepareRightSidebar(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(createRightSidebarElement());
  });

  return {
    rootElement,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    },
  };
}

describe("AppRightSidebarContent", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/vault");
    queryState.index = 0;
    queryState.results = [];
    queryState.resultsByQueryName = new Map();
    queryState.blockedQueryNames = new Set();
    queryState.seenQueryNames = [];
    mutationState.clear();
    organizationContextState.organizations = undefined;
    organizationContextState.surface = { kind: "allVaults" };
  });

  it("does not treat a profileless JWT as temporary auth", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
    expect(hydratedMarkup).not.toContain("Account settings");
  });

  it("shows the single signed-out auth surface in the protected-route sidebar", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;

    const markup = renderRightSidebar([]);

    expect(markup).toContain("Sign in or create an account");
    expect(markup).toContain("Continue with GitHub");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("/providers");
    expect(markup).not.toContain(">/vault<");
    expect(markup).not.toContain("Watch the complete onboarding");
  });

  it("matches the signed-out GitHub geometry while keeping the placeholder non-interactive", () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const rootElement = document.createElement("div");
    rootElement.innerHTML = markup;
    const githubPlaceholder = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Continue with GitHub",
    );

    if (!(githubPlaceholder instanceof HTMLButtonElement)) {
      throw new Error("Prehydration GitHub placeholder not found.");
    }
    const signedOutLabel = rootElement.querySelector(
      "[data-app-auth-prehydration-signed-out-label]",
    );
    if (!(signedOutLabel instanceof HTMLElement)) {
      throw new Error("Prehydration signed-out label not found.");
    }

    expect(rootElement.textContent).not.toContain("Continue with Google");
    expect(githubPlaceholder.disabled).toBe(true);
    expect(githubPlaceholder.getAttribute("aria-hidden")).toBe("true");
    expect(githubPlaceholder.tabIndex).toBe(-1);
    expect(githubPlaceholder.classList).toContain("w-fit");
    expect(githubPlaceholder.classList).toContain("max-w-full");
    expect(githubPlaceholder.classList).toContain("px-6");
    expect(githubPlaceholder.classList).toContain("bg-primary");
    expect(githubPlaceholder.classList).not.toContain("flex-1");
    expect(githubPlaceholder.parentElement?.parentElement?.classList).toContain("items-center");
    expect(signedOutLabel.classList).toContain("text-center");
  });

  it("uses the public signed-out account row after hydration when loading without local auth material", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("keeps checking login while a refresh token may restore the session", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("uses local JWT profile claims after hydration for the temporary signed-in account row", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(markup).toContain("data-app-auth-prehydration-signed-in");
    expect(markup).toContain("dashboard-sidebar-account-icon");
    expect(markup).not.toContain("data-app-auth-prehydration-provider");
    expect(markup).toContain("Account settings");
    expect(markup).not.toContain("Sign out");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup).not.toContain("Sign out");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("renders the temporary signed-in account row without an accordion trigger", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const mounted = await mountRightSidebarAfterEffects([]);
    try {
      expect(mounted.rootElement.textContent).toContain("Nicu");
      expect(mounted.rootElement.textContent).toContain("Account settings");
      expect(mounted.rootElement.textContent).not.toContain("Sign out");
      expect(mounted.rootElement.querySelector("[aria-expanded]")).toBeNull();
    } finally {
      await mounted.unmount();
    }
  });

  it("uses the JWT auth provider while authenticated app access loads", async () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      PROFILE_PROVIDER_JWT,
    );

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("Signed in with");
    expect(hydratedMarkup).not.toContain("checking login");
  });

  it("keeps local JWT profile claims after hydration while authenticated app access loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);
    const accountIndex = hydratedMarkup.indexOf("Nicu");

    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(markup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("keeps provider controls hidden while authenticated app access loads", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain("/providers");
    expectProviderStatusQueriesNotSeen();
  });

  it("loads the account row without provider controls for confirmed pending-access users", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_pending_access",
            accessKeys: [
              "access_public",
              "access_account_deletion",
              "access_account_settings",
              "access_organization_invitation_accept",
              "access_user_preferences",
            ],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_pending-access",
            accountPresentation: {
              kind: "email",
              label: "pending-access@example.com",
            },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain("pending-access@example.com");
    expect(hydratedMarkup).toContain("Beta access pending");
    expect(hydratedMarkup).toContain(
      "Samebase is currently in private beta, so access is approved manually.",
    );
    expect(hydratedMarkup).toContain("You’re signed in as");
    expect(hydratedMarkup).toContain(
      "This page will update automatically when your account is approved.",
    );
    expect(hydratedMarkup).toContain('role="status"');
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup).not.toContain("Pending Access User");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
    expect(hydratedMarkup).not.toContain("/new-app");
    expect(hydratedMarkup).not.toContain("organization-context-control");
    expectProviderStatusQueriesNotSeen();
  });

  it("keeps All vaults visible before the viewer accepts the terms", async () => {
    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_terms_pending",
            termsAccepted: false,
            accessKeys: ["access_public", "access_account_deletion", "access_account_settings"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_terms-pending",
            accountPresentation: {
              kind: "email",
              label: "terms-pending@example.com",
            },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup).not.toContain("organization-context-control");
  });

  it("shows a non-interactive account state while deletion runs", async () => {
    blockProviderStatusQueries();

    const mounted = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_deleting",
            accessKeys: ["access_public", "access_account_deletion"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_deleting",
            accountPresentation: {
              kind: "email",
              label: "deleting@example.com",
            },
          },
        ],
      ]),
    );

    expect(mounted).toContain("deleting@example.com");
    expect(mounted).toContain("Deleting account");
    expect(mounted).toContain('role="status"');
    expect(mounted).toContain('href="/vault"');
    expect(mounted).not.toContain("/settings");
    expect(mounted).not.toContain("/providers");
    expect(mounted).not.toContain("organization-context-control");
    expectProviderStatusQueriesNotSeen();
  });

  it("renders global account navigation after the authenticated viewer loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "not_decided" }],
        [
          getFunctionName(api.vault.dashboard.getUserVaults),
          [{ hasConvexProvision: true, hasCloudflareProvision: false }],
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: {
              kind: "email",
              label: "nicu@samebase.md",
            },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain("nicu@samebase.md");
    expect(hydratedMarkup).not.toContain("Nicu");
    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup).toContain("All vaults");
    expect(hydratedMarkup).toContain("No organization selected");
    expect(hydratedMarkup).not.toContain("/settings/mcp");
    expect(hydratedMarkup).not.toContain("MCP clients");
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).not.toContain("/org/");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
    expect(hydratedMarkup).toContain('data-testid="organization-context-control"');
    expect(hydratedMarkup).not.toContain("/admin/users");
    expect(hydratedMarkup).not.toContain("/admin/account-deletions");
    expect(hydratedMarkup).not.toContain("youtube-nocookie.com");
    expect(hydratedMarkup).toContain("Help improve Samebase");
    expect(hydratedMarkup).toContain("Allow recording");
    expect(hydratedMarkup).toContain("No thanks");
    expect(hydratedMarkup).toContain('href="/privacy"');
    expect(hydratedMarkup).toContain("First time using Samebase?");
    expect(hydratedMarkup).toContain("Watch the complete onboarding on ");
    expect(hydratedMarkup).toContain('class="text-red-600">YouTube</span>');
    expect(hydratedMarkup).toContain(
      'class="mt-2 block" href="https://youtu.be/8-ZEGPpqi9Y" rel="noreferrer" target="_blank"',
    );
    expect(hydratedMarkup.indexOf("First time using Samebase?")).toBeLessThan(
      hydratedMarkup.indexOf("Watch the complete onboarding on "),
    );
    expect(hydratedMarkup.indexOf("Watch the complete onboarding on ")).toBeLessThan(
      hydratedMarkup.indexOf('src="/onboarding/complete-onboarding-poster.webp"'),
    );
    expect(hydratedMarkup.indexOf("Watch the complete onboarding on ")).toBeLessThan(
      hydratedMarkup.indexOf('href="/terms"'),
    );
    expect(hydratedMarkup.indexOf("Help improve Samebase")).toBeLessThan(
      hydratedMarkup.indexOf("First time using Samebase?"),
    );
    expectProviderStatusQueriesNotSeen();
  });

  it("saves a denied session recording choice from the sidebar", async () => {
    const setSessionRecordingConsent = vi.fn(async () => null);
    mutationState.set(
      getFunctionName(api.users.setSessionRecordingConsent),
      setSessionRecordingConsent,
    );
    prepareRightSidebarNamed(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "not_decided" }],
        [getFunctionName(api.vault.dashboard.getUserVaults), []],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: { kind: "email", label: "nicu@samebase.md" },
          },
        ],
      ]),
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => root.render(createRightSidebarElement()));
      const denyButton = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "No thanks",
      );
      await act(async () => {
        denyButton?.click();
        await Promise.resolve();
      });

      expect(setSessionRecordingConsent).toHaveBeenCalledWith({ decision: "denied" });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("hides onboarding after one vault has both provider attachments", async () => {
    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [
          getFunctionName(api.vault.dashboard.getUserVaults),
          [{ hasConvexProvision: true, hasCloudflareProvision: true }],
        ],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "granted" }],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: {
              kind: "email",
              label: "nicu@samebase.md",
            },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).not.toContain("First time using Samebase?");
    expect(hydratedMarkup).not.toContain("/onboarding/complete-onboarding-poster.webp");
    expect(hydratedMarkup).not.toContain("Help improve Samebase");
  });

  it("renders both admin routes for staff", async () => {
    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_staff",
            accessKeys: ["access_public", "access_provider_connections", "access_admin"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_staff",
            accountPresentation: {
              kind: "email",
              label: "staff@example.test",
            },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain('aria-label="Admin"');
    expect(hydratedMarkup).toContain('href="/admin/users"');
    expect(hydratedMarkup).toContain('href="/admin/account-deletions"');
  });

  it("renders the approved organization navigation without a billing item", async () => {
    const organization = {
      canCreateRepository: true,
      githubOwnerId: "456",
      githubOwnerLogin: "samebase",
      githubOwnerType: "organization" as const,
      organizationId: fakeOrganizationId("organization_samebase"),
      role: "owner" as const,
    } satisfies ViewerOrganization;
    organizationContextState.organizations = [organization];
    organizationContextState.surface = {
      kind: "organization",
      owner: "samebase",
      section: "settings",
      source: "organization",
    };
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: { kind: "email", label: "nicu@samebase.md" },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain('href="/org/samebase/vaults"');
    expect(hydratedMarkup).toContain('href="/org/samebase/providers"');
    expect(hydratedMarkup).toContain('href="/org/samebase/new-app"');
    expect(hydratedMarkup).toContain('href="/org/samebase/connect-repo"');
    expect(hydratedMarkup).toContain('href="/org/samebase/settings/members"');
    expect(hydratedMarkup).toContain('href="/org/samebase/settings"');
    expect(hydratedMarkup.indexOf("Members")).toBeLessThan(
      hydratedMarkup.indexOf("Organization settings"),
    );
    expect(hydratedMarkup).not.toContain("/org/samebase/settings/billing");
    expect(hydratedMarkup).toContain("All vaults");
    expect(hydratedMarkup).toContain("Account settings");
    const accountIndex = hydratedMarkup.indexOf(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
    const allVaultsIndex = hydratedMarkup.indexOf('href="/vault"');
    const contextIndex = hydratedMarkup.indexOf('data-testid="organization-context-control"');
    const organizationNavigationIndex = hydratedMarkup.indexOf('aria-label="Organization"');
    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(allVaultsIndex).toBeGreaterThan(accountIndex);
    expect(contextIndex).toBeGreaterThan(allVaultsIndex);
    expect(organizationNavigationIndex).toBeGreaterThan(contextIndex);
  });

  it("keeps All vaults visible while organization memberships load", async () => {
    organizationContextState.organizations = undefined;
    organizationContextState.surface = {
      kind: "organization",
      owner: "samebase",
      section: "providers",
      source: "organization",
    };
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: { kind: "email", label: "nicu@samebase.md" },
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup).not.toContain("MCP clients");
    expect(hydratedMarkup).not.toContain("Organization settings");
  });
});
