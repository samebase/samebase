import {
  BlockList,
  ClientList,
  ConnectorGrantList,
  Counts,
  HostBlockList,
  InvalidToken,
  OwnerChanged,
  SignInPageList,
  UnknownConnector,
} from "@samebase/identity-broker/moderation-api";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const BROKER_ISSUER = "https://public-broker.example.test";
const MODERATION_KEY = "moderation-key";

afterEach(() => {
  vi.unstubAllEnvs();
});

const jsonResponse = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

// The broker's answers, typed by the declaration that the broker serves, so a change to it fails here.
const counts: typeof Counts.Encoded = {
  day: { count: 1, atLeast: false },
  week: { count: 1_000, atLeast: true },
};

const blockList: typeof BlockList.Encoded = {
  blocks: [
    {
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
  events: [
    {
      action: "block",
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
};

const clientList: typeof ClientList.Encoded = {
  clients: [
    {
      clientId: "cl_preview",
      appId: "gh-81-4c9a75cca717efb68c856f26ba825073-preview",
      clientName: "pr-12",
      deploymentType: "preview",
      redirectUris: ["https://happy-otter-123.convex.site/auth/hub/callback"],
      createdAt: 1_800_000_002_000,
      renewedAt: 1_800_000_002_000,
      lastSignInAt: null,
      removeAt: 1_801_209_602_000,
      registeredBy: {
        kind: "github",
        githubRepository: "octo-org/own",
        githubRepositoryDatabaseId: "81",
        githubOwnerId: "65",
        githubActorLogin: "octocat",
        app: "my-app",
      },
      connectors: ["github", "google"],
      ownerId: "65",
      signInPage: "shown",
      policyConnectors: ["github", "google"],
      usableConnectors: ["github", "google"],
      grantedConnectors: [],
    },
    {
      clientId: "cl_test",
      appId: "gh-74-4c9a75cca717efb68c856f26ba825073",
      clientName: "prod",
      deploymentType: "production",
      redirectUris: ["https://ideal-dolphin-15.convex.site/auth/hub/callback"],
      createdAt: 1_800_000_000_000,
      renewedAt: 1_800_000_001_000,
      lastSignInAt: null,
      removeAt: null,
      registeredBy: {
        kind: "github",
        githubRepository: "octo-org/octo-repo",
        githubRepositoryDatabaseId: "74",
        githubOwnerId: "65",
        githubActorLogin: "octocat",
        app: "my-app",
      },
      connectors: ["github", "google"],
      ownerId: "65",
      signInPage: "shown",
      policyConnectors: ["github", "google"],
      usableConnectors: ["github", "google"],
      grantedConnectors: [],
    },
    {
      clientId: "cl_development",
      appId: "gh-74-4c9a75cca717efb68c856f26ba825073-preview",
      clientName: "development",
      deploymentType: "development",
      redirectUris: ["http://127.0.0.1:3211/auth/hub/callback"],
      createdAt: 1_799_999_999_000,
      renewedAt: 1_799_999_999_000,
      lastSignInAt: null,
      removeAt: 1_801_209_599_000,
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: "octo-org/octo-repo",
        githubRepositoryDatabaseId: "74",
        githubOwnerId: "65",
        app: "my-app",
        issuedAt: 1_799_000_000_000,
      },
      connectors: ["github", "google"],
      ownerId: "65",
      signInPage: "shown",
      policyConnectors: ["github", "google"],
      usableConnectors: ["github", "google"],
      grantedConnectors: [],
    },
  ],
  limitReached: false,
};

const signInPage: typeof SignInPageList.Encoded = {
  everyApp: null,
  repositories: [{ repositoryId: "74", ownerId: "65", active: true, reason: "A team we know" }],
};

const connectorGrants: typeof ConnectorGrantList.Encoded = {
  connectors: ["google", "github", "google-apps", "github-apps"],
  grants: [
    {
      repositoryId: "74",
      ownerId: "65",
      connector: "google",
      active: true,
      reason: "A team we know",
    },
  ],
};

const LOGIN_ISSUER = "https://login.samebase.com";
const LOGIN_MODERATION_KEY = "login-moderation-key";

/** login.samebase.com's list: no client of the GitHub layer, the sites of its CIMD layer. */
const siteList: typeof ClientList.Encoded = {
  clients: [],
  limitReached: false,
  cimd: {
    clients: [
      {
        clientId: "https://notes.example.test/oauth-client.json",
        host: "notes.example.test",
        createdAt: 1_800_000_001_000,
        lastSignInAt: 1_800_000_002_000,
      },
      {
        clientId: "https://spam.example.test/client.json",
        host: "spam.example.test",
        createdAt: 1_800_000_000_000,
        lastSignInAt: null,
      },
    ],
    limitReached: true,
  },
};

const hostBlockList: typeof HostBlockList.Encoded = {
  blocks: [{ host: "spam.example.test", createdAt: 1_800_000_003_000 }],
  limitReached: false,
};

// Source: https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#get-a-repository,
// the start of the example answer.
const gitHubRepository = {
  id: 1296269,
  node_id: "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
  name: "Hello-World",
  full_name: "octocat/Hello-World",
  owner: { login: "octocat", id: 1, node_id: "MDQ6VXNlcjE=", type: "User", site_admin: false },
  private: false,
  html_url: "https://github.com/octocat/Hello-World",
};

/** The broker's refusals as its README lists them: `{ error, error_description }`. */
const ownerChanged: typeof OwnerChanged.Encoded = {
  error: "owner_changed",
  error_description: "The broker records another owner of the repository.",
};
const unknownConnector: typeof UnknownConnector.Encoded = {
  error: "unknown_connector",
  error_description: "The broker has no connector of this name.",
};
const invalidToken: typeof InvalidToken.Encoded = {
  error: "invalid_token",
  error_description: "The token is invalid.",
};

type Sent = { url: string; method: string; authorization: string | null; body: unknown };
let route: (request: Request) => Promise<Response> = async () => Response.error();
/** The redirect mode of each fetch as Convex's runtime reads it: from the second argument only. */
const redirectModes = new Map<string, string>();
// Effect's FetchHttpClient keeps the first global `fetch` it reads, so one stub serves every test.
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  redirectModes.set(request.url, init?.redirect ?? "follow");
  return await route(request);
});

/** The broker's moderation endpoints, answered with the fixtures above or by `answer`. */
function stubBroker(answer?: (request: Request) => Response) {
  const requests: Sent[] = [];
  route = async (request) => {
    const text = await request.clone().text();
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("Authorization"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    if (answer !== undefined) {
      return answer(request);
    }
    const { pathname } = new URL(request.url);
    switch (pathname) {
      case "/moderation/counts":
        return jsonResponse(counts);
      case "/moderation/blocks":
        return jsonResponse(request.method === "GET" ? blockList : { changed: true });
      case "/moderation/clients":
        return jsonResponse(
          new URL(request.url).searchParams.has("owner")
            ? { ...clientList, owner: new URL(request.url).searchParams.get("owner") }
            : clientList,
        );
      case "/moderation/sign-in-page":
        return jsonResponse(request.method === "GET" ? signInPage : { changed: true });
      case "/moderation/connector-grants":
        return jsonResponse(request.method === "GET" ? connectorGrants : { changed: true });
      default:
        return request.method === "DELETE" && pathname.startsWith("/moderation/clients/")
          ? jsonResponse({ changed: true })
          : new Response(null, { status: 404 });
    }
  };
  return requests;
}

async function viewerWith(t: ConvexTest, email: string) {
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        state: "active",
        email,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      }),
  );
  return t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
}

function turnModerationOn() {
  vi.stubEnv("PUBLIC_IDENTITY_HUB_ISSUER", BROKER_ISSUER);
  vi.stubEnv("PUBLIC_IDENTITY_HUB_MODERATION_KEY", MODERATION_KEY);
}

describe("broker client moderation", () => {
  it.each(["anonymous", "member"] as const)(
    "refuses %s for every function, and calls no broker",
    async (role) => {
      const t = makeConvexTest();
      turnModerationOn();
      const requests = stubBroker();
      const viewer = role === "anonymous" ? t : await viewerWith(t, "member@example.test");

      await expect(viewer.action(api.brokerClients.moderation.readOverview, {})).rejects.toThrow(
        "Access denied",
      );
      await expect(
        viewer.action(api.brokerClients.moderation.changeBlock, {
          action: "block",
          kind: "owner",
          githubId: "65",
          reason: "Phishing page",
        }),
      ).rejects.toThrow("Access denied");
      await expect(
        viewer.action(api.brokerClients.moderation.changeSignInPage, {
          target: { scope: "every_app" },
          skip: true,
          reason: "Launch week",
        }),
      ).rejects.toThrow("Access denied");
      await expect(
        viewer.action(api.brokerClients.moderation.changeConnectorGrant, {
          repositoryId: "74",
          connector: "google",
          expectedOwnerId: "65",
          grant: true,
          reason: "A trusted team",
        }),
      ).rejects.toThrow("Access denied");
      await expect(
        viewer.action(api.brokerClients.moderation.lookupRepository, {
          fullName: "octocat/Hello-World",
        }),
      ).rejects.toThrow("Access denied");
      await expect(viewer.action(api.brokerClients.moderation.readLoginBroker, {})).rejects.toThrow(
        "Access denied",
      );
      await expect(
        viewer.action(api.brokerClients.moderation.readLoginSiteFiles, {}),
      ).rejects.toThrow("Access denied");
      await expect(
        viewer.action(api.brokerClients.moderation.changeLoginHostBlock, {
          action: "block",
          host: "spam.example.test",
        }),
      ).rejects.toThrow("Access denied");
      expect(requests).toEqual([]);
    },
  );

  it("says that moderation is off without the key, and calls no broker", async () => {
    const t = makeConvexTest();
    vi.stubEnv("PUBLIC_IDENTITY_HUB_ISSUER", BROKER_ISSUER);
    vi.stubEnv("PUBLIC_IDENTITY_HUB_MODERATION_KEY", " ");
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", " ");
    const requests = stubBroker();
    const admin = await viewerWith(t, "nicu@samebase.com");

    expect(await admin.action(api.brokerClients.moderation.readOverview, {})).toEqual({
      status: "off",
    });
    expect(await admin.action(api.brokerClients.moderation.readLoginBroker, {})).toEqual({
      status: "off",
    });
    expect(await admin.action(api.brokerClients.moderation.readLoginSiteFiles, {})).toEqual({
      status: "off",
    });
    expect(
      await admin.action(api.brokerClients.moderation.changeLoginHostBlock, {
        action: "block",
        host: "spam.example.test",
      }),
    ).toEqual({ status: "off" });
    expect(
      await admin.action(api.brokerClients.moderation.changeBlock, {
        action: "block",
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
      }),
    ).toEqual({ status: "off" });
    expect(
      await admin.action(api.brokerClients.moderation.changeSignInPage, {
        target: { scope: "every_app" },
        skip: true,
        reason: "Launch week",
      }),
    ).toEqual({ status: "off" });
    expect(requests).toEqual([]);
  });

  it("reads the counts, the blocks, and the clients at the broker with the key", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const overview = await admin.action(api.brokerClients.moderation.readOverview, {});

    expect(overview).toEqual({
      status: "on",
      issuer: BROKER_ISSUER,
      counts,
      blockList,
      clientList,
      signInPage,
      connectorGrants,
    });
    expect(requests).toEqual([
      {
        url: `${BROKER_ISSUER}/moderation/counts`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${BROKER_ISSUER}/moderation/blocks`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${BROKER_ISSUER}/moderation/clients`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${BROKER_ISSUER}/moderation/sign-in-page`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${BROKER_ISSUER}/moderation/connector-grants`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
    ]);
  });

  it("finds a repository's GitHub ids at the broker, else on GitHub without a token", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    let gitHub = () => jsonResponse(gitHubRepository);
    const requests = stubBroker((request) =>
      request.url.startsWith("https://api.github.com/") ? gitHub() : jsonResponse(clientList),
    );
    const admin = await viewerWith(t, "nicu@samebase.com");
    const lookup = async (fullName: string) =>
      await admin.action(api.brokerClients.moderation.lookupRepository, { fullName });

    // The tenant's id and recorded owner, from the broker's clients of the repository.
    expect(await lookup(" Octo-Org/Octo-Repo ")).toEqual({
      status: "found",
      repositoryId: "74",
      ownerId: "65",
      name: "octo-org/octo-repo",
    });
    expect(await lookup("octocat/Hello-World")).toEqual({
      status: "found",
      repositoryId: "1296269",
      ownerId: "1",
      name: "octocat/Hello-World",
    });
    expect(requests.map(({ url, authorization }) => [url, authorization])).toEqual([
      [`${BROKER_ISSUER}/moderation/clients`, `Bearer ${MODERATION_KEY}`],
      [`${BROKER_ISSUER}/moderation/clients`, `Bearer ${MODERATION_KEY}`],
      ["https://api.github.com/repos/octocat/Hello-World", null],
    ]);

    gitHub = () => jsonResponse({ message: "Not Found" }, 404);
    expect(await lookup("octocat/private-repo")).toEqual({ status: "not_found" });
    // A name that GitHub does not allow reaches neither.
    expect(await lookup("octocat/..")).toEqual({ status: "not_found" });
    expect(requests).toHaveLength(5);
  });

  it("finds a repository at the broker by its newest name only", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const [, original] = clientList.clients;
    // The repository moved to another owner; its newest client has the new name, and a newer client
    // than the next repository's still has the old one.
    const old = { ...original, ownerId: "66", createdAt: 1_800_000_002_000 };
    const moved = {
      ...old,
      clientId: "cl_moved",
      createdAt: 1_800_000_003_000,
      registeredBy: { ...original.registeredBy, githubRepository: "new-owner/octo-repo" },
    };
    // A new repository took the old name.
    const reused = {
      ...original,
      clientId: "cl_reused",
      createdAt: 1_800_000_001_000,
      registeredBy: { ...original.registeredBy, githubRepositoryDatabaseId: "99" },
      ownerId: "70",
    };
    let clients = [moved, old];
    const requests = stubBroker((request) =>
      request.url.startsWith("https://api.github.com/")
        ? jsonResponse({ message: "Not Found" }, 404)
        : jsonResponse({ clients, limitReached: false }),
    );
    const admin = await viewerWith(t, "nicu@samebase.com");
    const lookup = async (fullName: string) =>
      await admin.action(api.brokerClients.moderation.lookupRepository, { fullName });

    expect(await lookup("octo-org/octo-repo")).toEqual({ status: "not_found" });
    expect(requests.at(-1)?.url).toBe("https://api.github.com/repos/octo-org/octo-repo");
    expect(await lookup("new-owner/octo-repo")).toEqual({
      status: "found",
      repositoryId: "74",
      ownerId: "66",
      name: "new-owner/octo-repo",
    });
    clients = [moved, old, reused];
    expect(await lookup("octo-org/octo-repo")).toEqual({
      status: "found",
      repositoryId: "99",
      ownerId: "70",
      name: "octo-org/octo-repo",
    });
  });

  it("grants a connector to a repository, and says when the broker refuses", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const admin = await viewerWith(t, "nicu@samebase.com");
    const change = {
      repositoryId: "74",
      connector: "google",
      expectedOwnerId: "65",
      grant: true,
      reason: "A team we know",
    };
    const changeGrant = async () =>
      await admin.action(api.brokerClients.moderation.changeConnectorGrant, {
        ...change,
      });

    expect(await changeGrant()).toEqual({ status: "on", result: "changed" });
    expect(requests).toEqual([
      {
        url: `${BROKER_ISSUER}/moderation/connector-grants`,
        method: "POST",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: change,
      },
    ]);

    stubBroker(() => jsonResponse(ownerChanged, 409));
    expect(await changeGrant()).toEqual({ status: "on", result: "owner_changed" });
    stubBroker(() => jsonResponse(unknownConnector, 400));
    expect(await changeGrant()).toEqual({ status: "on", result: "unknown_connector" });
  });

  it("skips the sign-in page for a repository", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const admin = await viewerWith(t, "nicu@samebase.com");
    const change = {
      target: { scope: "repository" as const, repositoryId: "74", expectedOwnerId: "65" },
      skip: true,
      reason: "A team we know",
    };
    const changePage = async () =>
      await admin.action(api.brokerClients.moderation.changeSignInPage, {
        ...change,
      });

    expect(await changePage()).toEqual({ status: "on", result: "changed" });
    expect(requests).toEqual([
      {
        url: `${BROKER_ISSUER}/moderation/sign-in-page`,
        method: "POST",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: change,
      },
    ]);

    stubBroker(() => jsonResponse(ownerChanged, 409));
    expect(await changePage()).toEqual({ status: "on", result: "owner_changed" });
  });

  it("sets a block in the name of the signed-in admin", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const result = await admin.action(api.brokerClients.moderation.changeBlock, {
      action: "unblock",
      kind: "repository",
      githubId: "74",
      reason: "Fixed",
    });

    expect(result).toEqual({ status: "on", changed: true });
    expect(requests).toEqual([
      {
        url: `${BROKER_ISSUER}/moderation/blocks`,
        method: "POST",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: {
          action: "unblock",
          kind: "repository",
          githubId: "74",
          reason: "Fixed",
          adminEmail: "nicu@samebase.com",
        },
      },
    ]);
  });

  it("reads the sites and the host blocks at login.samebase.com with its own key, and no site's file", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", LOGIN_MODERATION_KEY);
    const requests = stubBroker((request) =>
      jsonResponse(
        new URL(request.url).pathname === "/moderation/host-blocks" ? hostBlockList : siteList,
      ),
    );
    const admin = await viewerWith(t, "nicu@samebase.com");

    expect(await admin.action(api.brokerClients.moderation.readLoginBroker, {})).toEqual({
      status: "on",
      siteList: siteList.cimd,
      hostBlockList,
    });
    expect(requests.map(({ url, authorization }) => [url, authorization])).toEqual([
      [`${LOGIN_ISSUER}/moderation/clients`, `Bearer ${LOGIN_MODERATION_KEY}`],
      [`${LOGIN_ISSUER}/moderation/host-blocks`, `Bearer ${LOGIN_MODERATION_KEY}`],
    ]);
  });

  it("reads each listed site's file as it is now, with no key and no redirect", async () => {
    const t = makeConvexTest();
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", LOGIN_MODERATION_KEY);
    const notesFile = {
      client_id: "https://notes.example.test/oauth-client.json",
      client_name: "Notes",
      redirect_uris: ["https://notes.example.test/callback"],
    };
    const requests = stubBroker((request) => {
      const { host } = new URL(request.url);
      if (host === "notes.example.test") {
        return jsonResponse(notesFile);
      }
      if (host === "spam.example.test") {
        return new Response("Not found", { status: 404 });
      }
      return jsonResponse(siteList);
    });
    const admin = await viewerWith(t, "nicu@samebase.com");

    expect(await admin.action(api.brokerClients.moderation.readLoginSiteFiles, {})).toEqual({
      status: "on",
      files: [
        {
          clientId: "https://notes.example.test/oauth-client.json",
          file: {
            status: "ok",
            clientName: "Notes",
            clientUri: null,
            logoUri: null,
            redirectUris: ["https://notes.example.test/callback"],
            json: JSON.stringify(notesFile, null, 2),
          },
        },
        // A file that answers 404 is gone, usually a deleted preview.
        { clientId: "https://spam.example.test/client.json", file: { status: "gone" } },
      ],
    });
    const fileRequests = requests.filter(({ url }) => !url.startsWith(LOGIN_ISSUER));
    expect(fileRequests.map(({ authorization }) => authorization)).toEqual([null, null]);
    // Convex follows a redirect unless the mode is in fetch's second argument.
    expect(fileRequests.map(({ url }) => redirectModes.get(url))).toEqual(["manual", "manual"]);
  });

  it("blocks and unblocks a host at login.samebase.com by its lower-case name", async () => {
    const t = makeConvexTest();
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", LOGIN_MODERATION_KEY);
    const requests = stubBroker(() => jsonResponse({ changed: true }));
    const admin = await viewerWith(t, "nicu@samebase.com");
    const change = async (action: "block" | "unblock", host: string) =>
      await admin.action(api.brokerClients.moderation.changeLoginHostBlock, { action, host });

    expect(await change("block", " Spam.Example.TEST ")).toEqual({ status: "on", changed: true });
    expect(await change("unblock", "spam.example.test")).toEqual({ status: "on", changed: true });
    expect(requests).toEqual([
      {
        url: `${LOGIN_ISSUER}/moderation/host-blocks`,
        method: "POST",
        authorization: `Bearer ${LOGIN_MODERATION_KEY}`,
        body: { action: "block", host: "spam.example.test" },
      },
      {
        url: `${LOGIN_ISSUER}/moderation/host-blocks`,
        method: "POST",
        authorization: `Bearer ${LOGIN_MODERATION_KEY}`,
        body: { action: "unblock", host: "spam.example.test" },
      },
    ]);

    // A host that is not a DNS name never reaches the broker.
    await expect(change("block", "https://spam.example.test/")).rejects.toThrow();
    expect(requests).toHaveLength(2);
  });

  it("fails when the broker refuses the key", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    stubBroker(() =>
      jsonResponse(invalidToken, 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' }),
    );
    const admin = await viewerWith(t, "nicu@samebase.com");

    await expect(admin.action(api.brokerClients.moderation.readOverview, {})).rejects.toThrow(
      InvalidToken,
    );
  });
});

/**
A member of an organization of GitHub owner 65 with two connected repositories, GitHub ids 74 and
81, and one that is not connected yet, and an outsider. The list asks the brokers by owner, so which
repositories are connected does not change it.
*/
async function organizationWithMember(t: ConvexTest) {
  const ids = await t.run(async (ctx) => {
    const user = async (email: string) =>
      await ctx.db.insert("users", {
        state: "active",
        email,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    const memberId = await user("ada@example.test");
    const plainMemberId = await user("bob@example.test");
    const outsiderId = await user("eve@example.test");
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "installation-1",
      githubOwnerId: "65",
      githubOwnerLogin: "octo-org",
      githubOwnerLoginNormalized: "octo-org",
      githubOwnerType: "organization",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: plainMemberId,
      role: "member",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    const repository = async (connected: { githubId: string; name: string } | null) => {
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "not_connected",
      });
      if (connected === null) {
        return;
      }
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId: memberId,
        repositoryId,
        githubRepositoryFullName: `octo-org/${connected.name}`,
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(repositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "connected",
        githubMode: "create_repository",
        runId,
        githubRepositoryDatabaseId: connected.githubId,
        githubRepositoryName: connected.name,
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 4,
      });
    };
    await repository({ githubId: "74", name: "octo-repo" });
    await repository({ githubId: "81", name: "other-repo" });
    await repository(null);
    return { memberId, plainMemberId, outsiderId, organizationId };
  });
  const viewer = (userId: string) =>
    t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
  return {
    member: viewer(ids.memberId),
    plainMember: viewer(ids.plainMemberId),
    outsider: viewer(ids.outsiderId),
    organizationId: ids.organizationId,
  };
}

/** The organization's owner, GitHub account 65, whose repositories need not be connected. */
const ORGANIZATION_LIST = `${BROKER_ISSUER}/moderation/clients?owner=65`;

describe("an organization's broker clients", () => {
  it("lists the clients of its owner's repositories for an owner, in one request", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const { member, organizationId } = await organizationWithMember(t);

    const result = await member.action(api.brokerClients.moderation.readClientsOfOrganization, {
      organizationId,
    });

    expect(result).toEqual({
      status: "on",
      clients: clientList.clients,
      limitReached: false,
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${ORGANIZATION_LIST}`,
    ]);
  });

  it("shows an owner every repository of the GitHub owner, and another member only the connected ones", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const [preview] = clientList.clients;
    // A repository of the GitHub owner that is not connected in Samebase.
    const unconnected = {
      ...preview,
      clientId: "cl_unconnected",
      registeredBy: { ...preview.registeredBy, githubRepositoryDatabaseId: "99" },
    };
    const requests = stubBroker((request) =>
      request.method === "DELETE"
        ? jsonResponse({ changed: true })
        : jsonResponse({ owner: "65", clients: [preview, unconnected], limitReached: true }),
    );
    const { member, plainMember, organizationId } = await organizationWithMember(t);
    const ids = async (viewer: typeof member) => {
      const result = await viewer.action(api.brokerClients.moderation.readClientsOfOrganization, {
        organizationId,
      });
      return result.status === "on" ? result.clients.map((client) => client.clientId) : [];
    };

    expect(await ids(member)).toEqual(["cl_preview", "cl_unconnected"]);
    expect(await ids(plainMember)).toEqual(["cl_preview"]);
    expect(
      await member.action(api.brokerClients.moderation.readClientsOfOrganization, {
        organizationId,
      }),
    ).toMatchObject({ limitReached: true });
    // A plain member cannot delete a client they do not see.
    expect(
      await plainMember.action(api.brokerClients.moderation.deleteClientOfOrganization, {
        organizationId,
        clientId: "cl_unconnected",
      }),
    ).toEqual({ status: "on", changed: false });
    expect(requests.some((request) => request.method === "DELETE")).toBe(false);
  });

  it.each([
    ["the full list, as a broker without the owner filter answers", () => jsonResponse(clientList)],
    ["another owner's list", () => jsonResponse({ ...clientList, owner: "66" })],
  ])("shows nothing when a broker answers %s", async (_, answer) => {
    const t = makeConvexTest();
    turnModerationOn();
    stubBroker(answer);
    const { member, organizationId } = await organizationWithMember(t);

    await expect(
      member.action(api.brokerClients.moderation.readClientsOfOrganization, { organizationId }),
    ).rejects.toThrow("The identity broker answered");
  });

  it("refuses a user outside the organization, and calls no broker", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const { outsider, organizationId } = await organizationWithMember(t);

    await expect(
      outsider.action(api.brokerClients.moderation.readClientsOfOrganization, { organizationId }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      outsider.action(api.brokerClients.moderation.deleteClientOfOrganization, {
        organizationId,
        clientId: "cl_test",
      }),
    ).rejects.toThrow("Organization membership is required.");
    expect(requests).toEqual([]);
  });

  it("deletes a client of the organization's repositories", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const { member, organizationId } = await organizationWithMember(t);

    const result = await member.action(api.brokerClients.moderation.deleteClientOfOrganization, {
      organizationId,
      clientId: "cl_test",
    });

    expect(result).toEqual({ status: "on", changed: true });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${ORGANIZATION_LIST}`,
      `DELETE ${BROKER_ISSUER}/moderation/clients/cl_test?owner=65`,
    ]);
  });

  it("deletes nothing for a client that is not in the organization's list", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubBroker();
    const { member, organizationId } = await organizationWithMember(t);

    const result = await member.action(api.brokerClients.moderation.deleteClientOfOrganization, {
      organizationId,
      clientId: "cl_of_another_organization",
    });

    expect(result).toEqual({ status: "on", changed: false });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("says that moderation is off without the key, and calls no broker", async () => {
    const t = makeConvexTest();
    vi.stubEnv("PUBLIC_IDENTITY_HUB_ISSUER", BROKER_ISSUER);
    vi.stubEnv("PUBLIC_IDENTITY_HUB_MODERATION_KEY", " ");
    const requests = stubBroker();
    const { member, organizationId } = await organizationWithMember(t);

    expect(
      await member.action(api.brokerClients.moderation.readClientsOfOrganization, {
        organizationId,
      }),
    ).toEqual({ status: "off" });
    expect(requests).toEqual([]);
  });
});
