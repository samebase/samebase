// Clients with no secret, whose id is the https address of their metadata document: the card
// union, the two kinds of client authentication at `/token`, the call to a layer's resolver at
// `/authorize`, and a broker with more than one layer. The resolver here is a test layer that writes
// the public card through the harness; the real layer is src/layers/cimd/.
import { Effect, Schema } from "effect";
import { describe, expect, test } from "vite-plus/test";
import {
  authorize as connectionStart,
  cloudflare,
  integrationsBroker,
  refresh,
  revoke,
} from "../integrations/testing.ts";
import { decodeCommand, type Args } from "../store/commands.ts";
import { tables } from "../store/tables.ts";
import type { ClientRefusal, Registration, Route } from "./router.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";

const CLIENT_ID = "https://app.test/oauth-client.json";
const REDIRECT_URI = "https://app.test/auth/callback";

const OAuthError = Schema.Struct({ error: Schema.String });
const errorOf = async (response: Response) =>
  Schema.decodeUnknownSync(OAuthError)(await response.json());

/**
 * The test layer: it records each call, writes the public card of the id on its first call, and
 * answers `refusal` when a test sets one.
 */
const testLayer = () => {
  const state: {
    calls: Array<{ readonly clientId: string; readonly redirectUri: string }>;
    refusal: ClientRefusal | undefined;
    broker: Broker | undefined;
  } = { calls: [], refusal: undefined, broker: undefined };
  const layer: Registration = {
    routes: [],
    resolveClient: (request) =>
      Effect.gen(function* () {
        state.calls.push(request);
        if (state.refusal !== undefined) {
          return state.refusal;
        }
        const { broker } = state;
        if (broker !== undefined && state.calls.length === 1) {
          yield* Effect.promise(() => broker.registerPublicClient(request));
        }
        return undefined;
      }),
  };
  return { state, layer };
};

/** A broker on the fake provider with `registration`, by default the test layer alone. */
async function publicBroker(registration?: Registration | ReadonlyArray<Registration>) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const test = testLayer();
  const h = await createBroker({
    fetch,
    config: { connectors: [connector] },
    registration: registration ?? test.layer,
  });
  test.state.broker = h;
  return { ...h, resolver: test.state };
}

const authorizeUrl = (h: Broker, clientId: string, challenge: string) => {
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url;
};

/** A whole sign-in of `clientId` through the page, the provider and the callback: its code. */
async function signIn(h: Broker, clientId: string) {
  const { verifier, challenge } = await pkce();
  const page = await h.fetchBroker(authorizeUrl(h, clientId, challenge));
  const cookie = txnCookie(page);
  // A card without a page goes straight to the provider; a public card always shows the page.
  const started =
    page.status === 302
      ? page
      : await h.fetchBroker(
          `${h.issuer}/continue?request=${cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? ""}&connector=fake`,
          { headers: cookie },
        );
  expect(started.status).toBe(302);
  const provider = new URL(started.headers.get("location") ?? "");
  const callback = new URL(provider.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("state", provider.searchParams.get("state") ?? "");
  callback.searchParams.set("code", "upstream-code");
  const back = await h.fetchBroker(callback, { headers: cookie });
  const code = new URL(back.headers.get("location") ?? "").searchParams.get("code");
  expect(code).not.toBeNull();
  return { code: code ?? "", verifier };
}

/** How a token request authenticates the client. */
type Authentication =
  | { readonly kind: "none" }
  | { readonly kind: "post"; readonly secret: string }
  | { readonly kind: "basic"; readonly secret: string }
  | { readonly kind: "assertion" };

const tokenRequest = (
  h: Broker,
  args: { clientId: string; code: string; verifier: string; authentication: Authentication },
) => {
  const { authentication } = args;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    code_verifier: args.verifier,
    redirect_uri: REDIRECT_URI,
  });
  if (authentication.kind !== "basic") {
    body.set("client_id", args.clientId);
  }
  if (authentication.kind === "post") {
    body.set("client_secret", authentication.secret);
  }
  if (authentication.kind === "assertion") {
    body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    body.set("client_assertion", "a.b.c");
  }
  return h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(authentication.kind === "basic"
        ? {
            Authorization: `Basic ${btoa(`${encodeURIComponent(args.clientId)}:${encodeURIComponent(authentication.secret)}`)}`,
          }
        : {}),
    },
    body,
  });
};

describe("/token: each card shape with each kind of client authentication", () => {
  const variants = (secret: string): Record<string, Authentication> => ({
    none: { kind: "none" },
    post: { kind: "post", secret },
    basic: { kind: "basic", secret },
    "post, wrong secret": { kind: "post", secret: "wrong" },
    "basic, empty password": { kind: "basic", secret: "" },
    assertion: { kind: "assertion" },
  });
  const cases = [
    { card: "public", accepts: "none" },
    { card: "client_secret_post", accepts: "post" },
    { card: "client_secret_basic", accepts: "basic" },
  ] as const;

  test.each(cases)(
    "a $card card takes only $accepts; every other kind is invalid_client and leaves the code",
    async ({ card, accepts }) => {
      const h = await publicBroker();
      const client =
        card === "public"
          ? { clientId: CLIENT_ID, clientSecret: "any-secret" }
          : await h.registerClient({
              appName: "App",
              redirectUri: REDIRECT_URI,
              tokenEndpointAuthMethod: card,
            });
      const { code, verifier } = await signIn(h, client.clientId);
      const all = variants(client.clientSecret);
      for (const [name, authentication] of Object.entries(all)) {
        if (name === accepts) continue;
        const refused = await tokenRequest(h, { ...client, code, verifier, authentication });
        expect([name, refused.status, (await errorOf(refused)).error]).toEqual([
          name,
          401,
          "invalid_client",
        ]);
      }
      const answer = await tokenRequest(h, {
        ...client,
        code,
        verifier,
        authentication: all[accepts] ?? { kind: "none" },
      });
      expect(answer.status).toBe(200);
    },
  );

  test("a public client's sign-in calls the layer once, at /authorize", async () => {
    const h = await publicBroker();
    const { code, verifier } = await signIn(h, CLIENT_ID);
    expect(
      (
        await tokenRequest(h, {
          clientId: CLIENT_ID,
          code,
          verifier,
          authentication: { kind: "none" },
        })
      ).status,
    ).toBe(200);
    expect(h.resolver.calls).toEqual([{ clientId: CLIENT_ID, redirectUri: REDIRECT_URI }]);
  });
});

describe("/authorize and the resolver", () => {
  test("every check of the request comes before the resolver, and a HEAD stores nothing", async () => {
    const h = await publicBroker();
    const { challenge } = await pkce();
    const good = authorizeUrl(h, CLIENT_ID, challenge);
    const bad = (change: (url: URL) => void) => {
      const url = new URL(good);
      change(url);
      return url;
    };
    for (const url of [
      bad((url) => url.searchParams.delete("code_challenge")),
      bad((url) => url.searchParams.set("scope", "email")),
      bad((url) => url.searchParams.set("resource", "https://api.test")),
      bad((url) => url.searchParams.set("prompt", "none")),
      bad((url) => url.searchParams.set("redirect_uri", "http://app.test/cb")),
    ]) {
      const response = await h.fetchBroker(url);
      expect(response.status).toBe(400);
    }
    const head = await h.fetchBroker(good, { method: "HEAD" });
    expect(head.status).toBe(405);
    expect(h.resolver.calls).toEqual([]);
    expect(h.memory.db.contents().authRequests).toEqual([]);
  });

  test("the resolver gets the client id as sent; a cl_ id never reaches it", async () => {
    const h = await publicBroker();
    h.resolver.refusal = { reason: "invalid", description: "The document was refused." };
    const { challenge } = await pkce();
    const padded = ` ${CLIENT_ID}`;
    await h.fetchBroker(authorizeUrl(h, padded, challenge));
    const secret = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    expect((await h.fetchBroker(authorizeUrl(h, secret.clientId, challenge))).status).toBe(302);
    expect(h.resolver.calls).toEqual([{ clientId: padded, redirectUri: REDIRECT_URI }]);
  });

  test.each([
    {
      refusal: { reason: "invalid", description: "No usable redirect URI." },
      status: 400,
      retryAfter: null,
      text: "invalid_client: No usable redirect URI.",
    },
    {
      refusal: { reason: "unavailable", retryAfter: 30 },
      status: 503,
      retryAfter: "30",
      text: "Try again soon.",
    },
    { refusal: { reason: "unavailable" }, status: 503, retryAfter: null, text: "Try again soon." },
    { refusal: { reason: "rate_limited" }, status: 429, retryAfter: null, text: "Try again soon." },
  ] satisfies ReadonlyArray<{
    refusal: ClientRefusal;
    status: number;
    retryAfter: string | null;
    text: string;
  }>)(
    "a refusal $refusal.reason is the broker's own page $status, with no redirect and nothing stored",
    async ({ refusal, status, retryAfter, text }) => {
      const h = await publicBroker();
      h.resolver.refusal = refusal;
      const { challenge } = await pkce();
      const response = await h.fetchBroker(authorizeUrl(h, CLIENT_ID, challenge));
      expect(response.status).toBe(status);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      expect(await response.text()).toContain(text);
      expect(h.memory.db.contents().authRequests).toEqual([]);
    },
  );

  test("with no resolver mounted, an https client is unknown at /authorize and invalid_client at /token, even with a stored card", async () => {
    const h = await publicBroker({ routes: [] });
    await h.registerPublicClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
    const { verifier, challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, CLIENT_ID, challenge));
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("Unknown client");
    const token = await tokenRequest(h, {
      clientId: CLIENT_ID,
      code: "any",
      verifier,
      authentication: { kind: "none" },
    });
    expect(token.status).toBe(401);
    expect((await errorOf(token)).error).toBe("invalid_client");
  });
});

describe("discovery", () => {
  test("names metadata documents and the method none only with a resolver", async () => {
    const read = async (h: Broker) =>
      Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        await (await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`)).json(),
      );
    const withResolver = await read(await publicBroker());
    expect(withResolver).toMatchObject({
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    });
    expect(withResolver).not.toHaveProperty("registration_endpoint");
    const without = await read(await publicBroker({ routes: [] }));
    expect(without).not.toHaveProperty("client_id_metadata_document_supported");
    expect(without["token_endpoint_auth_methods_supported"]).toEqual([
      "client_secret_post",
      "client_secret_basic",
    ]);
  });
});

describe("more than one layer", () => {
  const register: Route = {
    method: "POST",
    path: "/register",
    match: "exact",
    template: "/register",
    handler: () => Effect.succeed(new Response(null, { status: 201 })),
  };
  const start = (registration: ReadonlyArray<Registration>) => createBroker({ registration });

  test("the broker refuses to start with two equal routes, two resolvers, or a public layer and no service", async () => {
    await expect(start([{ routes: [register] }, { routes: [register] }])).rejects.toThrow(
      "Two routes are POST /register (exact)",
    );
    const { layer } = testLayer();
    await expect(start([layer, layer])).rejects.toThrow("Only one registration layer may resolve");
    await expect(
      createBroker({
        registration: [{ routes: [] }, { routes: [], public: true }],
        config: { service: undefined },
      }),
    ).rejects.toThrow("A public registration layer needs the broker's service settings");
  });

  test("the live gates of every layer apply, and discovery names the one registration endpoint", async () => {
    const { layer } = testLayer();
    const h = await publicBroker([
      layer,
      {
        routes: [register],
        liveGates: Effect.succeed([{ prefix: "first:", live: [] }]),
      },
      { routes: [], liveGates: Effect.succeed([{ prefix: "second:", live: ["second:on"] }]) },
    ]);
    const { challenge } = await pkce();
    for (const [gate, status] of [
      ["first:a", 403],
      ["second:off", 403],
      ["second:on", 302],
    ] as const) {
      const client = await h.registerClient({
        appName: gate,
        redirectUri: REDIRECT_URI,
        gates: [gate],
      });
      expect([
        gate,
        (await h.fetchBroker(authorizeUrl(h, client.clientId, challenge))).status,
      ]).toEqual([gate, status]);
    }
    const metadata = await (
      await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`)
    ).json();
    expect(metadata).toMatchObject({
      registration_endpoint: `${h.issuer}/register`,
      client_id_metadata_document_supported: true,
    });
  });
});

describe("a layer of secret clients cannot write a public card", () => {
  type Methods = {
    [
      N in "github.createClient" | "github.createDevelopmentClient" | "stack.createClient"
    ]: Args<N>["tokenEndpointAuthMethod"];
  };
  /** Fails to compile when a secret layer's command takes the method none. */
  const secretOnly: Extract<Methods[keyof Methods], "none"> extends never ? true : false = true;

  const githubFields = {
    clientId: "cl_1",
    secretHash: "s",
    registrationTokenHash: "r",
    githubRepositoryDatabaseId: "1",
    githubOwnerId: "65",
    githubRepository: "owner-65/repo",
    app: "web",
    appId: "gh-1-web",
    connectors: ["g"],
    redirectUris: [REDIRECT_URI],
    softwareVersion: "1",
    allowList: "any",
    configured: ["g"],
  };
  test.each([
    {
      name: "github.createClient",
      args: {
        ...githubFields,
        githubActorId: "9",
        githubActorLogin: "actor",
        commitSha: "sha",
        proofIssuedAt: 100,
        deployment: { type: "production", initialAccessTokenHash: "token-65" },
      },
    },
    { name: "github.createDevelopmentClient", args: { ...githubFields, tokenHash: "t" } },
    {
      name: "stack.createClient",
      args: {
        clientId: "cl_2",
        secretHash: "s",
        redirectUris: [REDIRECT_URI],
        permanent: false,
        client: {
          key: "preview",
          name: "pr-1",
          softwareId: "app",
          softwareVersion: "1",
          registrationTokenHash: "r",
          enrollment: ["g"],
        },
        configured: ["g"],
        connections: [],
      },
    },
  ])("$name refuses the method none", ({ name, args }) => {
    expect(secretOnly).toBe(true);
    expect(() =>
      decodeCommand(name, { ...args, tokenEndpointAuthMethod: "client_secret_basic" }),
    ).not.toThrow();
    expect(() => decodeCommand(name, { ...args, tokenEndpointAuthMethod: "none" })).toThrow();
    expect(() =>
      decodeCommand(name, { ...args, tokenEndpointAuthMethod: "none", secretHash: null }),
    ).toThrow();
  });

  test("the store refuses a public card under a cl_ id, and a public card with a layer's fields", () => {
    const encode = Schema.encodeUnknownSync(tables.clients.schema);
    const card = {
      tokenEndpointAuthMethod: "none",
      clientId: CLIENT_ID,
      secretHash: null,
      redirectUris: [REDIRECT_URI],
      connectors: ["g"],
      connections: [],
      gates: [],
      confirm: true,
      budget: "cimd:host:app.test",
      ref: `cimd:${CLIENT_ID}`,
      createdAt: 0,
    };
    expect(() => encode(card)).not.toThrow();
    expect(() => encode({ ...card, clientId: "cl_1" })).toThrow();
    expect(() => encode({ ...card, secretHash: "h" })).toThrow();
    expect(() => encode({ ...card, tokenEndpointAuthMethod: "client_secret_basic" })).toThrow();
    expect(() =>
      encode({
        ...card,
        stack: {
          key: "k",
          name: "n",
          softwareId: "s",
          softwareVersion: "1",
          registrationTokenHash: "r",
          enrollment: [],
        },
      }),
    ).toThrow();
  });
});

describe("the integrations part stays secret-only", () => {
  test("a public client's code exchange reaches the core; refresh and revocation refuse no authentication", async () => {
    const { layer, state } = testLayer();
    const h = await integrationsBroker({
      registration: layer,
      connectors: (fetch) => [fakeUpstream(fetch).connector],
    });
    state.broker = h;
    const { code, verifier } = await signIn(h, CLIENT_ID);
    const exchanged = await tokenRequest(h, {
      clientId: CLIENT_ID,
      code,
      verifier,
      authentication: { kind: "none" },
    });
    expect(exchanged.status).toBe(200);
    const noSecret = { clientId: CLIENT_ID, clientSecret: "", redirectUri: REDIRECT_URI };
    for (const response of [
      await refresh(h, noSecret, "refresh-token", cloudflare.resource),
      await revoke(h, noSecret, "token", cloudflare.resource),
    ]) {
      expect(response.status).toBe(401);
      expect((await errorOf(response)).error).toBe("invalid_client");
    }
    // A public card has no connection, so a connection start is refused.
    const { start } = await connectionStart(
      h,
      { clientId: CLIENT_ID, clientSecret: "", redirectUri: REDIRECT_URI },
      cloudflare.resource,
    );
    expect(start.headers.get("location")).toBeNull();
    expect(h.providers.calls).toEqual([]);
  });
});
