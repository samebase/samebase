// The adapter steps, a sign-in through the component, and the broker over HTTP, on a real Convex
// backend: the anonymous local deployment that `npx convex dev` runs for this package
// (convex.json names this app). With it running, `pnpm run test:convex` runs this file. The test
// empties the app's step tables and the component's tables and sets the deployment's environment
// variables, so it refuses any deployment that is not anonymous and local.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import fc from "fast-check";
import { base64url, createLocalJWKSet, jwtVerify } from "jose";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";
import { createKeySet } from "../../src/core/keys.ts";
import { sha256Hex } from "../../src/core/subject.ts";
import {
  createBroker,
  fakeOidcUpstream,
  pkce,
  stubFetch,
  txnCookie,
  type StubFetch,
} from "../../src/core/testing/harness.ts";
import { github } from "../../src/layers/github/routes.ts";
import { ModerationApi, ModerationKey } from "../../src/moderation/api.ts";
import {
  connectionCleanup,
  dyingStep,
  edgeStep,
  foundOf,
  longStep,
  memoryConnection,
  memoryPlayer,
  memorySignIn,
  negativeZero,
  play,
  playConnection,
  playSignIn,
  sameKey,
  signInCleanup,
  stepLists,
  type Player,
} from "../../src/store/contract.ts";
import { encodeArgs, type Args } from "../../src/store/commands.ts";
import { StepOutput } from "../../src/store/testing.ts";
import { api } from "./convex/_generated/api.js";
import { FAKE_IDP_ISSUER, FAKE_IDP_PORT } from "./convex/fakeIdp.ts";

const packageDir = fileURLToPath(new URL("../..", import.meta.url));
const local = parseEnv(readFileSync(join(packageDir, ".env.local"), "utf8"));
const deployment = local["CONVEX_DEPLOYMENT"];
const url = local["CONVEX_URL"];
const siteUrl = local["CONVEX_SITE_URL"];
if (
  deployment === undefined ||
  !deployment.startsWith("anonymous:") ||
  url === undefined ||
  new URL(url).hostname !== "127.0.0.1" ||
  siteUrl === undefined
) {
  throw new Error("Run `npx convex dev` in packages/identity-broker first: no local backend");
}

const client = new ConvexHttpClient(url);
const decodeOutput = Schema.decodeUnknownSync(StepOutput);

const player: Player = async (input) =>
  decodeOutput(await client.mutation(api.ops.step, { step: input }));

const same = (after: unknown, before: unknown) => expect(after).toEqual(before);

/** The Convex CLI on the local deployment, with `input` on its stdin. Fails on a nonzero exit. */
const convexCli = (args: ReadonlyArray<string>, input?: string) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("CONVEX_")),
  );
  const result = spawnSync(
    process.execPath,
    [join(packageDir, "node_modules/convex/bin/main.js"), ...args],
    {
      cwd: packageDir,
      env: { ...env, CONVEX_DEPLOYMENT: deployment },
      input,
      stdio: [input === undefined ? "ignore" : "pipe", "inherit", "inherit"],
    },
  );
  if (result.status !== 0) {
    throw new Error(`convex ${args[0]} failed`);
  }
};

/** Empties the component's tables: an import of a snapshot with no tables, as `--replace-all`. */
const emptyComponent = () => {
  const dir = mkdtempSync(join(tmpdir(), "identity-broker-effect-"));
  try {
    const zip = join(dir, "empty.zip");
    // A zip file with no entries is its end-of-central-directory record alone.
    writeFileSync(zip, Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]));
    convexCli(["import", "--component", "identityBroker", "--replace-all", "--yes", zip]);
  } finally {
    rmSync(dir, { recursive: true });
  }
};

beforeEach(async () => {
  await client.mutation(api.ops.reset, {});
});

test("random operation lists give the memory adapter's results", async () => {
  await fc.assert(
    fc.asyncProperty(stepLists, async (steps) => {
      await client.mutation(api.ops.reset, {});
      const fromMemory = await play(steps, memoryPlayer(), same);
      expect(await play(steps, player, same)).toEqual(fromMemory);
    }),
    { numRuns: 100 },
  );
}, 600_000);

test("equal index keys keep insertion order, and a replace keeps the row's place", async () => {
  expect((await player(sameKey.step)).log).toEqual(sameKey.log);
});

test("fixed steps at the edges give the memory adapter's results, and a step that dies writes nothing", async () => {
  const steps = [longStep, edgeStep, dyingStep];
  const fromMemory = await play(steps, memoryPlayer(), same);
  expect(fromMemory.at(-2)).toBe("rolled back");
  expect(fromMemory.slice(0, -2)).not.toContain("rolled back");
  expect(await play(steps, player, same)).toEqual(fromMemory);
}, 60_000);

test("-0 and 0 are one index value", async () => {
  expect(foundOf(await player(negativeZero.step))).toEqual(negativeZero.found);
});

test("a sign-in through the component's functions gives the memory host's results", async () => {
  emptyComponent();
  const fromConvex = await playSignIn((name, args, now) =>
    client.mutation(api.ops.command, { name, args, now }),
  );
  expect(fromConvex).toEqual(memorySignIn());
  expect(fromConvex.at(-1)).toEqual(signInCleanup);
}, 60_000);

test("a connection through the component's functions gives the memory host's results", async () => {
  emptyComponent();
  const fromConvex = await playConnection((name, args, now) =>
    client.mutation(api.ops.command, { name, args, now }),
  );
  expect(fromConvex).toEqual(memoryConnection());
  expect(fromConvex.at(-1)).toEqual(connectionCleanup);
}, 60_000);

// The broker over HTTP (convex/broker.ts at the site URL), next to the memory host with the same
// settings. The fake OpenID provider is the core tests' (`fakeOidcUpstream`): for the Convex broker
// it is served on loopback at `FAKE_IDP_PORT`, where convex/broker.ts sends the broker's requests to it.

/** One broker as a test drives it. */
type TestBroker = {
  readonly issuer: string;
  /** A request to the broker, whose redirects are not followed. */
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Runs `github.createClient`, as `POST /register` does after it checked a GitHub proof. */
  readonly seedProduction: (args: Args<"github.createClient">) => Promise<void>;
  /** The fake provider's next id_token. */
  readonly nextIdToken: (value: { nonce: string; authTime: number }) => void;
  /** The provider's calls that it had no answer for. */
  readonly unexpected: ReadonlyArray<string>;
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString();
};

/** Serves `fetch`'s planned answers of the fake provider on loopback, at the provider's paths. */
const serveUpstream = (fetch: StubFetch) =>
  new Promise<Server>((resolve, reject) => {
    const server = createServer((incoming, outgoing) => {
      void (async () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          for (const item of typeof value === "string" ? [value] : (value ?? [])) {
            headers.append(name, item);
          }
        }
        const method = incoming.method ?? "GET";
        const response = await fetch.service
          .fetch(
            new Request(`${FAKE_IDP_ISSUER}${incoming.url ?? "/"}`, {
              method,
              headers,
              body: method === "GET" ? null : await readBody(incoming),
            }),
          )
          .catch(() => new Response(null, { status: 502 }));
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      })();
    });
    server.once("error", reject);
    server.listen(FAKE_IDP_PORT, "127.0.0.1", () => resolve(server));
  });

/** The allow-list of convex/broker.ts: the seeded repository with its owner. */
const ALLOW_LIST = [{ repositoryId: "1", ownerId: "65" }];

/** The moderation key of convex/broker.ts, fresh per run. */
const MODERATION_KEY = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

let upstreamServer: Server | undefined;
const convexUpstream = stubFetch();
const convexIdp = await fakeOidcUpstream(convexUpstream);

beforeAll(async () => {
  // A fresh key set per run; it goes to the deployment through stdin, never as an argument.
  convexCli(["env", "set", "IDENTITY_BROKER_KEYS"], JSON.stringify(await createKeySet()));
  // The client secret of `fakeOidcUpstream`, a fixed test value.
  convexCli(["env", "set", "IDP_CLIENT_SECRET"], "idp-secret");
  convexCli(["env", "set", "MODERATION_KEY"], MODERATION_KEY);
  upstreamServer = await serveUpstream(convexUpstream);
});

afterAll(async () => {
  await new Promise((resolve) => upstreamServer?.close(resolve));
});

const convexBroker = (): TestBroker => ({
  issuer: siteUrl,
  fetch: (input, init) => fetch(input, { ...init, redirect: "manual" }),
  seedProduction: async (args) => {
    await client.mutation(api.ops.command, {
      name: "github.createClient",
      args: encodeArgs("github.createClient", args),
      now: Date.now(),
    });
  },
  nextIdToken: convexIdp.nextIdToken,
  unexpected: convexUpstream.unexpected,
});

const memoryBroker = async (): Promise<TestBroker> => {
  const upstream = stubFetch();
  const idp = await fakeOidcUpstream(upstream);
  const h = await createBroker({
    fetch: upstream,
    config: { issuer: siteUrl, connectors: [idp.connector] },
    registration: github(ALLOW_LIST),
  });
  h.clock.set(Date.now());
  return {
    issuer: h.issuer,
    fetch: h.fetchBroker,
    seedProduction: async (args) => {
      h.memory.run("github.createClient", args);
    },
    nextIdToken: idp.nextIdToken,
    unexpected: upstream.unexpected,
  };
};

const sorted = (record: object) => Object.keys(record).sort();

/**
 * What a response shows, without its random values: the status, the content type, the cache
 * header, a redirect's target without its query values, each Set-Cookie field with its name and
 * value hidden, and a JSON body's keys.
 */
const seen = async (response: Response) => {
  const location = response.headers.get("location");
  const type = response.headers.get("content-type");
  const target = location === null ? null : new URL(location);
  const text = await response.text();
  return {
    status: response.status,
    type,
    cache: response.headers.get("cache-control"),
    location:
      target === null
        ? null
        : `${target.origin}${target.pathname}?${[...target.searchParams.keys()].join("&")}`,
    cookies: response.headers.getSetCookie().map((cookie) => cookie.replace(/^[^;]*/, "<cookie>")),
    body: type?.startsWith("application/json") === true ? sorted(JSON.parse(text)) : text.length,
  };
};

/** The app of the seeded production client: its initial access token makes development clients. */
const APP = "my-app";

const seedApp = async (broker: TestBroker) => {
  const initialAccessToken = base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
  await broker.seedProduction({
    clientId: `cl_seed_${crypto.randomUUID()}`,
    secretHash: "seed",
    registrationTokenHash: "seed",
    githubRepositoryDatabaseId: "1",
    githubOwnerId: "65",
    githubRepository: "owner/repo",
    githubActorId: "9",
    githubActorLogin: "actor",
    commitSha: "sha",
    proofIssuedAt: Math.floor(Date.now() / 1000),
    deployment: {
      type: "production",
      initialAccessTokenHash: await sha256Hex(initialAccessToken),
    },
    connectors: ["idp"],
    app: APP,
    // `appIdOf` in src/layers/github/register.ts.
    appId: `gh-1-${(await sha256Hex(APP)).slice(0, 32)}`,
    redirectUris: ["https://app.test/cb"],
    softwareVersion: "1",
    tokenEndpointAuthMethod: "client_secret_post",
    allowList: ALLOW_LIST,
    configured: ["idp"],
  });
  return initialAccessToken;
};

const NewClient = Schema.Struct({ client_id: Schema.String, client_secret: Schema.String });
const TokenResponse = Schema.Struct({ access_token: Schema.String, id_token: Schema.String });
const Jwks = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({
      kty: Schema.String,
      n: Schema.String,
      e: Schema.String,
      kid: Schema.String,
      alg: Schema.String,
      use: Schema.String,
    }),
  ),
});

/** The development client's return address, on loopback: it needs no verification file. */
const REDIRECT_URI = "http://127.0.0.1:9562/callback";

/** `POST /register` of a development client with the app's initial access token. */
const register = async (broker: TestBroker, initialAccessToken: string) => {
  const response = await broker.fetch(`${broker.issuer}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${initialAccessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      software_id: APP,
      software_version: "dev-1",
      redirect_uris: [REDIRECT_URI],
      connectors: ["idp"],
      token_endpoint_auth_method: "client_secret_post",
    }),
  });
  const shown = await seen(response.clone());
  return { shown, client: Schema.decodeUnknownSync(NewClient)(await response.json()) };
};

/**
 * A sign-in up to the broker's callback: `/authorize`, the sign-in page and its "Continue" link when
 * the broker shows one, and the redirect to the provider, whose next id_token gets the nonce.
 * Returns what each response showed, the callback URL and the transaction cookie.
 */
const startSignIn = async (broker: TestBroker, clientId: string) => {
  const shown = [];
  const { verifier, challenge } = await pkce();
  const nonce = crypto.randomUUID();
  const authorize = new URL(`${broker.issuer}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state: "client-state",
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  let response = await broker.fetch(authorize.href);
  const cookie = txnCookie(response);
  shown.push(await seen(response.clone()));
  if (response.status === 200) {
    const href = /href="([^"]*\/continue\?[^"]*)"/.exec(await response.text())?.[1] ?? "";
    response = await broker.fetch(new URL(href.replaceAll("&amp;", "&"), broker.issuer).href, {
      headers: cookie,
    });
    shown.push(await seen(response.clone()));
  }
  const upstream = new URL(response.headers.get("location") ?? "");
  broker.nextIdToken({
    nonce: upstream.searchParams.get("nonce") ?? "",
    authTime: Math.floor(Date.now() / 1000),
  });
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  return { shown, callback: callback.href, cookie, verifier, nonce };
};

/** Discovery, JWKS, HEAD, an unknown path, a registration and a whole sign-in, as seen. */
const signInTranscript = async (broker: TestBroker) => {
  const discovery = await broker.fetch(`${broker.issuer}/.well-known/openid-configuration`);
  const discoveryBody: unknown = await discovery.clone().json();
  const jwksResponse = await broker.fetch(`${broker.issuer}/.well-known/jwks.json`);
  const jwks = Schema.decodeUnknownSync(Jwks)(await jwksResponse.clone().json());
  const head = await broker.fetch(`${broker.issuer}/.well-known/openid-configuration`, {
    method: "HEAD",
  });
  const missing = await broker.fetch(`${broker.issuer}/no-such-path`);

  const { shown: registered, client: newClient } = await register(broker, await seedApp(broker));
  const started = await startSignIn(broker, newClient.client_id);
  const back = await broker.fetch(started.callback, { headers: started.cookie });
  const returned = new URL(back.headers.get("location") ?? "");
  const tokenResponse = await broker.fetch(`${broker.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: returned.searchParams.get("code") ?? "",
      redirect_uri: REDIRECT_URI,
      code_verifier: started.verifier,
      client_id: newClient.client_id,
      client_secret: newClient.client_secret,
    }),
  });
  const tokens = Schema.decodeUnknownSync(TokenResponse)(await tokenResponse.clone().json());
  // The id_token checks against the key set that the broker serves.
  const { payload, protectedHeader } = await jwtVerify(
    tokens.id_token,
    createLocalJWKSet({ keys: [...jwks.keys] }),
    { issuer: broker.issuer, audience: newClient.client_id },
  );
  const userinfo = await broker.fetch(`${broker.issuer}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  return {
    discovery: discoveryBody,
    responses: [
      await seen(discovery),
      await seen(jwksResponse),
      {
        status: head.status,
        type: head.headers.get("content-type"),
        body: (await head.text()).length,
      },
      await seen(missing),
      registered,
      ...started.shown,
      await seen(back),
      await seen(tokenResponse),
      await seen(userinfo),
    ],
    returnedState: returned.searchParams.get("state"),
    returnedIss: returned.searchParams.get("iss"),
    idToken: {
      header: {
        alg: protectedHeader.alg,
        kidIsServed: jwks.keys.some((key) => key.kid === protectedHeader.kid),
      },
      claims: sorted(payload),
      sub: payload.sub,
      nonce: payload.nonce === started.nonce,
    },
    unexpected: [...broker.unexpected],
  };
};

test("discovery, JWKS, a registration and a sign-in to a verified id_token give the memory host's results", async () => {
  emptyComponent();
  const fromConvex = await signInTranscript(convexBroker());
  const fromMemory = await signInTranscript(await memoryBroker());
  expect(fromConvex).toEqual(fromMemory);
  expect(fromConvex.idToken.sub).toBe("idp:24400320");
  expect(fromConvex.unexpected).toEqual([]);
}, 60_000);

test("of two callbacks with one state, the second loses the race as on the memory host", async () => {
  emptyComponent();
  const race = async (broker: TestBroker) => {
    const { client: newClient } = await register(broker, await seedApp(broker));
    const started = await startSignIn(broker, newClient.client_id);
    const answers = await Promise.all(
      [0, 1].map(() => broker.fetch(started.callback, { headers: started.cookie })),
    );
    const shown = await Promise.all(answers.map(seen));
    return shown.sort((a, b) => a.status - b.status);
  };
  const fromConvex = await race(convexBroker());
  expect(fromConvex).toEqual(await race(await memoryBroker()));
  // The winner returns to the client with a code; the loser gets the broker's error page.
  expect(fromConvex.map((answer) => [answer.status, answer.type])).toEqual([
    [302, null],
    [400, "text/html; charset=utf-8"],
  ]);
}, 60_000);

test("the moderation API answers its typed client from an httpAction", async () => {
  emptyComponent();
  await seedApp(convexBroker());
  const { moderation } = await Effect.runPromise(
    HttpApiClient.make(ModerationApi, { baseUrl: siteUrl }).pipe(
      Effect.provide(
        HttpApiMiddleware.layerClient(ModerationKey, ({ next, request }) =>
          next(HttpClientRequest.bearerToken(request, MODERATION_KEY)),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
    ),
  );
  const { clients } = await Effect.runPromise(moderation.clients({ query: { owner: "65" } }));
  expect(clients).toMatchObject([{ ownerId: "65", deploymentType: "production" }]);
  const block = {
    action: "block",
    kind: "owner",
    githubId: "66",
    reason: "Spam",
    adminEmail: "admin@example.com",
  } as const;
  expect(await Effect.runPromise(moderation.changeBlock({ payload: block }))).toEqual({
    changed: true,
  });
  expect((await Effect.runPromise(moderation.blocks())).blocks).toMatchObject([
    { kind: "owner", githubId: "66" },
  ]);

  const anonymous = await fetch(`${siteUrl}/moderation/counts`);
  expect([
    anonymous.status,
    anonymous.headers.get("www-authenticate"),
    anonymous.headers.get("cache-control"),
  ]).toEqual([401, 'Bearer realm="moderation"', "no-store"]);
}, 60_000);

test("an httpAction keeps both Set-Cookie fields of one response", async () => {
  const response = await fetch(`${siteUrl}/two-cookies`);
  expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
});

const CleanupResult = Schema.Struct({ signIns: Schema.Number, more: Schema.Boolean });

test("the cleanup runs batches until none is left", async () => {
  emptyComponent();
  // More than two batches (`BATCH` in src/rules/lifecycle.ts is 200) of sign-ins from 1970.
  for (let at = 1; at <= 450; at++) {
    await client.mutation(api.ops.command, {
      name: "signIns.record",
      args: { clientId: "c", ref: "test:a", connector: "idp", sub: "s", at },
      now: Date.now(),
    });
  }
  convexCli(["run", "broker:cleanup"]);
  // A batch at the same retention finds none of them left.
  const after = await client.mutation(api.ops.command, {
    name: "lifecycle.cleanup",
    args: { now: Date.now(), signInRetentionMs: 0 },
    now: Date.now(),
  });
  expect(Schema.decodeUnknownSync(CleanupResult)(after)).toEqual({ signIns: 0, more: false });
}, 120_000);
