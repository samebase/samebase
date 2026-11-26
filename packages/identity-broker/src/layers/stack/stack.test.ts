// The stack layer's rules over HTTP: `POST /register` with one of the hub's named keys, the cards
// that a key writes, and the RFC 7592 read and delete with each client's own token.
import { Config, Redacted, Schema } from "effect";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { HubConfigInput } from "../../core/services.ts";
import { sha256Hex } from "../../core/subject.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  TEST_SERVICE,
  txnCookie,
} from "../../core/testing/harness.ts";
import { LEASE_MS } from "../../rules/clients.ts";
import { stack, type StackKey } from "./routes.ts";

const PRODUCTION_KEY = "production-key-value";
const PREVIEW_KEY = "preview-key-value";
const APP = "https://app-pr-1.example.workers.dev";
const CALLBACK = `${APP}/callback`;
/** The start of every test's clock. */
const EPOCH = 1_800_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

/** A key of the hub's settings with `value`. */
const keyOf = (value: string, permanent?: boolean): StackKey => ({
  key: Config.succeed(Redacted.make(value)),
  ...(permanent === undefined ? {} : { permanent }),
});

/** A key whose `Config` names a variable that no host sets. */
const absentKey: StackKey = { key: Config.Redacted("IDENTITY_BROKER_TEST_ABSENT_KEY") };

/**
 * The hub on the stack layer with `keys` (by default a production key that may make permanent
 * clients and a preview key), and the fake provider's connectors `fake` and `other`. The settings
 * object stays the test's, so a test can withdraw a key.
 */
async function createStackHub(
  keys: Record<string, StackKey> = {
    production: keyOf(PRODUCTION_KEY, true),
    preview: keyOf(PREVIEW_KEY),
  },
  config: Partial<HubConfigInput> = {},
) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({
    fetch,
    config: { connectors: [connector, { ...connector, name: "other", label: "Other" }], ...config },
    registration: stack({ keys }),
  });
  h.clock.set(EPOCH);
  return { ...h, keys, cards: () => h.memory.db.contents().clients };
}
type StackHub = Awaited<ReturnType<typeof createStackHub>>;

/** The body that IdentityHub.Client sends, with `overrides`. */
const body = (overrides: Record<string, unknown> = {}) => ({
  redirect_uris: [CALLBACK],
  software_id: "apps/example",
  software_version: "abc",
  client_name: "pr-1",
  deployment_type: "preview",
  connectors: ["fake"],
  token_endpoint_auth_method: "client_secret_post",
  ...overrides,
});

const register = (h: StackHub, bearer: string | null, overrides: Record<string, unknown> = {}) =>
  h.fetchBroker(`${h.issuer}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(body(overrides)),
  });

const NewClient = Schema.Struct({
  client_id: Schema.String,
  client_secret: Schema.String,
  registration_access_token: Schema.String,
  registration_client_uri: Schema.String,
});
const Refusal = Schema.Struct({ error: Schema.String });

/** A client of `bearer`, which the hub must register. */
async function registered(h: StackHub, bearer: string, overrides: Record<string, unknown> = {}) {
  const response = await register(h, bearer, overrides);
  expect(response.status).toBe(201);
  return Schema.decodeUnknownSync(NewClient)(await response.json());
}

/** An RFC 7592 request of `method` to `clientId`'s record with `token`. */
const manage = (h: StackHub, method: "GET" | "DELETE", clientId: string, token: string) =>
  h.fetchBroker(`${h.issuer}/register/${clientId}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });

/** `/authorize` for `clientId` with `fake` named, and the PKCE verifier of the request. */
async function authorize(h: StackHub, clientId: string) {
  const { verifier, challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "openid",
    state: "s",
    code_challenge: challenge,
    code_challenge_method: "S256",
    connector: "fake",
  }).toString();
  return { response: await h.fetchBroker(url), verifier };
}

/** `/authorize` for `clientId`: `provider` when the hub sends the user on. */
async function signIn(h: StackHub, clientId: string) {
  const { response } = await authorize(h, clientId);
  return response.status === 302 ? "provider" : `status ${response.status}`;
}

/** A sign-in of `clientId` up to the code at its return address, with the request's verifier. */
async function codeOf(h: StackHub, clientId: string) {
  const { response, verifier } = await authorize(h, clientId);
  const provider = new URL(response.headers.get("location") ?? "");
  const callback = new URL(provider.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", provider.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
  const code = new URL(back.headers.get("location") ?? "").searchParams.get("code");
  expect(code).not.toBeNull();
  return { code: code ?? "", verifier };
}

/** The token request of `client` for `code`. */
const redeem = (
  h: StackHub,
  client: typeof NewClient.Type,
  issued: { code: string; verifier: string },
) =>
  h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      client_secret: client.client_secret,
      code: issued.code,
      code_verifier: issued.verifier,
      redirect_uri: CALLBACK,
    }).toString(),
  });

describe("POST /register with a key", () => {
  test.each([
    ["a wrong key", "not-a-key"],
    ["no key", null],
  ])("refuses %s with 401 and writes nothing", async (_name, bearer) => {
    const h = await createStackHub();
    const response = await register(h, bearer);
    expect(response.status).toBe(401);
    expect(h.cards()).toEqual([]);
  });

  test("a hub without a configured key refuses every registration", async () => {
    for (const keys of [{}, { preview: absentKey }]) {
      const h = await createStackHub(keys);
      expect((await register(h, PREVIEW_KEY)).status).toBe(401);
      expect((await register(h, "")).status).toBe(401);
      expect(h.cards()).toEqual([]);
    }
  });

  test("a key whose configuration is missing is skipped, and the other key still works", async () => {
    const h = await createStackHub({ production: absentKey, preview: keyOf(PREVIEW_KEY) });
    expect((await register(h, PRODUCTION_KEY)).status).toBe(401);
    await registered(h, PREVIEW_KEY);
    expect(h.cards().map((card) => card.ref)).toEqual(["stack:preview:pr-1"]);
  });

  test("the matching key's name is the card's budget, gate and reference", async () => {
    const h = await createStackHub();
    const client = await registered(h, PREVIEW_KEY);
    expect(h.cards()).toEqual([
      {
        clientId: client.client_id,
        redirectUris: [CALLBACK],
        tokenEndpointAuthMethod: "client_secret_post",
        secretHash: await sha256Hex(client.client_secret),
        connectors: ["fake"],
        connections: [],
        gates: ["stack:preview"],
        confirm: false,
        budget: "stack:preview",
        ref: "stack:preview:pr-1",
        removeAt: EPOCH + LEASE_MS,
        createdAt: EPOCH,
        stack: {
          key: "preview",
          name: "pr-1",
          softwareId: "apps/example",
          softwareVersion: "abc",
          registrationTokenHash: await sha256Hex(client.registration_access_token),
          enrollment: ["fake"],
        },
      },
    ]);
    expect(client.registration_client_uri).toBe(`${h.issuer}/register/${client.client_id}`);
  });

  test("a key that may make permanent clients registers a production client with no removal date", async () => {
    const h = await createStackHub();
    await registered(h, PRODUCTION_KEY, { client_name: "prod", deployment_type: "production" });
    expect(h.cards().map((card) => [card.ref, card.budget, card.gates, card.removeAt])).toEqual([
      ["stack:production:prod", "stack:production", ["stack:production"], undefined],
    ]);
  });

  test("a key that may not make permanent clients cannot register a production client", async () => {
    const h = await createStackHub();
    const response = await register(h, PREVIEW_KEY, {
      client_name: "prod",
      deployment_type: "production",
    });
    expect(response.status).toBe(400);
    expect(Schema.decodeUnknownSync(Refusal)(await response.json()).error).toBe(
      "invalid_client_metadata",
    );
    expect(h.cards()).toEqual([]);
  });

  test("the name of the client, its connectors and its return addresses are checked", async () => {
    const h = await createStackHub();
    for (const overrides of [
      { client_name: undefined },
      { client_name: "a:b" },
      { connectors: ["unknown"] },
      { connectors: [] },
      { redirect_uris: ["http://app.example.com/callback"] },
      { software_id: "a".repeat(65) },
    ]) {
      expect((await register(h, PREVIEW_KEY, overrides)).status).toBe(400);
    }
    expect(h.cards()).toEqual([]);
  });

  test("two keys give two budgets", async () => {
    const h = await createStackHub();
    const preview = await registered(h, PREVIEW_KEY);
    const production = await registered(h, PRODUCTION_KEY, {
      client_name: "prod",
      deployment_type: "production",
    });
    expect(await signIn(h, preview.client_id)).toBe("provider");
    expect(await signIn(h, production.client_id)).toBe("provider");
    expect(
      h.memory.db
        .contents()
        .signInBudgets.map((row) => row.key)
        .sort(),
    ).toEqual(["stack:preview", "stack:production"]);
  });

  test("a stop of one key refuses the sign-ins of its clients and not of the other key's", async () => {
    const h = await createStackHub();
    const preview = await registered(h, PREVIEW_KEY);
    const production = await registered(h, PRODUCTION_KEY, {
      client_name: "prod",
      deployment_type: "production",
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await h.setStop("stack:preview", true);
    expect(await signIn(h, preview.client_id)).toBe("status 403");
    expect(await signIn(h, production.client_id)).toBe("provider");
  });

  test.each([
    ["removed from the hub's settings", undefined],
    ["set to the empty string", keyOf("")],
  ])("a key %s refuses its clients' sign-ins and their codes", async (_name, replacement) => {
    const h = await createStackHub();
    const preview = await registered(h, PREVIEW_KEY);
    const production = await registered(h, PRODUCTION_KEY, {
      client_name: "prod",
      deployment_type: "production",
    });
    const issued = await codeOf(h, preview.client_id);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    if (replacement === undefined) {
      delete h.keys["preview"];
    } else {
      h.keys["preview"] = replacement;
    }
    expect(await signIn(h, preview.client_id)).toBe("status 403");
    const refused = await redeem(h, preview, issued);
    expect(refused.status).toBe(401);
    expect(Schema.decodeUnknownSync(Refusal)(await refused.json()).error).toBe("invalid_client");
    expect(await signIn(h, production.client_id)).toBe("provider");
  });
});

describe("the client's own record (RFC 7592)", () => {
  test("a read renews: a new removal date, and the connectors from the enrollment", async () => {
    const h = await createStackHub();
    const client = await registered(h, PREVIEW_KEY, { connectors: ["fake", "other"] });
    await h.editCard(client.client_id, (card) => ({ ...card, connectors: [] }));
    h.clock.advance(1_000);
    const response = await manage(h, "GET", client.client_id, client.registration_access_token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      client_id: client.client_id,
      client_name: "pr-1",
      software_id: "apps/example",
      connectors: ["fake", "other"],
      registration_access_token: client.registration_access_token,
    });
    expect(h.cards().map((card) => [card.connectors, card.removeAt])).toEqual([
      [["fake", "other"], EPOCH + 1_000 + LEASE_MS],
    ]);
  });

  test("a card's connections are its key's, at the registration and at each read", async () => {
    const h = await createStackHub({
      preview: { ...keyOf(PREVIEW_KEY), connections: ["github", "cloudflare", "github"] },
    });
    const client = await registered(h, PREVIEW_KEY);
    expect(h.cards().map((card) => card.connections)).toEqual([["cloudflare", "github"]]);
    h.keys["preview"] = { ...keyOf(PREVIEW_KEY), connections: ["convex"] };
    expect(
      (await manage(h, "GET", client.client_id, client.registration_access_token)).status,
    ).toBe(200);
    expect(h.cards().map((card) => card.connections)).toEqual([["convex"]]);
  });

  test("a read is refused after the key left the hub's configuration", async () => {
    const h = await createStackHub();
    const client = await registered(h, PREVIEW_KEY);
    const before = h.cards();
    delete h.keys["preview"];
    h.clock.advance(1_000);
    const response = await manage(h, "GET", client.client_id, client.registration_access_token);
    expect(response.status).toBe(403);
    expect(h.cards()).toEqual(before);
  });

  test("a read of a stopped key's client answers 403 and renews nothing", async () => {
    const h = await createStackHub();
    const client = await registered(h, PREVIEW_KEY);
    const before = h.cards();
    await h.setStop("stack:preview", true);
    h.clock.advance(1_000);
    expect(
      (await manage(h, "GET", client.client_id, client.registration_access_token)).status,
    ).toBe(403);
    expect(h.cards()).toEqual(before);
  });

  test("a temporary client deletes itself; a production client cannot", async () => {
    const h = await createStackHub();
    const preview = await registered(h, PREVIEW_KEY);
    const production = await registered(h, PRODUCTION_KEY, {
      client_name: "prod",
      deployment_type: "production",
    });
    expect(
      (await manage(h, "DELETE", production.client_id, production.registration_access_token))
        .status,
    ).toBe(403);
    expect(
      (await manage(h, "DELETE", preview.client_id, preview.registration_access_token)).status,
    ).toBe(204);
    expect(h.cards().map((card) => card.clientId)).toEqual([production.client_id]);
  });

  test("one client's token reaches no other client, and a key reaches no client", async () => {
    const h = await createStackHub();
    const first = await registered(h, PREVIEW_KEY);
    const second = await registered(h, PREVIEW_KEY, { client_name: "pr-2" });
    const before = h.cards();
    for (const token of [first.registration_access_token, PREVIEW_KEY, PRODUCTION_KEY]) {
      expect((await manage(h, "GET", second.client_id, token)).status).toBe(401);
      expect((await manage(h, "DELETE", second.client_id, token)).status).toBe(401);
    }
    expect(h.cards()).toEqual(before);
  });
});

test("discovery names the registration endpoint", async () => {
  const h = await createStackHub();
  const metadata = await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`);
  expect(await metadata.json()).toMatchObject({
    registration_endpoint: `${h.issuer}/register`,
    op_tos_uri: TEST_SERVICE.terms,
  });
});

test("a hub without a service names no terms: not in discovery, the answer, or the page", async () => {
  const h = await createStackHub(undefined, { service: undefined });
  const metadata = await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`);
  expect(await metadata.json()).not.toHaveProperty("op_tos_uri");
  const response = await register(h, PREVIEW_KEY, { connectors: ["fake", "other"] });
  const answer: unknown = await response.json();
  expect(answer).not.toHaveProperty("terms");
  const { challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: Schema.decodeUnknownSync(NewClient)(answer).client_id,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "openid",
    state: "s",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  // Two connectors: the page that picks one, with no privacy notice or terms under it.
  const page = await h.fetchBroker(url);
  expect(page.status).toBe(200);
  const html = await page.text();
  expect(html).toContain("Continue with Other");
  expect(html).not.toMatch(/Privacy|Terms/);
});
