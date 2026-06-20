// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { ProviderConnectionsPage } from "./ProviderConnectionsPage";

const queryState = vi.hoisted(() => ({
  resultsByQueryName: new Map<string, unknown>(),
}));

function createAsyncHandler() {
  return vi.fn(() => Promise.resolve(undefined));
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: createAsyncHandler,
    useMutation: createAsyncHandler,
    useQuery: (query: Parameters<typeof actual.useQuery>[0]) => {
      const queryName = getFunctionName(query);
      return queryState.resultsByQueryName.get(queryName);
    },
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    useLocation: () => ({
      href: "/providers",
      pathname: "/providers",
      searchStr: "",
    }),
  };
});

function renderProviderConnectionsPage(queryResults: ReadonlyMap<string, unknown>) {
  queryState.resultsByQueryName = new Map(queryResults);

  return renderToStaticMarkup(<ProviderConnectionsPage />);
}

describe("ProviderConnectionsPage", () => {
  beforeEach(() => {
    queryState.resultsByQueryName = new Map();
  });

  it("renders disconnected provider connection actions", () => {
    const markup = renderProviderConnectionsPage(
      new Map([
        [getFunctionName(api.users.getGithubConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    expect(markup).toContain("Providers");
    expect(markup).toContain("GitHub OAuth");
    expect(markup).toContain("Convex OAuth");
    expect(markup).toContain("Cloudflare OAuth");
    expect(markup).toContain("Use API key");
  });

  it("renders connected provider statuses and management actions", () => {
    const markup = renderProviderConnectionsPage(
      new Map([
        [
          getFunctionName(api.users.getGithubConnectionStatus),
          {
            authMethod: "oauth",
            connected: true,
            username: "samebase",
          },
        ],
        [
          getFunctionName(api.users.getConvexConnectionStatus),
          {
            authMethod: "api_key",
            connected: true,
            teamSlug: "samebase",
          },
        ],
        [
          getFunctionName(api.users.getCloudflareConnectionStatus),
          {
            accountId: "account_123",
            accountName: "samebase",
            authMethod: "mcp_oauth",
            connected: true,
            mcpTokenExpiresAt: Date.now() + 60_000,
            mcpTokenStatus: "valid",
          },
        ],
        [getFunctionName(api.users.viewer), { _id: "user_123" }],
      ]),
    );

    expect(markup).toContain("Connected as samebase");
    expect(markup).toContain("Connected to samebase");
    expect(markup).toContain("Connected (OAuth).");
    expect(markup).toContain("Token Valid.");
    expect(markup).toContain("Manage account");
    expect(markup).toContain("Check token");
    expect(markup).toContain("Disconnect");
  });
});
