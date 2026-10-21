// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AppRightSidebarContent } from "./AppRightSidebar";
import {
  readAppOrganizationSurface,
  type AppOrganizationSurface,
  type ViewerOrganization,
} from "@/organization/context";
import { APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";
import { TestRouterProvider } from "@/test/TestRouterProvider";

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
  surface: { kind: "allRepositories" },
}));
const PROVIDER_STATUS_QUERY_NAMES = new Set([
  getFunctionName(api.users.getConvexConnectionStatus),
  getFunctionName(api.users.getCloudflareConnectionStatus),
]);

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for the organization context.
  return value;
}

/** Answers the Convex and TanStack Query hooks of this test by the query's function name. */
function readQueryResult(queryName: string) {
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
    useQuery: (query: Parameters<typeof actual.useQuery>[0], args: unknown) =>
      args === "skip" ? undefined : readQueryResult(getFunctionName(query)),
  };
});

// `convexQuery` options carry the Convex function name second in the query key.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
      data: readQueryResult(String(queryKey[1])),
    }),
  };
});

// A prerendered page: its render knows no session token, so the provider's loading state decides.
vi.mock("@/components/NotSignedIn", () => ({
  NotSignedIn: ({ children }: { children: ReactNode }) =>
    authState.isLoading || !authState.isAuthenticated ? children : null,
}));

// This jsdom mount has no Start server request or client compilation.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => window.location.origin,
}));

vi.mock("@/lib/oauthSignInRejection", () => ({
  useOAuthSignInRejection: () => null,
}));

vi.mock("@/authClient", () => ({
  useAppAuthActions: () => ({
    signOut: vi.fn(),
  }),
  useAppSignInActions: () => ({
    signInWithGoogle: vi.fn(),
    signInWithPassword: vi.fn(),
  }),
}));

vi.mock("@/organization/providers/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@/organization/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/organization/context")>();
  return {
    ...actual,
    useOrganizationContext: () => organizationContextState,
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
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

function createRightSidebarElement(initialEntry = "/repo") {
  return (
    <TestRouterProvider initialEntries={[initialEntry]}>
      <AppRightSidebarContent />
    </TestRouterProvider>
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
  initialEntry = "/repo",
) {
  prepareRightSidebarNamed(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(createRightSidebarElement(initialEntry));
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
    window.history.replaceState({}, "", "/repo");
    queryState.index = 0;
    queryState.results = [];
    queryState.resultsByQueryName = new Map();
    queryState.blockedQueryNames = new Set();
    queryState.seenQueryNames = [];
    mutationState.clear();
    organizationContextState.organizations = undefined;
    organizationContextState.surface = { kind: "allRepositories" };
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

  it("shows the sign-in while a prerendered page waits for the session", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("Sign in or create an account");
    expect(markup).not.toContain("checking login");
    expect(hydratedMarkup).toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("keeps provider controls hidden while authenticated app access loads", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("checking login");
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
    expect(hydratedMarkup).toContain("Account access unavailable");
    expect(hydratedMarkup).toContain("You are signed in as");
    expect(hydratedMarkup).toContain("this account does not have access to Samebase.");
    expect(hydratedMarkup).toContain('role="status"');
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).toContain('href="/repo"');
    expect(hydratedMarkup).not.toContain("Pending Access User");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
    expect(hydratedMarkup).not.toContain("/new-app");
    expect(hydratedMarkup).not.toContain("organization-context-control");
    expectProviderStatusQueriesNotSeen();
  });

  it("keeps All repositories visible before the viewer accepts the terms", async () => {
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

    expect(hydratedMarkup).toContain('href="/repo"');
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
    expect(mounted).toContain('href="/repo"');
    expect(mounted).not.toContain("/settings");
    expect(mounted).not.toContain("/providers");
    expect(mounted).not.toContain("organization-context-control");
    expectProviderStatusQueriesNotSeen();
  });

  it("renders global account navigation after the authenticated viewer loads", async () => {
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
        [getFunctionName(api.users.getProductUpdateEmailConsent), { state: "not_decided" }],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "not_decided" }],
        [
          getFunctionName(api.repository.list),
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
    expect(hydratedMarkup).toContain('href="/repo"');
    expect(hydratedMarkup).toContain("All repositories");
    expect(hydratedMarkup).toContain('href="/org"');
    expect(hydratedMarkup).toContain("Organizations");
    expect(hydratedMarkup).not.toContain("No organization selected");
    expect(hydratedMarkup).not.toContain("/settings/mcp");
    expect(hydratedMarkup).not.toContain("MCP clients");
    expect(hydratedMarkup).toContain("Account settings");
    expect(hydratedMarkup).not.toContain("/org/");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain('data-testid="organization-context-control"');
    expect(hydratedMarkup).not.toContain("/admin/users");
    expect(hydratedMarkup).not.toContain("/admin/account-deletions");
    expect(hydratedMarkup).not.toContain("youtube-nocookie.com");
    expect(hydratedMarkup).toContain("Product updates");
    expect(hydratedMarkup).toContain("Hear about new Samebase features by email.");
    expect(hydratedMarkup).toContain("Email me");
    expect(hydratedMarkup).toContain("No thanks");
    expect(hydratedMarkup).not.toContain("Help improve Samebase");
    expect(hydratedMarkup).not.toContain("What gets recorded");
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
    expect(hydratedMarkup.indexOf("Product updates")).toBeLessThan(
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
        [getFunctionName(api.users.getProductUpdateEmailConsent), { state: "granted" }],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "not_decided" }],
        [getFunctionName(api.repository.list), []],
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
      const consentSection = Array.from(rootElement.querySelectorAll("h2"))
        .find((heading) => heading.textContent === "Help improve Samebase")
        ?.closest("section");
      if (consentSection === null || consentSection === undefined) {
        throw new Error("Expected the session-recording consent section.");
      }
      const allowButton = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "Allow",
      );
      const denyButton = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "No thanks",
      );
      expect(allowButton?.classList.contains("bg-primary")).toBe(true);
      expect(consentSection.querySelector('a[href="/privacy"]')).toBeNull();
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

  it("saves a denied product-update email choice from the sidebar", async () => {
    const setProductUpdateEmailConsent = vi.fn(async () => null);
    mutationState.set(
      getFunctionName(api.users.setProductUpdateEmailConsent),
      setProductUpdateEmailConsent,
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
        [getFunctionName(api.users.getProductUpdateEmailConsent), { state: "not_decided" }],
        [getFunctionName(api.users.getSessionRecordingConsent), { state: "not_decided" }],
        [getFunctionName(api.repository.list), []],
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
      expect(rootElement.textContent).toContain("Product updates");
      expect(rootElement.textContent).not.toContain("Help improve Samebase");
      const denyButton = Array.from(rootElement.querySelectorAll("button")).find(
        (button) => button.textContent === "No thanks",
      );
      await act(async () => {
        denyButton?.click();
        await Promise.resolve();
      });

      expect(setProductUpdateEmailConsent).toHaveBeenCalledWith({
        decision: "denied",
        source: "right_sidebar",
      });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("hides onboarding after one repository has both provider attachments", async () => {
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
          getFunctionName(api.repository.list),
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

  it.each([
    ["/repo", "All repositories"],
    ["/repo/?dev#inventory", "All repositories"],
    ["/repo/samebase/app", null],
    ["/org", "Organizations"],
    ["/settings?dev#profile", "Account settings"],
    ["/admin/users", "Users"],
    ["/admin/account-deletions", "Account deletions"],
    ["/admin/emails", "Emails"],
    ["/org/samebase/repositories", "Repositories"],
    ["/org/samebase/providers", "Providers"],
    ["/org/samebase/new-app", "New app"],
    ["/org/samebase/connect-repo", "Connect repository"],
    ["/org/samebase/settings/members?dev#members", "Members"],
    ["/org/samebase/settings?checkout=cancel#billing", "Organization settings"],
  ])("selects only the current sidebar page at %s", async (initialEntry, label) => {
    organizationContextState.organizations = [
      {
        canCreateRepository: true,
        githubOwnerId: "456",
        githubOwnerLogin: "samebase",
        githubOwnerType: "organization",
        organizationId: fakeOrganizationId("organization_samebase"),
        role: "owner",
      },
    ];
    organizationContextState.surface = readAppOrganizationSurface(initialEntry.split("?")[0]);

    const markup = await renderRightSidebarAfterEffectsWithNamedQueries(
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
            accountPresentation: { kind: "email", label: "staff@example.test" },
          },
        ],
      ]),
      initialEntry,
    );
    const element = document.createElement("div");
    element.innerHTML = markup;
    const currentLinks = [...element.querySelectorAll('a[aria-current="page"]')];

    expect(currentLinks.map((link) => link.textContent)).toEqual(label === null ? [] : [label]);
    for (const link of currentLinks) {
      expect(link.classList.contains("app-sidebar-current-label")).toBe(true);
      expect(link.classList.contains("font-semibold")).toBe(false);
    }
  });

  it("renders admin routes for staff", async () => {
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
    expect(hydratedMarkup).toContain('href="/admin/emails"');
  });

  it.each([
    { kind: "allRepositories" },
    { kind: "organizations" },
    { kind: "organization", owner: "samebase", section: "settings", source: "organization" },
  ] satisfies AppOrganizationSurface[])(
    "renders the approved organization navigation on $kind without a billing item",
    async (surface) => {
      const organization = {
        canCreateRepository: true,
        githubOwnerId: "456",
        githubOwnerLogin: "samebase",
        githubOwnerType: "organization" as const,
        organizationId: fakeOrganizationId("organization_samebase"),
        role: "owner" as const,
      } satisfies ViewerOrganization;
      organizationContextState.organizations = [organization];
      organizationContextState.surface = surface;
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

      expect(hydratedMarkup).toContain('href="/org/samebase/repositories"');
      expect(hydratedMarkup).toContain('href="/org/samebase/providers"');
      expect(hydratedMarkup).toContain('href="/org/samebase/new-app"');
      expect(hydratedMarkup).toContain('href="/org/samebase/connect-repo"');
      expect(hydratedMarkup).toContain('href="/org/samebase/settings/members"');
      expect(hydratedMarkup).toContain('href="/org/samebase/settings"');
      expect(hydratedMarkup.indexOf("Members")).toBeLessThan(
        hydratedMarkup.indexOf("Organization settings"),
      );
      expect(hydratedMarkup).not.toContain("/org/samebase/settings/billing");
      expect(hydratedMarkup).toContain("All repositories");
      expect(hydratedMarkup).toContain("Organizations");
      expect(hydratedMarkup).toContain("Account settings");
      const accountIndex = hydratedMarkup.indexOf(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID);
      const allRepositoriesIndex = hydratedMarkup.indexOf('href="/repo"');
      const organizationsIndex = hydratedMarkup.indexOf('href="/org"');
      const contextIndex = hydratedMarkup.indexOf('data-testid="organization-context-control"');
      const organizationNavigationIndex = hydratedMarkup.indexOf('aria-label="Organization"');
      expect(accountIndex).toBeGreaterThanOrEqual(0);
      expect(allRepositoriesIndex).toBeGreaterThan(accountIndex);
      expect(organizationsIndex).toBeGreaterThan(allRepositoriesIndex);
      expect(contextIndex).toBeGreaterThan(organizationsIndex);
      expect(organizationNavigationIndex).toBeGreaterThan(contextIndex);
    },
  );

  it.each([
    { kind: "account" },
    { kind: "none" },
    { kind: "organization", owner: "lost-org", section: "settings", source: "organization" },
    { kind: "organization", owner: "lost-org", section: "repositories", source: "repository" },
  ] satisfies AppOrganizationSurface[])(
    "does not infer organization navigation on $kind outside global pages",
    async (surface) => {
      organizationContextState.organizations = [
        {
          canCreateRepository: true,
          githubOwnerId: "456",
          githubOwnerLogin: "samebase",
          githubOwnerType: "user",
          organizationId: fakeOrganizationId("organization_samebase"),
          role: "owner",
        },
      ];
      organizationContextState.surface = surface;

      const markup = await renderRightSidebarAfterEffectsWithNamedQueries(
        new Map([
          [
            getFunctionName(api.users.currentViewerAccess),
            {
              role: "role_member",
              accessKeys: ["access_public", "access_provider_connections"],
            },
          ],
        ]),
      );

      expect(markup).not.toContain('aria-label="Organization"');
      expect(markup).not.toContain('href="/org/samebase/');
      if (surface.kind === "organization") {
        expect(markup).toContain("lost-org");
      } else {
        expect(markup).not.toContain('data-testid="organization-context-control"');
      }
    },
  );

  it("keeps All repositories visible while organization memberships load", async () => {
    organizationContextState.organizations = undefined;
    organizationContextState.surface = {
      kind: "organization",
      owner: "samebase",
      section: "providers",
      source: "organization",
    };

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
    expect(hydratedMarkup).toContain('href="/repo"');
    expect(hydratedMarkup).toContain('href="/org"');
    expect(hydratedMarkup).not.toContain("MCP clients");
    expect(hydratedMarkup).not.toContain("Organization settings");
  });
});
