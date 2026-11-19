// The port of hubClients.test.ts of the Convex broker: `POST /register` through the router, on the
// memory Store, with the source's two connectors `fake` and `other` of one fake provider.
import { Effect, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Tx } from "../../store/Tx.ts";
import { sha256Hex } from "../subject.ts";
import {
  APP_ID,
  createClient,
  createDevelopmentClient,
  createHub,
  createInitialAccessToken,
  EPOCH,
  ISSUER,
  jsonResponse,
  JWKS_URL,
  LOOPBACK_CALLBACK,
  NewClient,
  OWNER_ID,
  postHubClient,
  PRODUCTION_CALLBACK,
  PRODUCTION_HOST,
  pullRequestClaims,
  readNewClient,
  readOwnRecord,
  REPOSITORY_ID,
  seedClient,
  setBlock,
  signToken,
  stubProviders,
  testPolicy,
  type Hub,
} from "./testing/hub.ts";

const decodeNewClient = Schema.decodeUnknownSync(NewClient);

afterEach(() => {
  vi.restoreAllMocks();
});

/** The 401 body of a refused Bearer token (RFC 6750 section 3). */
const INVALID_TOKEN = { error: "invalid_token", error_description: "The token is invalid." };

/** The body of a JSON refusal: `error`, its fixed `error_description`, and the hub's own members. */
const refusalBody = (error: string, more: Record<string, unknown> = {}) => ({
  error,
  error_description: expect.any(String),
  ...more,
});

/** The 403 of RFC 6750 section 3.1, with the rule that refused the registration. */
async function expectInsufficientScope(response: Response, reason?: string) {
  expect(response.status).toBe(403);
  expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="insufficient_scope"');
  expect(await response.json()).toEqual(
    refusalBody("insufficient_scope", reason === undefined ? {} : { reason }),
  );
}

const clientRow = (h: Hub, clientId: string) =>
  h.rows().clients.find((row) => row.clientId === clientId);
const registrationEvents = (h: Hub) => h.rows().events;

function seedWindow(
  h: Hub,
  row: { scope: "repository" | "owner" | "new_owners"; githubId: string; count: number },
  startedAt = h.clock.now(),
) {
  h.memory.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      yield* tx.insert("rateLimits", { ...row, startedAt });
    }),
  );
}

/** Rewrites each rate limit row: `change` answers the new count, or null to delete the row. */
function changeWindows(h: Hub, change: (row: { scope: string; count: number }) => number | null) {
  h.memory.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const rows = yield* tx.query("rateLimits", "by_scope_and_github_id", {
        eq: [],
        order: "asc",
        limit: 100,
      });
      for (const row of rows) {
        const count = change(row.doc);
        if (count === null) {
          yield* tx.delete("rateLimits", row.id);
        } else {
          yield* tx.replace("rateLimits", row.id, { ...row.doc, count });
        }
      }
    }),
  );
}

/** Deletes every initial access token row. */
function deleteInitialAccessTokens(h: Hub) {
  h.memory.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      const rows = yield* tx.query("initialAccessTokens", "by_token_hash", {
        eq: [],
        order: "asc",
        limit: 100,
      });
      for (const row of rows) {
        yield* tx.delete("initialAccessTokens", row.id);
      }
    }),
  );
}

function insertInitialAccessToken(h: Hub, row: { tokenHash: string; app: string }) {
  h.memory.withTx(
    Effect.gen(function* () {
      const tx = yield* Tx;
      yield* tx.insert("initialAccessTokens", {
        tokenHash: row.tokenHash,
        githubRepositoryDatabaseId: REPOSITORY_ID,
        githubOwnerId: OWNER_ID,
        githubRepository: "octo-org/octo-repo",
        app: row.app,
        issuedAt: h.clock.now(),
      });
    }),
  );
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

describe("POST /register", () => {
  describe("a new client", () => {
    it("needs no Samebase account, and answers the client with the terms", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h));

      expect(response.status).toBe(201);
      expect(response.headers.get("Content-Type")).toMatch(/^application\/json/);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Pragma")).toBe("no-cache");
      const body: unknown = await response.json();
      const client = decodeNewClient(body);
      expect(body).toEqual({
        client_id: expect.stringMatching(/^cl_/),
        client_id_issued_at: EPOCH / 1_000,
        client_secret_expires_at: 0,
        registration_client_uri: `${ISSUER}/register/${client.client_id}`,
        redirect_uris: [PRODUCTION_CALLBACK],
        client_name: "prod",
        software_id: `gh-${REPOSITORY_ID}/my-app`,
        software_version: "abc123",
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        application_type: "web",
        subject_type: "public",
        id_token_signed_response_alg: "RS256",
        connectors: ["fake"],
        client_secret: expect.any(String),
        registration_access_token: expect.any(String),
        issuer: ISSUER,
        terms: "https://hub.example.com/terms",
        initial_access_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        repository: REPOSITORY_ID,
      });
    });

    it("creates the client in the repository's tenant, under its owner", async () => {
      const h = await createHub();
      const client = await createClient(h);

      expect(clientRow(h, client.client_id)).toMatchObject({
        appId: APP_ID,
        redirectUris: [PRODUCTION_CALLBACK],
        deploymentType: "production",
        clientName: "prod",
        softwareVersion: "abc123",
        tokenEndpointAuthMethod: "client_secret_post",
        connectors: ["fake"],
      });
      expect(h.rows().apps).toEqual([
        { appId: APP_ID, name: APP_ID, tenantId: "gh-74", createdAt: EPOCH },
      ]);
      expect(h.rows().tenants).toEqual([
        { tenantId: "gh-74", ownerId: OWNER_ID, ownerProofIssuedAt: EPOCH / 1_000 },
      ]);
      expect(await readOwnRecord(h, client)).toBe(200);
    });

    it("records the enrollment sorted and unique, and the client's own record repeats it", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), {
        connectors: ["other", "fake", "other"],
      });
      const client = await readNewClient(response);

      expect(response.status).toBe(201);
      expect(client.connectors).toEqual(["fake", "other"]);
      expect(clientRow(h, client.client_id)).toMatchObject({ connectors: ["fake", "other"] });
      const record = await h.fetchBroker(`${ISSUER}/register/${client.client_id}`, {
        headers: { Authorization: `Bearer ${client.registration_access_token}` },
      });
      expect(await record.json()).toMatchObject({ connectors: ["fake", "other"] });
    });

    it("puts a preview in the app of its name, on the exact address that the run sent", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h, pullRequestClaims), {
        redirect_uris: ["https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub"],
      });
      const client = await readNewClient(response);

      expect(clientRow(h, client.client_id)).toMatchObject({
        appId: APP_ID,
        redirectUris: ["https://calm-cow-456.eu-west-1.convex.site/api/auth/callback/hub"],
        deploymentType: "preview",
        clientName: "pr-12",
      });
    });

    it("records what the token said, with the client id and no secret", async () => {
      const h = await createHub();
      const client = await createClient(h);

      const rows = h.rows();
      expect(rows.clients).toEqual([
        expect.objectContaining({
          clientId: client.client_id,
          clientName: "prod",
          app: "my-app",
          redirectUris: [PRODUCTION_CALLBACK],
          createdAt: EPOCH,
          registeredBy: {
            kind: "github",
            githubRepository: "octo-org/octo-repo",
            githubOwnerId: OWNER_ID,
            githubActorId: "12",
            githubActorLogin: "octocat",
            commitSha: "example-sha",
          },
        }),
      ]);
      expect(rows.events).toEqual([
        {
          kind: "registration",
          clientId: client.client_id,
          githubRepositoryDatabaseId: REPOSITORY_ID,
          githubOwnerId: OWNER_ID,
          at: EPOCH,
        },
      ]);
      const tables = JSON.stringify(rows);
      expect(tables).not.toContain(client.client_secret);
      expect(tables).not.toContain(client.registration_access_token);
      expect(tables).not.toContain(client.initial_access_token);
    });

    it("keeps the secret and the token out of every log", async () => {
      const h = await createHub();
      const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );

      const client = await createClient(h);
      const token = client.initial_access_token ?? "";
      const development = await createDevelopmentClient(h, token);

      const logged = JSON.stringify(logs.map((log) => log.mock.calls));
      expect(token).not.toBe("");
      for (const secret of [
        client.client_secret,
        client.registration_access_token,
        token,
        development.client_secret,
        development.registration_access_token,
      ]) {
        expect(logged).not.toContain(secret);
      }
    });

    it("logs one hub_event line per answer, with the repository, app, and deployment", async () => {
      const h = await createHub();
      const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

      const client = await createClient(h);
      await createDevelopmentClient(h, client.initial_access_token ?? "");
      await stubProviders(h, () => new Response("Not Found", { status: 404 }));
      expect((await postHubClient(h, await signToken(h))).status).toBe(400);

      const line = (event: string, deployment: string, reason: string | null) =>
        `hub_event ${JSON.stringify({ event, repository: "octo-org/octo-repo", app: "my-app", deployment, connector: null, reason })}`;
      expect(info.mock.calls).toEqual([
        [line("registration", "production", null)],
        [line("registration", "development", null)],
        [line("registration_refused", "production", "verification_file_missing")],
      ]);
    });

    it("records nothing when the store refuses, and says why", async () => {
      const h = await createHub();
      // The tenant's budget of apps is full, so the rule refuses a new app of the repository.
      for (let index = 0; index < 10; index += 1) {
        seedClient(h, {
          tenantId: `gh-${REPOSITORY_ID}`,
          appId: `gh-${REPOSITORY_ID}-other-${index}`,
          deploymentType: "production",
          clientId: `cl_other_${index}`,
          clientName: "prod",
          now: h.clock.now(),
        });
      }
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h));

      await expectInsufficientScope(response, "too_many_apps");
      expect(registrationEvents(h)).toEqual([]);
      expect(h.rows().initialAccessTokens).toEqual([]);
    });

    it("refuses a production client when every production client of the app has signed someone in", async () => {
      const h = await createHub();
      for (let index = 0; index < 30; index += 1) {
        seedClient(h, {
          tenantId: `gh-${REPOSITORY_ID}`,
          appId: APP_ID,
          deploymentType: "production",
          clientId: `cl_prod_${index}`,
          clientName: "prod",
          lastSignInAt: h.clock.now(),
          now: h.clock.now(),
        });
      }
      await stubProviders(h);

      await expectInsufficientScope(await postHubClient(h, await signToken(h)), "too_many_clients");
    });

    it("refuses an app whose id another tenant holds", async () => {
      const h = await createHub();
      seedClient(h, {
        tenantId: "gh-99",
        appId: APP_ID,
        deploymentType: "production",
        clientId: "cl_other",
        clientName: "prod",
        now: h.clock.now(),
      });
      await stubProviders(h);

      await expectInsufficientScope(await postHubClient(h, await signToken(h)), "app_taken");
    });
  });

  describe("the policy", () => {
    it("refuses a paused registration before it reads the file, and lets one the policy exempts register", async () => {
      const h = await createHub({
        policy: (registration) => testPolicy({ paused: registration.repositoryId !== "81" }),
      });
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h));

      await expectInsufficientScope(response, "paused");
      expect(fileRequests).toEqual([]);
      expect(h.rows().rateLimits).toEqual([]);
      const exempt = await createClient(h, { repository_id: "81" });
      expect(exempt.client_id).toMatch(/^cl_/);
    });

    it("sees the registration's facts: the repository, its owner, the app, the deploy, the address, and the proof", async () => {
      const seen: unknown[] = [];
      const h = await createHub({
        policy: (registration) => {
          seen.push(registration);
          return testPolicy();
        },
      });
      const production = await createClient(h);
      await createDevelopmentClient(h, production.initial_access_token ?? "");
      await stubProviders(h);
      await postHubClient(h, await signToken(h, pullRequestClaims));

      expect(seen).toEqual([
        {
          repositoryId: REPOSITORY_ID,
          repository: "octo-org/octo-repo",
          ownerId: OWNER_ID,
          app: "my-app",
          deploymentType: "production",
          redirectUris: [PRODUCTION_CALLBACK],
          proof: "github-actions",
        },
        {
          repositoryId: REPOSITORY_ID,
          repository: "octo-org/octo-repo",
          ownerId: OWNER_ID,
          app: "my-app",
          deploymentType: "development",
          redirectUris: [LOOPBACK_CALLBACK],
          proof: "initial-access-token",
        },
        expect.objectContaining({ deploymentType: "preview", proof: "github-actions" }),
      ]);
    });

    it("refuses an enrollment outside the hub's connectors or the policy's, and names the allowed ones", async () => {
      const h = await createHub({
        policy: (registration) =>
          testPolicy({
            connectors: registration.app === "my-app" ? ["other"] : ["fake", "other"],
          }),
      });
      const fileRequests = await stubProviders(h);

      const unknown = await postHubClient(h, await signToken(h), { connectors: ["okta"] });
      const disallowed = await postHubClient(h, await signToken(h), {
        connectors: ["fake", "other"],
      });
      const allowed = await postHubClient(h, await signToken(h), { connectors: ["other"] });

      const refusal = refusalBody("invalid_client_metadata", {
        reason: "invalid_connectors",
        allowed: ["other"],
      });
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toEqual(refusal);
      expect(disallowed.status).toBe(400);
      expect(await disallowed.json()).toEqual(refusal);
      expect(allowed.status).toBe(201);
      // The two refusals fetched nothing and counted nowhere.
      expect(fileRequests).toHaveLength(1);
      expect(h.rows().rateLimits).toEqual([
        expect.objectContaining({ scope: "repository", count: 1 }),
        expect.objectContaining({ scope: "owner", count: 1 }),
        expect.objectContaining({ scope: "new_owners", count: 1 }),
      ]);
    });

    it.each([
      ["no connectors", []],
      ["a connector name with a capital", ["Fake"]],
      ["a connector name with a space", ["fake other"]],
      ["a connector name over 64 characters", ["a".repeat(65)]],
      ["a connector the hub does not have", ["fake", "okta"]],
    ])("answers invalid_connectors with the allowed names for %s", async (_, connectors) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), { connectors });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        refusalBody("invalid_client_metadata", {
          reason: "invalid_connectors",
          allowed: ["fake", "other"],
        }),
      );
      expect(fileRequests).toEqual([]);
      expect(h.rows().rateLimits).toEqual([]);
      expect(h.rows().clients).toEqual([]);
    });

    it("enrolls in every allowed connector without `connectors`, and refuses when none is allowed", async () => {
      const h = await createHub({
        policy: (registration) =>
          testPolicy({ connectors: registration.app === "my-app" ? ["fake", "other"] : [] }),
      });
      await stubProviders(h);

      const all = await postHubClient(h, await signToken(h), { connectors: undefined });
      const none = await postHubClient(h, await signToken(h), {
        software_id: "empty-app",
        connectors: undefined,
      });

      expect(all.status).toBe(201);
      expect(await all.json()).toMatchObject({ connectors: ["fake", "other"] });
      expect(none.status).toBe(400);
      expect(await none.json()).toEqual(
        refusalBody("invalid_client_metadata", { reason: "invalid_connectors", allowed: [] }),
      );
    });

    it("the development command refuses a token row that differs from any fact the policy saw, and writes nothing", async () => {
      const h = await createHub();
      const token = await createInitialAccessToken(h);
      const facts = {
        tokenHash: await sha256Hex(token),
        githubRepositoryDatabaseId: REPOSITORY_ID,
        githubOwnerId: OWNER_ID,
        githubRepository: "octo-org/octo-repo",
        app: "my-app",
      };
      const before = h.rows();
      for (const changed of [
        { githubRepositoryDatabaseId: "75" },
        { githubOwnerId: "66" },
        { githubRepository: "octo-org/other" },
        { app: "other-app" },
      ]) {
        const seen = { ...facts, ...changed };
        expect(
          h.memory.run("hubClients.createDevelopmentClient", {
            clientId: "cl_dev",
            secretHash: "secret-hash",
            registrationTokenHash: "token-hash",
            tokenHash: seen.tokenHash,
            githubRepositoryDatabaseId: seen.githubRepositoryDatabaseId,
            githubOwnerId: seen.githubOwnerId,
            githubRepository: seen.githubRepository,
            app: seen.app,
            appId: `gh-${seen.githubRepositoryDatabaseId}-${(await sha256Hex(seen.app)).slice(0, 32)}`,
            connectors: ["fake"],
            policyConnectors: ["fake"],
            configuredConnectors: ["fake"],
            redirectUris: [LOOPBACK_CALLBACK],
            softwareVersion: "dev-1",
            tokenEndpointAuthMethod: "client_secret_post",
          }),
        ).toEqual({ ok: false, reason: "invalid_token" });
      }
      expect(h.rows()).toEqual(before);
    });

    it("refuses with 503 and writes nothing when the policy throws or answers a malformed value", async () => {
      let answer: () => unknown = () => {
        throw new Error("no env");
      };
      // @ts-expect-error The policy is wrong on purpose: the core validates its answer at runtime.
      const h = await createHub({ policy: () => answer() });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fileRequests = await stubProviders(h);

      const thrown = await postHubClient(h, await signToken(h));
      answer = () => ({ connectors: "fake", resources: [], paused: false });
      const malformed = await postHubClient(h, await signToken(h));
      answer = () => ({ connectors: ["fake"], resources: [], paused: false, extra: true });
      const wider = await postHubClient(h, await signToken(h));

      for (const response of [thrown, malformed, wider]) {
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual(refusalBody("temporarily_unavailable"));
      }
      expect(fileRequests).toEqual([]);
      expect(h.rows().rateLimits).toEqual([]);
      expect(h.rows().clients).toEqual([]);
    });
  });

  describe("the GitHub token", () => {
    const tokens: Record<string, (h: Hub) => Promise<string>> = {
      "a bad signature": (h) => signToken(h, {}, { foreign: true }),
      "a wrong audience": (h) => signToken(h, { aud: "https://github.com/octo-org" }),
      "a token for another hub": (h) => signToken(h, { aud: "https://auth.other-hub.example" }),
      "a token for the audience every hub shared before 0.27.0": (h) =>
        signToken(h, { aud: "samebase" }),
      "an audience list that holds this hub": (h) => signToken(h, { aud: [ISSUER, "other"] }),
      "a wrong issuer": (h) => signToken(h, { iss: "https://issuer.example.test" }),
      "an expired token": (h) => signToken(h, {}, { expiresInSeconds: -60 }),
      "a token that never expires": (h) => signToken(h, {}, { withoutExpiry: true }),
      "a repository id that is a number": (h) => signToken(h, { repository_id: 74 }),
      "a token without the actor": (h) => signToken(h, { actor: undefined }),
    };

    it.each(Object.entries(tokens))("refuses %s and touches no table", async (_, sign) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await sign(h));

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
      expect(await response.json()).toEqual(INVALID_TOKEN);
      expect(fileRequests).toEqual([]);
      expect(h.rows().rateLimits).toEqual([]);
    });

    it("answers 502, not 401, when GitHub's key set cannot be read", async () => {
      const h = await createHub();
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      h.fetch.plan({
        match: (request) => request.url === JWKS_URL,
        respond: () => new Response("Service Unavailable", { status: 503 }),
      });

      const response = await postHubClient(h, await signToken(h));

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual(refusalBody("github_unavailable"));
    });

    it("reads GitHub's key set with a time limit", async () => {
      const h = await createHub();
      await stubProviders(h);

      await postHubClient(h, await signToken(h));

      const keyRequest = h.fetch.requests.find((request) => request.url === JWKS_URL);
      expect(keyRequest?.signal).toBeInstanceOf(AbortSignal);
      expect(keyRequest?.headers.get("authorization")).toBeNull();
    });

    it.each([
      ["the event dynamic", { event_name: "dynamic" }],
      ["the event pull_request_target", { event_name: "pull_request_target" }],
      ["a push on another branch", { event_name: "push", ref: "refs/heads/feature" }],
      ["a push of a tag", { event_name: "push", ref: "refs/tags/main" }],
      ["a pull request head ref", { event_name: "pull_request", ref: "refs/pull/12/head" }],
      ["pull request zero", { event_name: "pull_request", ref: "refs/pull/0/merge" }],
    ])("refuses %s", async (_, claims) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h, claims));

      await expectInsufficientScope(response, "run_not_allowed");
      expect(fileRequests).toEqual([]);
    });

    it("accepts a workflow_dispatch run on main", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(
        h,
        await signToken(h, { event_name: "workflow_dispatch", ref: "refs/heads/main" }),
      );

      expect(response.status).toBe(201);
    });
  });

  describe("the body", () => {
    it.each([
      ["an empty app", { software_id: "" }],
      ["an app over 64 characters", { software_id: "a".repeat(65) }],
      ["an empty app in the full form", { software_id: `gh-${REPOSITORY_ID}/` }],
      ["the full form of another repository", { software_id: "gh-75/my-app" }],
      ["an empty version", { software_version: "" }],
      ["a very long version", { software_version: "v".repeat(257) }],
      ["a body that is not text", { software_id: 1 }],
      ["a software_id of null", { software_id: null }],
      ["connectors that are not a list", { connectors: "fake" }],
      ["the implicit grant", { grant_types: ["authorization_code", "implicit"] }],
      ["the token response type", { response_types: ["token"] }],
      ["a native application", { application_type: "native" }],
      ["pairwise subjects", { subject_type: "pairwise" }],
      ["an id_token signed with ES256", { id_token_signed_response_alg: "ES256" }],
      ["a sector identifier", { sector_identifier_uri: `${PRODUCTION_HOST}/sector.json` }],
      ["signed userinfo", { userinfo_signed_response_alg: "RS256" }],
      ["signed request objects", { request_object_signing_alg: "RS256" }],
      ["an encrypted id_token", { id_token_encrypted_response_alg: "RSA-OAEP" }],
      ["an encrypted userinfo", { userinfo_encrypted_response_enc: "A128GCM" }],
      ["encrypted request objects", { request_object_encryption_alg: "RSA-OAEP" }],
    ])("answers 400 invalid_client_metadata for %s and fetches nothing", async (_, body) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_client_metadata"));
      expect(h.rows().rateLimits).toEqual([]);
      expect(fileRequests).toEqual([]);
    });

    it.each([
      ["a JSON array", "[]"],
      ["JSON null", "null"],
      ["text that is not JSON", "redirect_uris"],
      ["no body", undefined],
    ])("answers 400 invalid_client_metadata for %s", async (_, body) => {
      const h = await createHub();
      await stubProviders(h);

      const response = await h.fetchBroker(`${h.issuer}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await signToken(h)}` },
        ...(body === undefined ? {} : { body }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_client_metadata"));
    });

    it.each([
      ["absent", undefined, `gh-${REPOSITORY_ID}/app`],
      ["the app name", "weather-app", `gh-${REPOSITORY_ID}/weather-app`],
      ["the full form", `gh-${REPOSITORY_ID}/weather-app`, `gh-${REPOSITORY_ID}/weather-app`],
    ])(
      "takes software_id %s, and answers the full form in the answer and the read",
      async (_, softwareId, full) => {
        const h = await createHub();
        await stubProviders(h);

        const response = await postHubClient(h, await signToken(h), { software_id: softwareId });
        const client = await readNewClient(response);
        const record = await h.fetchBroker(client.registration_client_uri, {
          headers: { Authorization: `Bearer ${client.registration_access_token}` },
        });

        expect(response.status).toBe(201);
        expect(client.software_id).toBe(full);
        expect(await record.json()).toMatchObject({ software_id: full });
        expect(h.rows().clients).toEqual([
          expect.objectContaining({ app: full.slice(full.indexOf("/") + 1) }),
        ]);
      },
    );

    it("registers an app name with a slash and its full form into the same app", async () => {
      const h = await createHub();
      await stubProviders(h);

      const answers: NewClient[] = [];
      for (const softwareId of ["a/b", `gh-${REPOSITORY_ID}/a/b`]) {
        const response = await postHubClient(h, await signToken(h), { software_id: softwareId });
        expect(response.status).toBe(201);
        answers.push(await readNewClient(response));
      }

      expect(answers.map((client) => client.software_id)).toEqual([
        `gh-${REPOSITORY_ID}/a/b`,
        `gh-${REPOSITORY_ID}/a/b`,
      ]);
      const clients = h.rows().clients;
      expect(clients).toHaveLength(2);
      expect(new Set(clients.map((row) => row.appId)).size).toBe(1);
      expect(clients.map((row) => row.app)).toEqual(["a/b", "a/b"]);
    });

    it.each([
      ["a repository id that extends the proof's", `gh-${REPOSITORY_ID}1/app`],
      ["a repository id that the proof's extends", `gh-${REPOSITORY_ID.slice(0, -1)}/app`],
    ])("refuses software_id with %s, and creates no client", async (_, softwareId) => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), { software_id: softwareId });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_client_metadata"));
      expect(h.rows().clients).toEqual([]);
    });

    it("takes the members that hold the hub's one value, and answers them", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), {
        application_type: "web",
        subject_type: "public",
        id_token_signed_response_alg: "RS256",
        client_name: "ignored",
        software_statement: "ignored",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        client_name: "prod",
        application_type: "web",
        subject_type: "public",
        id_token_signed_response_alg: "RS256",
      });
    });

    it("never quotes the request in error_description", async () => {
      const h = await createHub();
      await stubProviders(h);
      const marker = "quoted-marker";

      const answers = [
        await postHubClient(h, await signToken(h), { software_id: `gh-75/${marker}` }),
        await postHubClient(h, await signToken(h), { software_version: marker.repeat(30) }),
        await postHubClient(h, await signToken(h), { redirect_uris: [`https://${marker}/#x`] }),
        await postHubClient(h, await signToken(h), { connectors: [marker] }),
        await postHubClient(h, await signToken(h), { application_type: marker }),
      ];

      for (const answer of answers) {
        expect(answer.status).toBe(400);
        expect(await answer.json()).toEqual(
          expect.objectContaining({ error_description: expect.not.stringContaining(marker) }),
        );
      }
    });

    it.each([
      ["no return address", { redirect_uris: undefined }],
      ["a return address that is not a list", { redirect_uris: PRODUCTION_CALLBACK }],
      ["a list with a number", { redirect_uris: [PRODUCTION_CALLBACK, 1] }],
      ["an empty list of return addresses", { redirect_uris: [] }],
      [
        "nine return addresses",
        { redirect_uris: Array.from({ length: 9 }, (_, i) => `${PRODUCTION_CALLBACK}/${i}`) },
      ],
      ["an http return address", { redirect_uris: ["http://ideal-dolphin-15.convex.site/cb"] }],
      [
        "a loopback return address, which only the app's initial access token proves",
        { redirect_uris: [LOOPBACK_CALLBACK] },
      ],
      [
        "a loopback return address next to a verified one",
        { redirect_uris: [PRODUCTION_CALLBACK, LOOPBACK_CALLBACK] },
      ],
      ["a fragment", { redirect_uris: [`${PRODUCTION_CALLBACK}#top`] }],
      ["an empty fragment", { redirect_uris: [`${PRODUCTION_CALLBACK}#`] }],
      [
        "an authorization response parameter in the query",
        { redirect_uris: [`${PRODUCTION_CALLBACK}?iss=x&keep=1`] },
      ],
      ["user info", { redirect_uris: ["https://user:pass@ideal-dolphin-15.convex.site/cb"] }],
      ["an IPv4 address", { redirect_uris: ["https://127.0.0.1/cb"] }],
      ["an IPv4 address in hex", { redirect_uris: ["https://0x7f000001/cb"] }],
      ["an IPv6 address", { redirect_uris: ["https://[::1]/cb"] }],
      ["localhost", { redirect_uris: ["https://localhost/cb"] }],
      ["a name under localhost", { redirect_uris: ["https://app.localhost/cb"] }],
      ["a very long address", { redirect_uris: [`${PRODUCTION_HOST}/${"a".repeat(2_048)}`] }],
      [
        "a bad address next to a good one",
        { redirect_uris: [PRODUCTION_CALLBACK, `${PRODUCTION_CALLBACK}#top`] },
      ],
    ])("answers 400 invalid_redirect_uri for %s and fetches nothing", async (_, body) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), body);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_redirect_uri"));
      expect(h.rows().rateLimits).toEqual([]);
      expect(fileRequests).toEqual([]);
    });

    it("accepts an app of exactly 64 characters", async () => {
      const h = await createHub();
      await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), {
        software_id: "a".repeat(64),
      });

      expect(response.status).toBe(201);
    });
  });

  describe("the host", () => {
    it("reads the file at the root of the return address's origin, with no redirects and no credentials", async () => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      await postHubClient(h, await signToken(h), {
        redirect_uris: ["https://app.example.com:8443/api/auth/callback/hub?x=1"],
      });

      expect(
        fileRequests.map((request) => ({
          url: request.url,
          method: request.method,
          redirect: request.redirect,
          accept: request.headers.get("accept"),
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
        })),
      ).toEqual([
        {
          url: "https://app.example.com:8443/samebase-verification.json",
          method: "GET",
          redirect: "manual",
          accept: "application/json",
          authorization: null,
          cookie: null,
        },
      ]);
    });

    it("verifies each distinct origin once and stores the addresses sorted and unique", async () => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);
      const connections = `${PRODUCTION_HOST}/oauth/hub/callback`;
      const other = "https://other.example.com/auth/hub/callback";

      const response = await postHubClient(h, await signToken(h), {
        redirect_uris: [connections, PRODUCTION_CALLBACK, other, PRODUCTION_CALLBACK],
      });

      expect(response.status).toBe(201);
      const client = await readNewClient(response);
      expect(client.redirect_uris).toEqual([PRODUCTION_CALLBACK, connections, other]);
      expect(fileRequests.map((request) => request.url)).toEqual([
        `${PRODUCTION_HOST}/samebase-verification.json`,
        "https://other.example.com/samebase-verification.json",
      ]);
      expect(clientRow(h, client.client_id)).toMatchObject({
        redirectUris: [PRODUCTION_CALLBACK, connections, other],
      });
    });

    it("refuses the whole list when the second origin fails, and creates nothing", async () => {
      const h = await createHub();
      // The first origin serves the file; the second does not.
      let fetches = 0;
      const fileRequests = await stubProviders(h, () =>
        fetches++ === 0
          ? jsonResponse({ repository: REPOSITORY_ID })
          : new Response("Not Found", { status: 404 }),
      );

      const response = await postHubClient(h, await signToken(h), {
        redirect_uris: [PRODUCTION_CALLBACK, "https://other.example.com/auth/hub/callback"],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(
        refusalBody("invalid_redirect_uri", { reason: "verification_file_missing" }),
      );
      expect(fileRequests.map((request) => request.url)).toEqual([
        `${PRODUCTION_HOST}/samebase-verification.json`,
        "https://other.example.com/samebase-verification.json",
      ]);
      expect(h.rows().clients).toEqual([]);
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
        "a 201",
        () => jsonResponse({ repository: REPOSITORY_ID }, 201),
        "verification_file_missing",
      ],
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
      ["an empty body", () => new Response(null), "verification_file_invalid"],
      [
        "a name instead of the id",
        () => jsonResponse({ repository: "octo-org/octo-repo" }),
        "verification_file_invalid",
      ],
      ["a fraction", () => jsonResponse({ repository: 74.5 }), "verification_file_invalid"],
      ["a leading zero", () => jsonResponse({ repository: "074" }), "verification_file_invalid"],
      ["a list", () => jsonResponse([{ repository: REPOSITORY_ID }]), "verification_file_invalid"],
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
      const h = await createHub();
      await stubProviders(h, host);

      const response = await postHubClient(h, await signToken(h));
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(JSON.parse(text)).toEqual(refusalBody("invalid_redirect_uri", { reason }));
      expect(text).not.toContain("999");
      expect(registrationEvents(h)).toEqual([]);
      expect(h.rows().clients).toEqual([]);
    });

    it.each([
      ["a number", () => jsonResponse({ repository: Number(REPOSITORY_ID) })],
      ["more members and no Content-Type", () => new Response(`{"repository":74,"note":"hi"}`)],
      ["a streamed body", () => streamedResponse(['{"repos', `itory":"${REPOSITORY_ID}"}`])],
      [
        "a body of exactly 4 KiB",
        () => {
          const head = `{"repository":"${REPOSITORY_ID}","pad":"`;
          return new Response(`${head}${"x".repeat(4_096 - head.length - 2)}"}`);
        },
      ],
    ])("accepts the id as %s", async (_, host) => {
      const h = await createHub();
      await stubProviders(h, host);

      const response = await postHubClient(h, await signToken(h));

      expect(response.status).toBe(201);
    });
  });

  describe("the blocks", () => {
    it.each([
      ["repository", REPOSITORY_ID],
      ["owner", OWNER_ID],
    ] as const)("refuses a blocked %s before it fetches the file", async (kind, githubId) => {
      const h = await createHub();
      setBlock(h, { action: "block", kind, githubId });
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h));

      await expectInsufficientScope(response, "blocked");
      expect(fileRequests).toEqual([]);
      expect(h.rows().rateLimits).toEqual([]);
      expect(registrationEvents(h)).toEqual([]);
    });

    it.each([
      ["repository", REPOSITORY_ID],
      ["owner", OWNER_ID],
    ] as const)(
      "refuses a %s blocked while the file was fetched, and creates no client",
      async (kind, githubId) => {
        const h = await createHub();
        await stubProviders(h, () => {
          setBlock(h, { action: "block", kind, githubId });
          return jsonResponse({ repository: REPOSITORY_ID });
        });

        const response = await postHubClient(h, await signToken(h));

        await expectInsufficientScope(response, "blocked");
        expect(registrationEvents(h)).toEqual([]);
        expect(h.rows().apps).toEqual([]);
      },
    );

    it("blocking an owner stops each of its repositories, and unblocking restores only those with no other block", async () => {
      const h = await createHub();
      const first = await createClient(h);
      const second = await createClient(h, { repository_id: "75", repository: "octo-org/two" });
      const other = await createClient(h, {
        repository_id: "76",
        repository_owner_id: "66",
        repository: "someone/else",
      });

      setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });
      setBlock(h, { action: "block", kind: "repository", githubId: "75" });

      expect(await readOwnRecord(h, first)).toBe(403);
      expect(await readOwnRecord(h, second)).toBe(403);
      expect(await readOwnRecord(h, other)).toBe(200);
      const signIn = await h.fetchBroker(
        `${h.issuer}/authorize?client_id=${first.client_id}&redirect_uri=${encodeURIComponent(PRODUCTION_CALLBACK)}&response_type=code&scope=openid&code_challenge=${"a".repeat(43)}&code_challenge_method=S256`,
      );
      expect(signIn.status).toBe(403);
      expect(signIn.headers.get("location")).toBeNull();

      setBlock(h, { action: "unblock", kind: "owner", githubId: OWNER_ID });

      expect(await readOwnRecord(h, first)).toBe(200);
      expect(await readOwnRecord(h, second)).toBe(403);
    });
  });

  describe("the limits", () => {
    it.each([
      ["repository", { scope: "repository", githubId: REPOSITORY_ID, count: 30 }],
      ["owner", { scope: "owner", githubId: OWNER_ID, count: 100 }],
      ["new_owners", { scope: "new_owners", githubId: "", count: 50 }],
    ] as const)("limits the window %s, and fetches nothing", async (window, row) => {
      const h = await createHub();
      seedWindow(h, row);
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h));

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBeNull();
      expect(await response.json()).toEqual(refusalBody("rate_limited", { window }));
      expect(fileRequests).toEqual([]);
    });

    it("counts each request against the repository and the owner, and a new owner only once it registers", async () => {
      const h = await createHub();
      let host = () => new Response("Not Found", { status: 404 });
      await stubProviders(h, () => host());
      const token = await signToken(h);

      await postHubClient(h, token);
      await postHubClient(h, token);

      // A failed host check uses no new-owner allowance.
      expect(h.rows().rateLimits).toEqual([
        expect.objectContaining({ scope: "repository", githubId: REPOSITORY_ID, count: 2 }),
        expect.objectContaining({ scope: "owner", githubId: OWNER_ID, count: 2 }),
      ]);

      host = () => jsonResponse({ repository: REPOSITORY_ID });
      expect((await postHubClient(h, token)).status).toBe(201);
      expect((await postHubClient(h, await signToken(h, pullRequestClaims))).status).toBe(201);

      expect(h.rows().rateLimits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "owner", githubId: OWNER_ID, count: 4 }),
          expect.objectContaining({ scope: "new_owners", count: 1 }),
        ]),
      );
    });

    it("refuses a new owner when other new owners filled the window during its host check", async () => {
      const h = await createHub();
      seedWindow(h, { scope: "new_owners", githubId: "", count: 49 });
      await stubProviders(h, () => {
        // Another new owner registers while this request fetches its verification file.
        changeWindows(h, (row) => (row.scope === "new_owners" ? 50 : row.count));
        return jsonResponse({ repository: REPOSITORY_ID });
      });

      const response = await postHubClient(h, await signToken(h));

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual(refusalBody("rate_limited", { window: "new_owners" }));
      expect(h.rows().clients).toEqual([]);
    });

    it("does not count an owner with a registration as new, and still limits the others", async () => {
      const h = await createHub();
      await createClient(h);
      // The owner's window has ended, so only its registration says that it is not new.
      changeWindows(h, (row) =>
        row.scope === "owner" ? null : row.scope === "new_owners" ? 50 : row.count,
      );
      await stubProviders(h);

      const known = await postHubClient(h, await signToken(h));
      const stranger = await postHubClient(
        h,
        await signToken(h, { repository_id: "80", repository_owner_id: "90" }),
      );

      expect(known.status).toBe(201);
      expect(stranger.status).toBe(429);
      expect(await stranger.json()).toEqual(refusalBody("rate_limited", { window: "new_owners" }));
    });

    it("starts a new window after an hour", async () => {
      const h = await createHub();
      seedWindow(h, { scope: "repository", githubId: REPOSITORY_ID, count: 30 });
      const token = await signToken(h, {}, { expiresInSeconds: 7_200 });
      h.clock.advance(60 * 60 * 1_000 + 1);
      await stubProviders(h);

      const response = await postHubClient(h, token);

      expect(response.status).toBe(201);
      expect(h.rows().rateLimits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ scope: "repository", githubId: REPOSITORY_ID, count: 1 }),
        ]),
      );
    });

    it("keeps a window full until exactly an hour has passed", async () => {
      const h = await createHub();
      seedWindow(h, { scope: "repository", githubId: REPOSITORY_ID, count: 30 });
      const token = await signToken(h, {}, { expiresInSeconds: 7_200 });
      await stubProviders(h);

      h.clock.advance(60 * 60 * 1_000 - 1);
      expect((await postHubClient(h, token)).status).toBe(429);
      h.clock.advance(1);
      expect((await postHubClient(h, token)).status).toBe(201);
    });
  });
});

describe("the initial access token", () => {
  it("comes with a production client and its row, and never with a preview", async () => {
    const h = await createHub();
    const production = await createClient(h);
    await stubProviders(h);

    const previewResponse = await postHubClient(h, await signToken(h, pullRequestClaims));
    const preview: unknown = await previewResponse.json();

    expect(previewResponse.status).toBe(201);
    expect(preview).not.toHaveProperty("initial_access_token");
    expect(preview).not.toHaveProperty("repository");
    expect(h.rows().initialAccessTokens).toEqual([
      {
        tokenHash: await sha256Hex(production.initial_access_token ?? ""),
        githubRepositoryDatabaseId: REPOSITORY_ID,
        githubOwnerId: OWNER_ID,
        githubRepository: "octo-org/octo-repo",
        app: "my-app",
        issuedAt: EPOCH,
      },
    ]);
  });

  it("is replaced by the next production client, and the first one stops", async () => {
    const h = await createHub();
    const first = await createInitialAccessToken(h);
    const second = await createInitialAccessToken(h);
    await stubProviders(h);

    const refused = await postHubClient(h, first, { redirect_uris: [LOOPBACK_CALLBACK] });

    expect(first).not.toBe(second);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual(INVALID_TOKEN);
    expect(h.rows().initialAccessTokens).toHaveLength(1);
    expect((await createDevelopmentClient(h, second)).client_id).toMatch(/^cl_/);
  });

  it("stops at the first GitHub run under another owner, also of a preview", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    await stubProviders(h);

    const sameOwner = await postHubClient(h, await signToken(h, pullRequestClaims));
    expect(sameOwner.status).toBe(201);
    expect(h.rows().initialAccessTokens).toHaveLength(1);
    // Another owner's token must be newer than the newest accepted one, by `iat` in seconds.
    const sameSecond = await postHubClient(
      h,
      await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" }),
    );
    await expectInsufficientScope(sameSecond, "stale_proof");
    expect(h.rows().initialAccessTokens).toHaveLength(1);
    h.clock.advance(1_000);
    const transferred = await postHubClient(
      h,
      await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" }),
    );

    expect(transferred.status).toBe(201);
    expect(h.rows().initialAccessTokens).toEqual([]);
    expect((await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] })).status).toBe(
      401,
    );
  });
});

describe("POST /register with the initial access token", () => {
  it("registers a development client on a loopback address without a fetch", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    const fileRequests = await stubProviders(h);
    const fetchedBefore = h.fetch.requests.length;

    const response = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });

    expect(response.status).toBe(201);
    expect(h.fetch.requests).toHaveLength(fetchedBefore);
    expect(fileRequests).toEqual([]);
    const body: unknown = await response.json();
    const client = decodeNewClient(body);
    expect(body).toEqual({
      client_id: expect.stringMatching(/^cl_/),
      client_id_issued_at: EPOCH / 1_000,
      client_secret_expires_at: 0,
      registration_client_uri: `${ISSUER}/register/${client.client_id}`,
      redirect_uris: [LOOPBACK_CALLBACK],
      client_name: "development",
      software_id: `gh-${REPOSITORY_ID}/my-app`,
      software_version: "abc123",
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      application_type: "web",
      subject_type: "public",
      id_token_signed_response_alg: "RS256",
      connectors: ["fake"],
      client_secret: expect.any(String),
      registration_access_token: expect.any(String),
      issuer: ISSUER,
      terms: "https://hub.example.com/terms",
    });
    const clientId = client.client_id;
    expect(clientRow(h, clientId)).toMatchObject({
      appId: APP_ID,
      redirectUris: [LOOPBACK_CALLBACK],
      deploymentType: "development",
      clientName: "development",
      removeAt: EPOCH + 14 * 24 * 60 * 60 * 1_000,
      app: "my-app",
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: "octo-org/octo-repo",
        githubOwnerId: OWNER_ID,
        issuedAt: EPOCH,
      },
    });
    expect(registrationEvents(h).find((row) => row.clientId === clientId)).toEqual({
      kind: "registration",
      clientId,
      githubRepositoryDatabaseId: REPOSITORY_ID,
      githubOwnerId: OWNER_ID,
      at: EPOCH,
    });
  });

  it.each(["http://[::1]:3211/auth/hub/callback", "http://localhost:5173/callback"])(
    "accepts the loopback address %s",
    async (redirectUri) => {
      const h = await createHub();
      const token = await createInitialAccessToken(h);
      await stubProviders(h);

      expect((await postHubClient(h, token, { redirect_uris: [redirectUri] })).status).toBe(201);
    },
  );

  it("enrolls in what the policy allows a development client, which can differ from production's", async () => {
    const h = await createHub({
      policy: (registration) =>
        testPolicy({
          connectors: registration.deploymentType === "development" ? ["fake"] : ["fake", "other"],
        }),
    });
    const production = await createClient(h);
    const token = production.initial_access_token ?? "";
    await stubProviders(h);

    const refused = await postHubClient(h, token, {
      redirect_uris: [LOOPBACK_CALLBACK],
      connectors: ["fake", "other"],
    });
    const accepted = await postHubClient(h, token, {
      redirect_uris: [LOOPBACK_CALLBACK],
      connectors: ["fake"],
    });

    expect(await refused.json()).toEqual(
      refusalBody("invalid_client_metadata", {
        reason: "invalid_connectors",
        allowed: ["fake"],
      }),
    );
    expect(accepted.status).toBe(201);
  });

  it("evicts the oldest preview or development client at that budget's cap, never a production one", async () => {
    const h = await createHub();
    const production = await createClient(h);
    const token = production.initial_access_token ?? "";
    for (let index = 0; index < 30; index += 1) {
      seedClient(h, {
        tenantId: `gh-${REPOSITORY_ID}`,
        appId: APP_ID,
        deploymentType: "preview",
        clientId: `cl_preview_${index}`,
        clientName: `pr-${index + 1}`,
        now: EPOCH + 1_000 + index * 1_000,
      });
    }
    h.clock.set(EPOCH + 100_000);

    const development = await createDevelopmentClient(h, token);

    const clients = h.rows().clients.filter((client) => client.deploymentType !== "production");
    expect(clients).toHaveLength(30);
    expect(clients.map((client) => client.clientId)).not.toContain("cl_preview_0");
    expect(clients.map((client) => client.clientId)).toContain(development.client_id);
    expect(clientRow(h, production.client_id)).toMatchObject({ deploymentType: "production" });
  });

  it("needs the verification file for an https address", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    const missing = await stubProviders(h, () => new Response("Not Found", { status: 404 }));

    const refused = await postHubClient(h, token, {
      redirect_uris: ["https://calm-cow-456.convex.site/auth/hub/callback"],
    });

    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual(
      refusalBody("invalid_redirect_uri", { reason: "verification_file_missing" }),
    );
    expect(missing).toHaveLength(1);
    const served = await stubProviders(h);
    const accepted = await postHubClient(h, token, {
      redirect_uris: ["https://calm-cow-456.convex.site/auth/hub/callback"],
    });
    expect(accepted.status).toBe(201);
    expect(served.map((request) => [request.url, request.redirect])).toEqual([
      ["https://calm-cow-456.convex.site/samebase-verification.json", "manual"],
    ]);
  });

  it("refuses another app of the repository, in either form of software_id", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    await stubProviders(h);

    for (const softwareId of ["other-app", `gh-${REPOSITORY_ID}/other-app`]) {
      const response = await postHubClient(h, token, {
        software_id: softwareId,
        redirect_uris: [LOOPBACK_CALLBACK],
      });
      await expectInsufficientScope(response, "app_mismatch");
    }
    const full = await postHubClient(h, token, {
      software_id: `gh-${REPOSITORY_ID}/my-app`,
      redirect_uris: [LOOPBACK_CALLBACK],
    });
    expect(full.status).toBe(201);
  });

  it("refuses a token whose row was deleted while the file was fetched", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    await stubProviders(h, () => {
      deleteInitialAccessTokens(h);
      return jsonResponse({ repository: REPOSITORY_ID });
    });

    const response = await postHubClient(h, token, {
      redirect_uris: ["https://calm-cow-456.convex.site/auth/hub/callback"],
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(INVALID_TOKEN);
    expect(h.rows().clients.map((row) => row.clientName)).toEqual(["prod"]);
    expect(registrationEvents(h)).toHaveLength(1);
  });

  it("passes no owner: the rule checks the tenant's recorded owner and keeps it", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    // Another app of the tenant records owner 66, as after a transfer whose run made no client of
    // `my-app`; the token's row still names owner 65.
    seedClient(h, {
      tenantId: `gh-${REPOSITORY_ID}`,
      ownerId: "66",
      appId: `gh-${REPOSITORY_ID}-other`,
      deploymentType: "production",
      clientId: "cl_other",
      clientName: "prod",
      now: h.clock.now(),
    });
    await stubProviders(h);

    setBlock(h, { action: "block", kind: "owner", githubId: "66" });
    const refused = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });
    await expectInsufficientScope(refused, "suspended");

    // A block of the token's own owner refuses as `blocked`: "refuses a blocked owner" below.
    setBlock(h, { action: "unblock", kind: "owner", githubId: "66" });
    const accepted = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });
    expect(accepted.status).toBe(201);

    // The development client left the recorded owner 66 in place.
    expect(h.rows().tenants).toEqual([expect.objectContaining({ ownerId: "66" })]);
  });

  it.each([
    ["repository", REPOSITORY_ID],
    ["owner", OWNER_ID],
  ] as const)("refuses a blocked %s", async (kind, githubId) => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    setBlock(h, { action: "block", kind, githubId });
    const before = h.rows().rateLimits;
    await stubProviders(h);

    const response = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });

    await expectInsufficientScope(response, "blocked");
    expect(h.rows().rateLimits).toEqual(before);
  });

  it("refuses it while the policy pauses the app", async () => {
    let paused = false;
    const h = await createHub({ policy: () => testPolicy({ paused }) });
    const token = await createInitialAccessToken(h);
    paused = true;
    await stubProviders(h);

    const response = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });

    await expectInsufficientScope(response, "paused");
  });

  it.each([
    ["repository", { scope: "repository", githubId: REPOSITORY_ID, count: 30 }],
    ["owner", { scope: "owner", githubId: OWNER_ID, count: 100 }],
  ] as const)("is limited in the %s window", async (window, row) => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    changeWindows(h, () => null);
    seedWindow(h, { scope: row.scope, githubId: row.githubId, count: row.count });
    await stubProviders(h);

    const response = await postHubClient(h, token, { redirect_uris: [LOOPBACK_CALLBACK] });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual(refusalBody("rate_limited", { window }));
  });

  it("counts in the repository and owner windows, and not in the new-owners window", async () => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    // A new-owners window that is full, and an owner whose own window has ended.
    changeWindows(h, (row) =>
      row.scope === "owner" ? null : row.scope === "new_owners" ? 50 : row.count,
    );
    await stubProviders(h);

    await createDevelopmentClient(h, token);

    expect(h.rows().rateLimits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "repository", githubId: REPOSITORY_ID, count: 2 }),
        expect.objectContaining({ scope: "owner", githubId: OWNER_ID, count: 1 }),
        expect.objectContaining({ scope: "new_owners", count: 50 }),
      ]),
    );
  });

  it("never tries a JWT that fails verification as a token, and refuses other shapes", async () => {
    const h = await createHub();
    await createInitialAccessToken(h);
    const badJwt = await signToken(h, {}, { foreign: true });
    // A row whose hash is the bad JWT's: only the opaque path would find it.
    insertInitialAccessToken(h, { tokenHash: await sha256Hex(badJwt), app: "my-app" });
    await stubProviders(h);

    for (const bearer of [badJwt, "one.dot", "four.parts.in.it"]) {
      const response = await postHubClient(h, bearer, { redirect_uris: [LOOPBACK_CALLBACK] });
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
      expect(await response.json()).toEqual(INVALID_TOKEN);
    }
    expect(h.rows().clients.map((row) => row.clientName)).toEqual(["prod"]);
    expect(registrationEvents(h)).toHaveLength(1);
  });

  it("answers 401 for a token that no row has", async () => {
    const h = await createHub();
    await stubProviders(h);

    const response = await postHubClient(h, "unknown-token", {
      redirect_uris: [LOOPBACK_CALLBACK],
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(INVALID_TOKEN);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
    expect(h.rows().rateLimits).toEqual([]);
  });
});

// Rules that mutation testing (StrykerJS) found no test for in the source: each test fails when the
// rule is weakened, such as a timestamp that stops advancing or an hour that becomes a second.
describe("registration rules at their edges", () => {
  it("keeps the newest accepted proof's time when an older proof of the current owner arrives late", async () => {
    const h = await createHub();
    const first = await signToken(h, { repository_owner_id: "65" });
    h.clock.set(EPOCH + 10_000);
    const olderOfNewOwner = await signToken(h, { repository_owner_id: "66" });
    h.clock.set(EPOCH + 15_000);
    const retainedOfOldOwner = await signToken(h, { repository_owner_id: "65" });
    h.clock.set(EPOCH + 20_000);
    const newestOfNewOwner = await signToken(h, { repository_owner_id: "66" });
    h.clock.set(EPOCH + 21_000);
    await stubProviders(h);

    expect((await postHubClient(h, first)).status).toBe(201);
    expect((await postHubClient(h, newestOfNewOwner)).status).toBe(201);
    // Accepted, but older than the newest: the recorded time must not move back to it.
    expect((await postHubClient(h, olderOfNewOwner)).status).toBe(201);
    // Newer than the late proof, older than the newest: the old owner cannot come back with it.
    const refused = await postHubClient(h, retainedOfOldOwner);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ reason: "stale_proof" });
  });

  it("replaces only the initial access token of the app that registered", async () => {
    const h = await createHub();
    await stubProviders(h);
    expect((await postHubClient(h, await signToken(h), { software_id: "app-a" })).status).toBe(201);
    expect((await postHubClient(h, await signToken(h), { software_id: "app-b" })).status).toBe(201);
    // Known tokens for both apps, so the test can present app B's old one.
    const oldTokenB = "initial-access-token-of-app-b";
    deleteInitialAccessTokens(h);
    insertInitialAccessToken(h, {
      tokenHash: await sha256Hex("initial-access-token-of-app-a"),
      app: "app-a",
    });
    insertInitialAccessToken(h, { tokenHash: await sha256Hex(oldTokenB), app: "app-b" });

    expect((await postHubClient(h, await signToken(h), { software_id: "app-b" })).status).toBe(201);

    const refused = await postHubClient(h, oldTokenB, {
      software_id: "app-b",
      redirect_uris: [LOOPBACK_CALLBACK],
    });
    expect(refused.status).toBe(401);
    expect(
      h
        .rows()
        .initialAccessTokens.map((row) => row.app)
        .sort(),
    ).toEqual(["app-a", "app-b"]);
  });

  it("keeps a full hourly window full a second later", async () => {
    const h = await createHub();
    seedWindow(h, { scope: "repository", githubId: REPOSITORY_ID, count: 30 }, EPOCH);
    h.clock.set(EPOCH + 1_001);
    await stubProviders(h);

    expect((await postHubClient(h, await signToken(h))).status).toBe(429);
  });

  it.each([
    "http://unproved.example.test/auth/callback",
    "https://localhost/auth/callback",
    "https://name@deployment.example.test/auth/callback",
    "https://:secret@deployment.example.test/auth/callback",
  ])("refuses a development client whose return address is %s", async (redirectUri) => {
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    await stubProviders(h);

    const response = await postHubClient(h, token, { redirect_uris: [redirectUri] });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(refusalBody("invalid_redirect_uri"));
  });

  it("tells the policy that a development client was proven by the initial access token", async () => {
    let pauseDevelopment = false;
    const h = await createHub({
      policy: (registration) =>
        testPolicy({ paused: pauseDevelopment && registration.proof === "initial-access-token" }),
    });
    const development = await createDevelopmentClient(h, await createInitialAccessToken(h));
    pauseDevelopment = true;
    const params = new URLSearchParams({
      client_id: development.client_id,
      redirect_uri: LOOPBACK_CALLBACK,
      response_type: "code",
      scope: "openid",
      connector: "fake",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
    });

    expect((await h.fetchBroker(`${ISSUER}/authorize?${params}`)).status).toBe(503);
  });
});
