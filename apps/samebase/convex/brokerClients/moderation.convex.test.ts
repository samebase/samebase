import { ClientList, HostBlockList, InvalidToken } from "@samebase/identity-broker/moderation-api";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

afterEach(() => {
  vi.unstubAllEnvs();
});

const jsonResponse = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const LOGIN_ISSUER = "https://login.samebase.com";
const LOGIN_MODERATION_KEY = "login-moderation-key";

// The broker's answers, typed by the declaration that the broker serves, so a change to it fails here.

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

/** The broker's refusals as its README lists them: `{ error, error_description }`. */
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

/** Every fetch, answered by `answer`. */
function stubBroker(answer: (request: Request) => Response) {
  const requests: Sent[] = [];
  route = async (request) => {
    const text = await request.clone().text();
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("Authorization"),
      body: text === "" ? undefined : JSON.parse(text),
    });
    return answer(request);
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

describe("broker client moderation", () => {
  it.each(["anonymous", "member"] as const)(
    "refuses %s for every function, and calls no broker",
    async (role) => {
      const t = makeConvexTest();
      vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", LOGIN_MODERATION_KEY);
      const requests = stubBroker(() => jsonResponse(siteList));
      const viewer = role === "anonymous" ? t : await viewerWith(t, "member@example.test");

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
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", " ");
    const requests = stubBroker(() => jsonResponse(siteList));
    const admin = await viewerWith(t, "nicu@samebase.com");

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
    expect(requests).toEqual([]);
  });

  it("reads the sites and the host blocks at login.samebase.com with its own key, and no site's file", async () => {
    const t = makeConvexTest();
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
    vi.stubEnv("LOGIN_BROKER_MODERATION_KEY", LOGIN_MODERATION_KEY);
    stubBroker(() =>
      jsonResponse(invalidToken, 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' }),
    );
    const admin = await viewerWith(t, "nicu@samebase.com");

    await expect(admin.action(api.brokerClients.moderation.readLoginBroker, {})).rejects.toThrow(
      InvalidToken,
    );
  });
});
