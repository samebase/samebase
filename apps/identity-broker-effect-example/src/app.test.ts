// The example app against the hub's real core (packages/identity-broker-effect) on the memory
// Store, with no network: the hub, on the stack layer with the app's two keys, registers the app's
// preview client for the preview key, then a browser signs in through the hub's page and a fake
// Google. The app's services get test Layers: the client's values as plain values, and every hub
// request served by the hub's core through `FetchHttpClient.Fetch`.
import { describe, expect, it } from "@effect/vitest";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import * as Cookies from "effect/http/Cookies";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { TestClock } from "effect/testing";
import {
  createBroker,
  fakeOidcUpstream,
  stubFetch,
} from "@samebase/identity-broker-effect/testing";
import { stack } from "@samebase/identity-broker-effect/stack";
import { app } from "./app.ts";
import { HubClient } from "./hub-client.ts";
import { Session } from "./session.ts";

const HUB = "https://hub.example.com";
const APP = "https://identity-broker-effect-example-pr-1.pfp.workers.dev";
const SESSION_SECRET = "test-session-secret";
/** The hub's two keys, as `prod` makes them. */
const PRODUCTION_KEY = "test-production-key";
const PREVIEW_KEY = "test-preview-key";

/** The test hub of the deploy: Google only, and the keys of src/hub.ts with these values. */
async function createTestHub() {
  const fetch = stubFetch();
  const google = await fakeOidcUpstream(fetch);
  const broker = await createBroker({
    fetch,
    config: {
      issuer: HUB,
      connectors: [{ ...google.connector, name: "google", provider: "google", label: "Google" }],
    },
    registration: stack({
      keys: {
        production: { key: Config.succeed(Redacted.make(PRODUCTION_KEY)), permanent: true },
        preview: { key: Config.succeed(Redacted.make(PREVIEW_KEY)) },
      },
    }),
  });
  // The app checks the ID token's times against the real clock.
  broker.clock.set(Date.now());
  return { ...broker, google, rows: () => broker.memory.db.contents() };
}
type TestHub = Awaited<ReturnType<typeof createTestHub>>;

/** `POST /register` as IdentityHub.Client sends it from the stage `pr-1`, with `key`. */
async function registerPreviewClient(hub: TestHub, key: string) {
  return await hub.fetchBroker(`${HUB}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [`${APP}/callback`],
      software_id: "apps/identity-broker-effect-example",
      software_version: "test",
      client_name: "pr-1",
      deployment_type: "preview",
      connectors: ["google"],
      token_endpoint_auth_method: "client_secret_post",
    }),
  });
}

/** The members of the 201 answer that the app's deployment gets. */
const NewClient = Schema.Struct({ client_id: Schema.String, client_secret: Schema.String });

const sessionWith = (secret: string) => Session.layerWith(Effect.succeed(Redacted.make(secret)));

/** The client of `clientId` on `issuer`, with no hub to reach. */
const clientWith = (issuer: string, clientId: string, clientSecret: string) =>
  HubClient.layerWith({
    issuer: Effect.succeed(issuer),
    clientId: Effect.succeed(clientId),
    clientSecret: Effect.succeed(Redacted.make(clientSecret)),
  });

/** The app as a new stage deploys it first: IdentityHub.Client's off values. */
const offApp = Layer.mergeAll(
  clientWith("http://127.0.0.1:1", "no-hub", "no-hub"),
  sessionWith(SESSION_SECRET),
);

/** The app with the client `clientId` on the test hub; `hubRequests` records each hub request. */
const appOn = (hub: TestHub, clientId: string, clientSecret: string, hubRequests: string[]) =>
  Layer.mergeAll(
    clientWith(HUB, clientId, clientSecret).pipe(
      Layer.provide(
        Layer.succeed(FetchHttpClient.Fetch, async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          hubRequests.push(`${request.method} ${url.origin}${url.pathname}`);
          return await hub.fetchBroker(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.method === "GET" ? null : await request.text(),
          });
        }),
      ),
    ),
    sessionWith(SESSION_SECRET),
  );

/** The app's Web response to `request`. */
const serve = (request: Request) =>
  app.pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, HttpServerRequest.fromWeb(request)),
    Effect.map((response) => HttpServerResponse.toWeb(response)),
  );

const text = (response: Response) => Effect.promise(() => response.text());

describe("sign-in through the hub", () => {
  it.effect("registers with the preview key, signs in with Google, and shows the subject", () =>
    Effect.gen(function* () {
      const hub = yield* Effect.promise(createTestHub);
      // Another value than a key of the hub registers nothing.
      const refused = yield* Effect.promise(() => registerPreviewClient(hub, "not-a-key"));
      expect(refused.status).toBe(401);
      expect(hub.rows().clients).toEqual([]);

      const registered = yield* Effect.promise(() => registerPreviewClient(hub, PREVIEW_KEY));
      expect(registered.status).toBe(201);
      const client = Schema.decodeUnknownSync(NewClient)(
        yield* Effect.promise(() => registered.json()),
      );
      // The hub made no request to register it: no verification file, no proof.
      expect(hub.fetch.requests).toEqual([]);
      expect(hub.rows().clients.map((card) => [card.ref, card.budget, card.gates])).toEqual([
        ["stack:preview:pr-1", "stack:preview", ["stack:preview"]],
      ]);
      const hubRequests: string[] = [];
      const signedInApp = appOn(hub, client.client_id, client.client_secret, hubRequests);

      // A browser: the app and the hub, with the cookies of each origin.
      let jar: ReadonlyArray<Cookies.Cookie> = [];
      const get = Effect.fnUntraced(function* (url: string) {
        const cookie = Cookies.toRequestCookieHeader(jar, url, Date.now());
        const headers = cookie === undefined ? {} : { Cookie: cookie };
        const response = url.startsWith(APP)
          ? yield* serve(new Request(url, { headers })).pipe(Effect.provide(signedInApp))
          : yield* Effect.promise(() => hub.fetchBroker(url, { headers }));
        jar = Cookies.mergeIntoArray(
          jar,
          url,
          Cookies.fromSetCookie(response.headers.getSetCookie()),
          Date.now(),
        );
        return response;
      });

      const signedOut = yield* get(`${APP}/`);
      expect(yield* text(signedOut)).toContain('<a href="/login">Sign in with Google</a>');

      // The app sends the browser to the hub.
      const login = yield* get(`${APP}/login`);
      expect(login.status).toBe(302);
      const authorize = new URL(login.headers.get("location") ?? "");
      expect(`${authorize.origin}${authorize.pathname}`).toBe(`${HUB}/authorize`);
      expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
        client_id: client.client_id,
        redirect_uri: `${APP}/callback`,
        scope: "openid email profile",
        connector: "google",
        code_challenge_method: "S256",
      });

      // A card of the stack layer shows no page before the provider, and the app names one
      // connector: the hub sends the browser straight to Google.
      const toGoogle = yield* get(authorize.href);
      expect(toGoogle.status).toBe(302);
      const upstream = new URL(toGoogle.headers.get("location") ?? "");
      expect(upstream.origin).toBe("https://server.example.com");

      // Google signs the user in and sends the browser back to the hub's callback.
      hub.google.nextIdToken({
        nonce: upstream.searchParams.get("nonce") ?? "",
        authTime: undefined,
      });
      const hubCallback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
      hubCallback.searchParams.set("code", "upstream-code");
      hubCallback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
      const back = yield* get(hubCallback.href);
      expect(back.status).toBe(302);
      const appCallback = new URL(back.headers.get("location") ?? "");
      expect(`${appCallback.origin}${appCallback.pathname}`).toBe(`${APP}/callback`);
      expect(appCallback.searchParams.get("iss")).toBe(HUB);

      // The app exchanges the code and starts its session.
      const done = yield* get(appCallback.href);
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe("/");
      expect(hubRequests).toContain(`POST ${HUB}/token`);
      expect(hubRequests).toContain(`GET ${HUB}/.well-known/jwks.json`);

      const signedIn = yield* text(yield* get(`${APP}/`));
      expect(signedIn).toContain("<dt>Subject</dt><dd>google:24400320</dd>");
      expect(signedIn).toContain('<a href="/logout">Sign out</a>');
      expect(hub.rows().signIns.map((row) => row.sub)).toEqual(["google:24400320"]);

      // A second use of the same answer is refused: the sign-in cookie is gone.
      const replay = yield* get(appCallback.href);
      expect(replay.status).toBe(400);
      expect(yield* text(replay)).not.toContain(appCallback.searchParams.get("code") ?? "");

      const logout = yield* get(`${APP}/logout`);
      expect(logout.status).toBe(302);
      expect(yield* text(yield* get(`${APP}/`))).toContain("Sign in with Google");
    }),
  );

  it.effect.each([
    ["the state of another sign-in", "other", HUB],
    ["another issuer", undefined, "https://evil.example.com"],
    ["no issuer", undefined, undefined],
  ])("refuses an answer with %s, and shows no code", ([, state, iss]) =>
    Effect.gen(function* () {
      const hub = yield* Effect.promise(createTestHub);
      const hubRequests: string[] = [];
      const call = (request: Request) =>
        serve(request).pipe(Effect.provide(appOn(hub, "cl_x", "no-hub", hubRequests)));
      const login = yield* call(new Request(`${APP}/login`));
      const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const callback = new URL(`${APP}/callback`);
      callback.searchParams.set("code", "secret-code");
      callback.searchParams.set(
        "state",
        state ?? new URL(login.headers.get("location") ?? "").searchParams.get("state") ?? "",
      );
      if (iss !== undefined) callback.searchParams.set("iss", iss);

      const response = yield* call(new Request(callback, { headers: { Cookie: cookie } }));

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(yield* text(response)).not.toContain("secret-code");
      expect(hubRequests).not.toContain(`POST ${HUB}/token`);
    }),
  );
});

describe("the off configuration", () => {
  it.effect("shows no sign-in link and refuses /login", () =>
    Effect.gen(function* () {
      const home = yield* text(yield* serve(new Request(`${APP}/`)));
      expect(home).toContain("Sign-in is not configured.");
      expect(home).not.toContain("/login");

      const login = yield* serve(new Request(`${APP}/login`));
      expect(login.status).toBe(503);
    }).pipe(Effect.provide(offApp)),
  );
});

describe("requests", () => {
  it.effect("answers a POST with 405", () =>
    Effect.gen(function* () {
      const response = yield* serve(new Request(`${APP}/login`, { method: "POST" }));
      expect(response.status).toBe(405);
    }).pipe(Effect.provide(offApp)),
  );
});

describe("the session cookie", () => {
  const user = { sub: "google:1", name: "<b>Ada</b>" };
  const onApp = Layer.mergeAll(clientWith(HUB, "cl_x", "no-hub"), sessionWith(SESSION_SECRET));

  /** The home page with `value` as the session cookie. */
  const homeWith = (value: string) =>
    serve(new Request(`${APP}/`, { headers: { Cookie: `__Host-session=${value}` } })).pipe(
      Effect.flatMap(text),
    );
  /** `payload` sealed for `purpose` with `secret`, for one minute. */
  const sealed = (
    secret: string,
    purpose: "session" | "sign-in",
    payload: Readonly<Record<string, string>>,
  ) =>
    Session.use((session) => session.seal(purpose, payload, "1 minute")).pipe(
      Effect.provide(sessionWith(secret)),
    );

  it.effect("shows a valid session, escaped", () =>
    Effect.gen(function* () {
      const page = yield* homeWith(yield* sealed(SESSION_SECRET, "session", user));
      expect(page).toContain("<dd>google:1</dd>");
      expect(page).toContain("<dd>&lt;b&gt;Ada&lt;/b&gt;</dd>");
    }).pipe(Effect.provide(onApp)),
  );

  it.effect("refuses a value signed with another secret", () =>
    Effect.gen(function* () {
      const page = yield* homeWith(yield* sealed("other-secret", "session", user));
      expect(page).toContain("Sign in with Google");
    }).pipe(Effect.provide(onApp)),
  );

  it.effect("refuses a changed payload", () =>
    Effect.gen(function* () {
      const [, mac] = (yield* sealed(SESSION_SECRET, "session", user)).split(".");
      const [forged] = (yield* sealed("other-secret", "session", { sub: "google:2" })).split(".");
      expect(yield* homeWith(`${forged}.${mac}`)).toContain("Sign in with Google");
    }).pipe(Effect.provide(onApp)),
  );

  it.effect("refuses an expired session", () =>
    Effect.gen(function* () {
      const value = yield* sealed(SESSION_SECRET, "session", user);
      yield* TestClock.adjust("1 minute");
      expect(yield* homeWith(value)).toContain("Sign in with Google");
    }).pipe(Effect.provide(onApp)),
  );

  it.effect("refuses a sign-in cookie used as a session", () =>
    Effect.gen(function* () {
      const value = yield* sealed(SESSION_SECRET, "sign-in", {
        ...user,
        state: "s",
        nonce: "n",
        verifier: "v",
      });
      expect(yield* homeWith(value)).toContain("Sign in with Google");
    }).pipe(Effect.provide(onApp)),
  );
});
