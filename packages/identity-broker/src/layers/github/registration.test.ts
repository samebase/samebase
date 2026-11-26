// The port of the registration parts of registration.test.ts of the Convex broker: RFC 7592 client
// management (read, which renews; delete; no update), the lease of preview and development clients,
// and the blocks at renewal. The source made its clients with the component's low-level
// `registration.register`, which the port has no command for, so these tests register through
// `POST /register`, or seed the rows.
import { Schema } from "effect";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { sha256Hex } from "../../core/subject.ts";
import {
  APP_ID,
  createClient,
  createDevelopmentClient,
  createGithubBroker,
  createInitialAccessToken,
  EPOCH,
  OWNER_ID,
  postBrokerClient,
  pullRequestClaims,
  readNewClient,
  readOwnRecord,
  REPOSITORY_ID,
  seedClient,
  setBlock,
  signIn,
  signToken,
  skipSignInPage,
  stubProviders,
  PRODUCTION_CALLBACK,
  type GithubBroker,
  type NewClient,
} from "./testing/broker.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const LEASE_MS = 14 * 24 * 60 * 60 * 1000;

const clientRow = (h: GithubBroker, clientId: string) =>
  h.rows().clients.find((row) => row.clientId === clientId);

/** A preview client of the pull request `number`, which must be created. */
async function createPreview(h: GithubBroker, number = 12): Promise<NewClient> {
  await stubProviders(h);
  const response = await postBrokerClient(
    h,
    await signToken(h, { event_name: "pull_request", ref: `refs/pull/${number}/merge` }),
  );
  expect(response.status).toBe(201);
  return await readNewClient(response);
}

const configuration = (client: NewClient, token: string, method: string) => ({
  url: client.registration_client_uri,
  init: { method, headers: { Authorization: `Bearer ${token}` } },
});

describe("RFC 7592 client management", () => {
  test("a read answers without the secret, and only with the client's own token", async () => {
    const h = await createGithubBroker();
    const client = await createPreview(h);
    const other = await createPreview(h, 13);
    expect(client.registration_client_uri).toBe(`${h.issuer}/register/${client.client_id}`);
    const own = configuration(client, client.registration_access_token, "GET");
    const response = await h.fetchBroker(own.url, own.init);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      client_id: client.client_id,
      client_id_issued_at: EPOCH / 1_000,
      client_secret_expires_at: 0,
      registration_access_token: client.registration_access_token,
      registration_client_uri: client.registration_client_uri,
      redirect_uris: [PRODUCTION_CALLBACK],
      client_name: "pr-12",
      software_id: `gh-${REPOSITORY_ID}/my-app`,
      software_version: "abc123",
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      application_type: "web",
      subject_type: "public",
      id_token_signed_response_alg: "RS256",
      connectors: ["fake"],
    });
    // The store keeps only the hashes of the secret and the token.
    const row = clientRow(h, client.client_id);
    expect(row?.secretHash).toBe(await sha256Hex(client.client_secret));
    expect(row?.github?.registrationTokenHash).toBe(
      await sha256Hex(client.registration_access_token),
    );
    const wrong = configuration(client, other.registration_access_token, "GET");
    const refused = await h.fetchBroker(wrong.url, wrong.init);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
    expect(await refused.json()).toEqual({
      error: "invalid_token",
      error_description: "The token is invalid.",
    });
  });

  test.each([
    ["GET", "no Authorization header", null],
    ["GET", "Basic credentials", "Basic dXNlcjpwYXNz"],
    ["GET", "the word Bearer alone", "Bearer"],
    ["DELETE", "no Authorization header", null],
    ["DELETE", "Basic credentials", "Basic dXNlcjpwYXNz"],
    ["DELETE", "the word Bearer alone", "Bearer"],
  ])(
    "a %s with %s answers 401 with the realm challenge and no body (RFC 6750 section 3)",
    async (method, _, authorization) => {
      const h = await createGithubBroker();
      const client = await createPreview(h);
      const response = await h.fetchBroker(client.registration_client_uri, {
        method,
        headers: authorization === null ? {} : { Authorization: authorization },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="register"');
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).toBe("");
      expect(clientRow(h, client.client_id)).toBeDefined();
    },
  );

  test.each(["GET", "DELETE"])("a %s without a client id answers invalid_token", async (method) => {
    const h = await createGithubBroker();
    const client = await createPreview(h);
    const response = await h.fetchBroker(`${h.issuer}/register/`, {
      method,
      headers: { Authorization: `Bearer ${client.registration_access_token}` },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
    expect(clientRow(h, client.client_id)).toBeDefined();
  });

  test("a read renews a preview client and never dates a production client", async () => {
    const h = await createGithubBroker();
    const preview = await createPreview(h);
    const production = await createClient(h);
    expect(clientRow(h, preview.client_id)?.removeAt).toBe(EPOCH + LEASE_MS);
    h.clock.advance(LEASE_MS / 2);
    for (const client of [preview, production]) {
      const read = configuration(client, client.registration_access_token, "GET");
      expect((await h.fetchBroker(read.url, read.init)).status).toBe(200);
    }
    expect(clientRow(h, preview.client_id)).toMatchObject({
      removeAt: h.clock.now() + LEASE_MS,
      github: { renewedAt: h.clock.now() },
    });
    expect(clientRow(h, production.client_id)).toMatchObject({
      github: { renewedAt: h.clock.now() },
    });
    expect(clientRow(h, production.client_id)?.removeAt).toBeUndefined();
  });

  test("a read changes no metadata and no credential, and writes the card from the allow-list of its step", async () => {
    const h = await createGithubBroker();
    const client = await createPreview(h);
    const before = clientRow(h, client.client_id);
    h.clock.advance(1_000);
    expect(await readOwnRecord(h, client)).toBe(200);
    const after = clientRow(h, client.client_id);
    expect(before?.github).toBeDefined();
    expect(after).toEqual({
      ...before,
      removeAt: EPOCH + 1_000 + LEASE_MS,
      github: { ...before?.github, renewedAt: EPOCH + 1_000 },
    });
    // The repository leaves the allow-list: the next read writes a card that offers nothing.
    h.setAllowList([]);
    expect(await readOwnRecord(h, client)).toBe(200);
    expect(clientRow(h, client.client_id)?.connectors).toEqual([]);
  });

  test("a production client cannot delete itself", async () => {
    const h = await createGithubBroker();
    const client = await createClient(h);
    const own = configuration(client, client.registration_access_token, "DELETE");
    const response = await h.fetchBroker(own.url, own.init);
    expect(response.status).toBe(403);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="insufficient_scope"');
    expect(await response.json()).toEqual({
      error: "insufficient_scope",
      error_description: "A production client cannot delete itself.",
    });
    expect(clientRow(h, client.client_id)).toBeDefined();
  });

  test.each([
    ["the client's token", true],
    ["no token", false],
  ])("an update with %s answers 405 and changes nothing", async (_, withToken) => {
    const h = await createGithubBroker();
    const client = await createClient(h);
    const before = h.rows();
    const response = await h.fetchBroker(client.registration_client_uri, {
      method: "PUT",
      headers: {
        ...(withToken ? { Authorization: `Bearer ${client.registration_access_token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_id: client.client_id, redirect_uris: [PRODUCTION_CALLBACK] }),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, DELETE");
    expect(await response.text()).toBe("");
    expect(h.rows()).toEqual(before);
  });

  test("a delete removes only the client that asks, also while stopped, and a gone client answers 401", async () => {
    const h = await createGithubBroker();
    const client = await createPreview(h);
    const other = await createPreview(h, 13);
    setBlock(h, { action: "block", kind: "repository", githubId: REPOSITORY_ID });
    const forged = configuration(client, other.registration_access_token, "DELETE");
    expect((await h.fetchBroker(forged.url, forged.init)).status).toBe(401);
    const own = configuration(client, client.registration_access_token, "DELETE");
    const deleted = await h.fetchBroker(own.url, own.init);
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
    expect(clientRow(h, client.client_id)).toBeUndefined();
    expect(clientRow(h, other.client_id)).toBeDefined();
    const read = configuration(client, client.registration_access_token, "GET");
    for (const gone of [own, read]) {
      const response = await h.fetchBroker(gone.url, gone.init);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
      expect(await response.json()).toMatchObject({ error: "invalid_token" });
    }
  });

  test("a development client deletes itself too", async () => {
    const h = await createGithubBroker();
    const development = await createDevelopmentClient(h, await createInitialAccessToken(h));
    const own = configuration(development, development.registration_access_token, "DELETE");
    expect((await h.fetchBroker(own.url, own.init)).status).toBe(204);
    expect(clientRow(h, development.client_id)).toBeUndefined();
  });

  test("/userinfo answers the access token of a stopped client and refuses a deleted client's (RFC 7592 section 2.3)", async () => {
    const h = await createGithubBroker();
    skipSignInPage(h);
    const client = await createPreview(h);
    const tokens = await signIn(h, client, PRODUCTION_CALLBACK);
    expect(tokens.status).toBe(200);
    const { access_token: accessToken } = Schema.decodeUnknownSync(
      Schema.Struct({ access_token: Schema.String }),
    )(await tokens.json());
    const userinfo = async () =>
      await h.fetchBroker(`${h.issuer}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    const signedIn = await userinfo();
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).not.toHaveProperty("client_id");
    setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });
    expect((await userinfo()).status).toBe(200);
    const own = configuration(client, client.registration_access_token, "DELETE");
    expect((await h.fetchBroker(own.url, own.init)).status).toBe(204);
    const deleted = await userinfo();
    expect(deleted.status).toBe(401);
    expect(deleted.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
    expect(await deleted.json()).toMatchObject({ error: "invalid_token" });
  });
});

describe("the lease", () => {
  test("a development client gets a removal date, renews it, and cleanup deletes it after the date", async () => {
    const h = await createGithubBroker();
    const development = await createDevelopmentClient(h, await createInitialAccessToken(h));
    expect(clientRow(h, development.client_id)?.removeAt).toBe(EPOCH + LEASE_MS);

    h.clock.advance(1_000);
    expect(await readOwnRecord(h, development)).toBe(200);
    expect(clientRow(h, development.client_id)?.removeAt).toBe(h.clock.now() + LEASE_MS);

    const counts = h.memory.run("lifecycle.cleanup", {
      now: h.clock.now() + LEASE_MS + 1,
      signInRetentionMs: 1,
    });
    expect(counts.clients).toBe(1);
    expect(clientRow(h, development.client_id)).toBeUndefined();
    // The production client of the token has no removal date, and stays.
    expect(h.rows().clients.map((row) => row.github?.clientName)).toEqual(["prod"]);
  });

  test("a preview app over its cap loses the client renewed longest ago", async () => {
    const h = await createGithubBroker();
    const first = await createPreview(h, 1);
    h.clock.advance(1_000);
    const second = await createPreview(h, 2);
    for (let index = 2; index < 30; index += 1) {
      seedClient(h, {
        repositoryId: REPOSITORY_ID,
        appId: APP_ID,
        deploymentType: "preview",
        clientId: `cl_seeded_${index}`,
        clientName: `pr-${index + 1}`,
        now: h.clock.now() + index * 1_000,
      });
    }
    h.clock.advance(60_000);
    // A deploy of the oldest client keeps it, so the next oldest goes.
    expect(await readOwnRecord(h, first)).toBe(200);
    h.clock.advance(1_000);
    await createPreview(h, 99);
    expect(clientRow(h, second.client_id)).toBeUndefined();
    expect(clientRow(h, first.client_id)).toBeDefined();
    expect(h.rows().clients).toHaveLength(30);
  });
});

describe("the blocks at renewal", () => {
  test.each([
    ["repository", REPOSITORY_ID],
    ["owner", OWNER_ID],
  ] as const)(
    "a renewal while the %s is blocked answers 403, and the unblock restores it",
    async (kind, githubId) => {
      const h = await createGithubBroker();
      const development = await createDevelopmentClient(h, await createInitialAccessToken(h));
      const before = clientRow(h, development.client_id);
      setBlock(h, { action: "block", kind, githubId });
      h.clock.advance(1_000);

      const response = await h.fetchBroker(development.registration_client_uri, {
        headers: { Authorization: `Bearer ${development.registration_access_token}` },
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="insufficient_scope"');
      expect(await response.json()).toEqual({
        error: "insufficient_scope",
        error_description: "This client is suspended.",
      });
      expect(clientRow(h, development.client_id)).toEqual(before);
      setBlock(h, { action: "unblock", kind, githubId });
      expect(await readOwnRecord(h, development)).toBe(200);
    },
  );

  test("a block of the repository's recorded owner stops the renewal of a client that another owner registered", async () => {
    const h = await createGithubBroker();
    const preview = await createPreview(h);
    // The repository moves to owner 66 with a newer proof: the tenant records the new owner.
    h.clock.advance(1_000);
    await stubProviders(h);
    const moved = await postBrokerClient(
      h,
      await signToken(h, { ...pullRequestClaims, repository_owner_id: "66" }),
    );
    expect(moved.status).toBe(201);
    setBlock(h, { action: "block", kind: "owner", githubId: "66" });
    expect(await readOwnRecord(h, preview)).toBe(403);
    setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });
    setBlock(h, { action: "unblock", kind: "owner", githubId: "66" });
    expect(await readOwnRecord(h, preview)).toBe(200);
  });
});
