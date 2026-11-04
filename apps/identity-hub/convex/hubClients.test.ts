import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { components, internal } from "./_generated/api";
import {
  APP_HASH,
  createClient,
  foreignKey,
  ISSUER,
  jsonResponse,
  makeConvexTest,
  OWNER_ID,
  postHubClient,
  PRODUCTION_CALLBACK,
  PRODUCTION_HOST,
  pullRequestClaims,
  readOwnRecord,
  REPOSITORY_ID,
  setBlock,
  signToken,
  stubProviders,
  type ConvexTest,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function readRegistrations(t: ConvexTest) {
  return await t.run(async (ctx) => await ctx.db.query("registrations").collect());
}

async function readRateLimits(t: ConvexTest) {
  return await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
}

/** A body that arrives in chunks with no Content-Length, as a host may send it. */
const streamedResponse = (chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );

describe("POST /hub-clients", () => {
  describe("a new client", () => {
    it("needs no Samebase account, and answers the client with the terms", async () => {
      const t = makeConvexTest();
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const client: Record<string, string> = await response.json();
      expect(client).toEqual({
        issuer: ISSUER,
        client_id: expect.stringMatching(/^cl_/),
        client_secret: expect.any(String),
        registration_access_token: expect.any(String),
        registration_client_uri: `${ISSUER}/register/${client["client_id"]}`,
        redirect_uri: PRODUCTION_CALLBACK,
        terms: "https://samebase.com/terms",
      });
    });

    it("creates the client at the broker in the repository's tenant, under its owner", async () => {
      const t = makeConvexTest();
      const client = await createClient(t);

      const row = await t.query(components.identityBroker.clients.get, {
        clientId: client.client_id,
      });
      expect(row).toMatchObject({
        appId: `gh-${REPOSITORY_ID}-${APP_HASH}`,
        redirectUri: PRODUCTION_CALLBACK,
        deploymentType: "production",
        clientName: "prod",
        softwareVersion: "abc123",
        tokenEndpointAuthMethod: "client_secret_post",
      });
      expect(
        await t.query(components.identityBroker.apps.get, {
          appId: `gh-${REPOSITORY_ID}-${APP_HASH}`,
        }),
      ).toMatchObject({ firstParty: false, connector: "google-apps", tenantId: "gh-74" });
      expect(await readOwnRecord(t, client)).toBe(200);
    });

    it("puts a preview in its own app, on the exact address that the run sent", async () => {
      const t = makeConvexTest();
      stubProviders();

      const response = await postHubClient(t, await signToken(pullRequestClaims), {
        redirectUri: "https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub",
      });
      const client: { client_id: string } = await response.json();

      expect(
        await t.query(components.identityBroker.clients.get, { clientId: client.client_id }),
      ).toMatchObject({
        appId: `gh-${REPOSITORY_ID}-${APP_HASH}-preview`,
        redirectUri: "https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub",
        deploymentType: "preview",
        clientName: "pr-12",
      });
    });

    it("records what the token said, with the client id and no secret", async () => {
      vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
      const t = makeConvexTest();
      const client = await createClient(t);

      const rows = await readRegistrations(t);
      expect(rows).toEqual([
        expect.objectContaining({
          clientId: client.client_id,
          githubRepositoryDatabaseId: REPOSITORY_ID,
          githubOwnerId: OWNER_ID,
          githubRepository: "octo-org/octo-repo",
          githubActorId: "12",
          githubActorLogin: "octocat",
          commitSha: "example-sha",
          stage: "prod",
          app: "my-app",
          redirectUri: PRODUCTION_CALLBACK,
          registeredAt: 1_800_000_000_000,
        }),
      ]);
      const tables = JSON.stringify([rows, await readRateLimits(t)]);
      expect(tables).not.toContain(client.client_secret);
      expect(tables).not.toContain(client.registration_access_token);
    });

    it("keeps the secret and the token out of every log", async () => {
      const t = makeConvexTest();
      const logs = (["log", "info", "warn", "error"] as const).map((method) =>
        vi.spyOn(console, method),
      );

      const client = await createClient(t);

      const logged = JSON.stringify(logs.map((log) => log.mock.calls));
      expect(logged).not.toContain(client.client_secret);
      expect(logged).not.toContain(client.registration_access_token);
    });

    it("records nothing when the broker refuses, and says why", async () => {
      const t = makeConvexTest();
      await t.mutation(components.identityBroker.registration.setSuspended, {
        tenantId: "gh-74",
        suspended: true,
        now: Date.now(),
      });
      stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "suspended" });
      expect(await readRegistrations(t)).toEqual([]);
    });
  });

  describe("the pause", () => {
    it("refuses every request while THIRD_PARTY_PAUSED is true, before it reads the token", async () => {
      const t = makeConvexTest();
      vi.stubEnv("THIRD_PARTY_PAUSED", "true");
      const fileRequests = stubProviders();

      const response = await postHubClient(t, "not-a-token");

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "paused" });
      expect(fetch).not.toHaveBeenCalled();
      expect(fileRequests).toEqual([]);
    });
  });

  describe("the GitHub token", () => {
    const tokens = {
      "a bad signature": () => signToken({}, { key: foreignKey }),
      "a wrong audience": () => signToken({ aud: "https://github.com/octo-org" }),
      "an audience list that holds samebase": () => signToken({ aud: ["samebase", "other"] }),
      "a wrong issuer": () => signToken({ iss: "https://issuer.example.test" }),
      "an expired token": () => signToken({}, { expiresInSeconds: -60 }),
      "a token that never expires": () => signToken({}, { withoutExpiry: true }),
    };

    it.each(Object.entries(tokens))("refuses %s and touches no table", async (_, sign) => {
      const t = makeConvexTest();
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await sign());

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_token" });
      expect(fileRequests).toEqual([]);
      expect(await readRateLimits(t)).toEqual([]);
    });

    it("answers 502, not 401, when GitHub's key set cannot be read", async () => {
      const t = makeConvexTest();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("Service Unavailable", { status: 503 })),
      );

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "github_unavailable" });
    });

    it.each([
      ["the event dynamic", { event_name: "dynamic" }],
      ["the event pull_request_target", { event_name: "pull_request_target" }],
      ["a push on another branch", { event_name: "push", ref: "refs/heads/feature" }],
      ["a push of a tag", { event_name: "push", ref: "refs/tags/main" }],
      ["a pull request head ref", { event_name: "pull_request", ref: "refs/pull/12/head" }],
    ])("refuses %s", async (_, claims) => {
      const t = makeConvexTest();
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await signToken(claims));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "run_not_allowed" });
      expect(fileRequests).toEqual([]);
    });

    it("accepts a workflow_dispatch run on main", async () => {
      const t = makeConvexTest();
      stubProviders();

      const response = await postHubClient(
        t,
        await signToken({ event_name: "workflow_dispatch", ref: "refs/heads/main" }),
      );

      expect(response.status).toBe(201);
    });
  });

  describe("the body", () => {
    it.each([
      ["no app", { app: "" }],
      ["an app over 64 characters", { app: "a".repeat(65) }],
      ["no version", { softwareVersion: "" }],
      ["a very long version", { softwareVersion: "v".repeat(257) }],
      ["a body that is not text", { app: 1 }],
      ["no return address", { redirectUri: undefined }],
      ["an http return address", { redirectUri: "http://ideal-dolphin-15.convex.site/cb" }],
      ["a fragment", { redirectUri: `${PRODUCTION_CALLBACK}#top` }],
      ["an empty fragment", { redirectUri: `${PRODUCTION_CALLBACK}#` }],
      ["user info", { redirectUri: "https://user:pass@ideal-dolphin-15.convex.site/cb" }],
      ["an IPv4 address", { redirectUri: "https://127.0.0.1/cb" }],
      ["an IPv4 address in hex", { redirectUri: "https://0x7f000001/cb" }],
      ["an IPv6 address", { redirectUri: "https://[::1]/cb" }],
      ["localhost", { redirectUri: "https://localhost/cb" }],
      ["a name under localhost", { redirectUri: "https://app.localhost/cb" }],
      ["a very long address", { redirectUri: `${PRODUCTION_HOST}/${"a".repeat(2_048)}` }],
    ])("answers 400 for %s and fetches nothing", async (_, body) => {
      const t = makeConvexTest();
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await signToken(), body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
      expect(await readRateLimits(t)).toEqual([]);
      expect(fileRequests).toEqual([]);
    });

    it("accepts an app of exactly 64 characters", async () => {
      const t = makeConvexTest();
      stubProviders();

      const response = await postHubClient(t, await signToken(), { app: "a".repeat(64) });

      expect(response.status).toBe(201);
    });
  });

  describe("the host", () => {
    it("reads the file at the root of the return address's origin, with no redirects", async () => {
      const t = makeConvexTest();
      const fileRequests = stubProviders();

      await postHubClient(t, await signToken(), {
        redirectUri: "https://app.example.com:8443/api/auth/callback/hub?x=1",
      });

      expect(fileRequests).toEqual([
        {
          url: "https://app.example.com:8443/samebase-verification.json",
          init: expect.objectContaining({ redirect: "manual" }),
        },
      ]);
      expect(fileRequests[0]?.init?.credentials).toBeUndefined();
    });

    it.each([
      [
        "a timeout",
        () => Promise.reject(new DOMException("timed out", "TimeoutError")),
        "host_unreachable",
      ],
      [
        "a failed connection",
        () => Promise.reject(new TypeError("fetch failed")),
        "host_unreachable",
      ],
      ["a 404", () => new Response("Not Found", { status: 404 }), "verification_file_missing"],
      [
        "a redirect, which it never follows",
        () =>
          new Response(null, {
            status: 301,
            headers: { Location: "https://elsewhere.example.com/samebase-verification.json" },
          }),
        "verification_file_missing",
      ],
      ["text that is not JSON", () => new Response("<html></html>"), "verification_file_invalid"],
      [
        "a name instead of the id",
        () => jsonResponse({ repository: "octo-org/octo-repo" }),
        "verification_file_invalid",
      ],
      ["a fraction", () => jsonResponse({ repository: 74.5 }), "verification_file_invalid"],
      [
        "a body over 4 KiB",
        () => jsonResponse({ repository: REPOSITORY_ID, pad: "x".repeat(4_096) }),
        "verification_file_invalid",
      ],
      [
        "a streamed body over 4 KiB with no length",
        () =>
          streamedResponse([`{"repository":"${REPOSITORY_ID}","pad":"`, "x".repeat(5_000), '"}']),
        "verification_file_invalid",
      ],
      ["another id", () => jsonResponse({ repository: "999" }), "repository_mismatch"],
    ])("refuses on %s, creates nothing, and never shows the body", async (_, host, reason) => {
      const t = makeConvexTest();
      stubProviders(host);

      const response = await postHubClient(t, await signToken());
      const text = await response.text();

      expect(response.status).toBe(403);
      expect(JSON.parse(text)).toEqual({ error: "not_allowed", reason });
      expect(text).not.toContain("999");
      expect(await readRegistrations(t)).toEqual([]);
    });

    it.each([
      ["a number", () => jsonResponse({ repository: Number(REPOSITORY_ID) })],
      ["more members and no Content-Type", () => new Response(`{"repository":74,"note":"hi"}`)],
      ["a streamed body", () => streamedResponse(['{"repos', `itory":"${REPOSITORY_ID}"}`])],
    ])("accepts the id as %s", async (_, host) => {
      const t = makeConvexTest();
      stubProviders(host);

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(201);
    });
  });

  describe("the blocks", () => {
    it.each([
      ["repository", REPOSITORY_ID],
      ["owner", OWNER_ID],
    ] as const)("refuses a blocked %s before it fetches the file", async (kind, githubId) => {
      const t = makeConvexTest();
      expect((await setBlock(t, { action: "block", kind, githubId })).status).toBe(200);
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "not_allowed", reason: "blocked" });
      expect(fileRequests).toEqual([]);
      expect(await readRateLimits(t)).toEqual([]);
      expect(await readRegistrations(t)).toEqual([]);
    });

    it.each([
      ["repository", REPOSITORY_ID],
      ["owner", OWNER_ID],
    ] as const)(
      "refuses a %s blocked while the file was fetched, and creates no client",
      async (kind, githubId) => {
        const t = makeConvexTest();
        stubProviders(async () => {
          await t.mutation(internal.moderation.setBlock, {
            action: "block",
            kind,
            githubId,
            reason: "Phishing page",
            adminEmail: "nicu@samebase.com",
          });
          return jsonResponse({ repository: REPOSITORY_ID });
        });

        const response = await postHubClient(t, await signToken());

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "not_allowed", reason: "blocked" });
        expect(await readRegistrations(t)).toEqual([]);
        expect(await t.query(components.identityBroker.apps.list, {})).toEqual([]);
      },
    );

    it("blocking an owner stops each of its repositories, and unblocking restores only those with no other block", async () => {
      const t = makeConvexTest();
      const first = await createClient(t);
      const second = await createClient(t, { repository_id: "75", repository: "octo-org/two" });
      const other = await createClient(t, {
        repository_id: "76",
        repository_owner_id: "66",
        repository: "someone/else",
      });

      await setBlock(t, { action: "block", kind: "owner", githubId: OWNER_ID });
      await setBlock(t, { action: "block", kind: "repository", githubId: "75" });

      expect(await readOwnRecord(t, first)).toBe(403);
      expect(await readOwnRecord(t, second)).toBe(403);
      expect(await readOwnRecord(t, other)).toBe(200);
      const signIn = await t.fetch(
        `/authorize?client_id=${first.client_id}&redirect_uri=${encodeURIComponent(PRODUCTION_CALLBACK)}&response_type=code&scope=openid&code_challenge=${"a".repeat(43)}&code_challenge_method=S256`,
      );
      expect(signIn.status).toBe(403);
      expect(signIn.headers.get("location")).toBeNull();

      await setBlock(t, { action: "unblock", kind: "owner", githubId: OWNER_ID });

      expect(await readOwnRecord(t, first)).toBe(200);
      expect(await readOwnRecord(t, second)).toBe(403);
    });
  });

  describe("the limits", () => {
    async function seedWindow(
      t: ConvexTest,
      row: {
        scope: "repository" | "owner" | "new_owners";
        githubId: string;
        count: number;
        newOwnersWindowStartedAt: number | null;
      },
      startedAt = Date.now(),
    ) {
      await t.run(async (ctx) => {
        await ctx.db.insert("rateLimits", { ...row, startedAt });
      });
    }

    it.each([
      [
        "repository",
        { scope: "repository", githubId: REPOSITORY_ID, count: 30, newOwnersWindowStartedAt: null },
      ],
      ["owner", { scope: "owner", githubId: OWNER_ID, count: 100, newOwnersWindowStartedAt: null }],
      [
        "new_owners",
        { scope: "new_owners", githubId: "", count: 50, newOwnersWindowStartedAt: null },
      ],
    ] as const)("limits the window %s, and fetches nothing", async (window, row) => {
      const t = makeConvexTest();
      await seedWindow(t, row);
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "rate_limited", window });
      expect(fileRequests).toEqual([]);
    });

    it("counts each request against the repository, the owner, and a new owner once", async () => {
      const t = makeConvexTest();
      stubProviders(() => new Response("Not Found", { status: 404 }));
      const token = await signToken();

      await postHubClient(t, token);
      await postHubClient(t, token);

      expect(await readRateLimits(t)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "repository", githubId: REPOSITORY_ID, count: 2 }),
          expect.objectContaining({ scope: "owner", githubId: OWNER_ID, count: 2 }),
          expect.objectContaining({ scope: "new_owners", count: 1 }),
        ]),
      );
    });

    it("counts a new owner again in a later new-owners window, while its own window runs", async () => {
      const t = makeConvexTest();
      const now = Date.now();
      // Counted as new in a window that has ended; its own window is still running.
      await seedWindow(
        t,
        {
          scope: "owner",
          githubId: OWNER_ID,
          count: 1,
          newOwnersWindowStartedAt: now - 2 * 60 * 60 * 1_000,
        },
        now - 10 * 60 * 1_000,
      );
      await seedWindow(
        t,
        { scope: "new_owners", githubId: "", count: 50, newOwnersWindowStartedAt: null },
        now - 5 * 60 * 1_000,
      );
      const fileRequests = stubProviders();

      const response = await postHubClient(t, await signToken());

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "rate_limited", window: "new_owners" });
      expect(fileRequests).toEqual([]);
    });

    it("does not count an owner with a registration as new, and still limits the others", async () => {
      const t = makeConvexTest();
      await createClient(t);
      // The owner's window has ended, so only its registration says that it is not new.
      await t.run(async (ctx) => {
        for (const row of await ctx.db.query("rateLimits").collect()) {
          if (row.scope === "owner") await ctx.db.delete("rateLimits", row._id);
          if (row.scope === "new_owners") await ctx.db.patch("rateLimits", row._id, { count: 50 });
        }
      });
      stubProviders();

      const known = await postHubClient(t, await signToken());
      const stranger = await postHubClient(
        t,
        await signToken({ repository_id: "80", repository_owner_id: "90" }),
      );

      expect(known.status).toBe(201);
      expect(stranger.status).toBe(429);
      expect(await stranger.json()).toEqual({ error: "rate_limited", window: "new_owners" });
    });

    it("starts a new window after an hour", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const t = makeConvexTest();
      await seedWindow(t, {
        scope: "repository",
        githubId: REPOSITORY_ID,
        count: 30,
        newOwnersWindowStartedAt: null,
      });
      const token = await signToken({}, { expiresInSeconds: 7_200 });
      vi.setSystemTime(Date.now() + 60 * 60 * 1_000 + 1);
      stubProviders();

      const response = await postHubClient(t, token);

      expect(response.status).toBe(201);
      expect(await readRateLimits(t)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "repository", githubId: REPOSITORY_ID, count: 1 }),
        ]),
      );
    });
  });
});

describe("the shared registration key", () => {
  it("creates no client and switches no tenant, also while the old variable is still set", async () => {
    const t = makeConvexTest();
    vi.stubEnv("REGISTRATION_ACCESS_TOKEN", "registration-token");
    const client = await createClient(t);
    const headers = {
      Authorization: "Bearer registration-token",
      "Content-Type": "application/json",
    };

    const register = await t.fetch("/register", {
      method: "POST",
      headers,
      body: JSON.stringify({
        redirect_uris: [PRODUCTION_CALLBACK],
        client_name: "prod",
        software_id: "gh-74-app",
        software_version: "abc123",
        tenant_id: "gh-74",
        deployment_type: "production",
        token_endpoint_auth_method: "client_secret_post",
      }),
    });
    const connection = await t.fetch("/tenant-connection", {
      method: "POST",
      headers,
      body: JSON.stringify({ tenant_id: "gh-74", connected: false, revision: 99 }),
    });
    const discovery = await t.fetch("/.well-known/openid-configuration");

    expect(register.status).toBe(404);
    expect(connection.status).toBe(404);
    expect(await discovery.json()).not.toHaveProperty("registration_endpoint");
    expect(await readOwnRecord(t, client)).toBe(200);
  });
});
