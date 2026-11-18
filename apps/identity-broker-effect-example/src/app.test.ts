// The example app against the hub's real core (packages/identity-broker-effect) on the memory
// Store, with no network: the hub registers the app's client after it reads the app's own
// verification file, then a browser signs in through the hub's page and a fake Google.
import { describe, expect, it } from "vite-plus/test";
import { registrationRoutes } from "../../../packages/identity-broker-effect/src/core/hub/routes.ts";
import {
  pullRequestClaims,
  readNewClient,
  signToken,
  stubProviders,
} from "../../../packages/identity-broker-effect/src/core/hub/testing/hub.ts";
import {
  createBroker,
  fakeOidcUpstream,
  stubFetch,
  testRegistration,
} from "../../../packages/identity-broker-effect/src/core/testing/harness.ts";
import { handle, type Env } from "./app.ts";
import { seal } from "./signed.ts";

const HUB = "https://hub.example.com";
const APP = "https://identity-broker-effect-example-pr-1.pfp.workers.dev";
const REPOSITORY_ID = "1021726325";
const SESSION_SECRET = "test-session-secret";

/** A browser's cookies, by origin: enough for `__Host-` cookies with Path=/. */
function cookieJar() {
  const jar = new Map<string, Map<string, string>>();
  return {
    header(url: string): Record<string, string> {
      const cookies = jar.get(new URL(url).origin) ?? new Map<string, string>();
      return cookies.size === 0
        ? {}
        : { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") };
    },
    store(url: string, response: Response) {
      const origin = new URL(url).origin;
      const cookies = jar.get(origin) ?? new Map<string, string>();
      jar.set(origin, cookies);
      for (const line of response.headers.getSetCookie()) {
        const [pair = "", ...attributes] = line.split(";");
        const [name = "", ...value] = pair.split("=");
        if (attributes.some((attribute) => attribute.trim() === "Max-Age=0")) {
          cookies.delete(name);
        } else {
          cookies.set(name, value.join("="));
        }
      }
    },
  };
}

/** The test hub of the deploy: Google only, and only for this repository. */
async function createTestHub() {
  const fetch = stubFetch();
  const google = await fakeOidcUpstream(fetch);
  const broker = await createBroker({
    fetch,
    config: {
      issuer: HUB,
      connectors: [{ ...google.connector, name: "google", provider: "google", label: "Google" }],
      registration: testRegistration((registration) => ({
        connectors: registration.repositoryId === REPOSITORY_ID ? ["google"] : [],
        resources: [],
        paused: false,
      })),
    },
    registerRoutes: registrationRoutes,
  });
  // The app checks the ID token's times against the real clock.
  broker.clock.set(Date.now());
  return { ...broker, google, rows: () => broker.memory.db.contents() };
}

/** The app's request handler, with every hub request served by `hub`. */
function appOn(hub: Awaited<ReturnType<typeof createTestHub>>, env: Env) {
  const hubRequests: string[] = [];
  const app = (request: Request) =>
    handle(request, env, async (hubRequest) => {
      const url = new URL(hubRequest.url);
      hubRequests.push(`${hubRequest.method} ${url.origin}${url.pathname}`);
      return await hub.fetchBroker(hubRequest.url, {
        method: hubRequest.method,
        headers: hubRequest.headers,
        body: hubRequest.method === "GET" ? null : await hubRequest.text(),
      });
    });
  return { app, hubRequests };
}

/**
 * `POST /register` as IdentityHub.Client sends it from a pull request's run, with the run's
 * GitHub token for this repository.
 */
async function registerPreviewClient(hub: Awaited<ReturnType<typeof createTestHub>>) {
  const token = await signToken(hub, {
    ...pullRequestClaims,
    aud: HUB,
    repository_id: REPOSITORY_ID,
  });
  return await hub.fetchBroker(`${HUB}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [`${APP}/callback`],
      software_id: "apps/identity-broker-effect-example",
      software_version: "test",
      connectors: ["google"],
      token_endpoint_auth_method: "client_secret_post",
    }),
  });
}

const offEnv: Env = {
  IDENTITY_HUB_ISSUER: "http://127.0.0.1:1",
  IDENTITY_HUB_CLIENT_ID: "no-hub",
  IDENTITY_HUB_CLIENT_SECRET: "no-hub",
  SESSION_SECRET,
  REPOSITORY_ID,
};

describe("sign-in through the hub", () => {
  it("registers on the app's verification file, signs in with Google, and shows the subject", async () => {
    const hub = await createTestHub();
    // The hub reads /samebase-verification.json from the app itself.
    const verificationRequests: string[] = [];
    let env: Env = offEnv;
    await stubProviders(hub, async (request) => {
      verificationRequests.push(request.url);
      return await handle(request, env, () => Promise.reject(new Error("no hub call expected")));
    });

    const registered = await registerPreviewClient(hub);
    expect(registered.status).toBe(201);
    expect(verificationRequests).toEqual([`${APP}/samebase-verification.json`]);
    const client = await readNewClient(registered);
    env = {
      IDENTITY_HUB_ISSUER: HUB,
      IDENTITY_HUB_CLIENT_ID: client.client_id,
      IDENTITY_HUB_CLIENT_SECRET: client.client_secret,
      SESSION_SECRET,
      REPOSITORY_ID,
    };
    const { app, hubRequests } = appOn(hub, env);
    const browser = cookieJar();
    const get = async (url: string) => {
      const response = url.startsWith(APP)
        ? await app(new Request(url, { headers: browser.header(url) }))
        : await hub.fetchBroker(url, { headers: browser.header(url) });
      browser.store(url, response);
      return response;
    };

    const signedOut = await get(`${APP}/`);
    expect(await signedOut.text()).toContain('<a href="/login">Sign in with Google</a>');

    // The app sends the browser to the hub.
    const login = await get(`${APP}/login`);
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

    // The hub's sign-in page asks for consent; the user continues with Google.
    const consent = await get(authorize.href);
    expect(consent.status).toBe(200);
    const continueHref = /href="([^"]*\/continue\?[^"]*)"/.exec(await consent.text())?.[1];
    expect(continueHref).toBeDefined();
    const toGoogle = await get(new URL((continueHref ?? "").replaceAll("&amp;", "&"), HUB).href);
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
    const back = await get(hubCallback.href);
    expect(back.status).toBe(302);
    const appCallback = new URL(back.headers.get("location") ?? "");
    expect(`${appCallback.origin}${appCallback.pathname}`).toBe(`${APP}/callback`);
    expect(appCallback.searchParams.get("iss")).toBe(HUB);

    // The app exchanges the code and starts its session.
    const done = await get(appCallback.href);
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe("/");
    expect(hubRequests).toContain(`POST ${HUB}/token`);
    expect(hubRequests).toContain(`GET ${HUB}/.well-known/jwks.json`);

    const signedIn = await (await get(`${APP}/`)).text();
    expect(signedIn).toContain("<dt>Subject</dt><dd>google:24400320</dd>");
    expect(signedIn).toContain('<a href="/logout">Sign out</a>');
    expect(hub.rows().signIns.map((row) => row.sub)).toEqual(["google:24400320"]);

    // A second use of the same answer is refused: the sign-in cookie is gone.
    const replay = await get(appCallback.href);
    expect(replay.status).toBe(400);
    expect(await replay.text()).not.toContain(appCallback.searchParams.get("code") ?? "");

    const logout = await get(`${APP}/logout`);
    expect(logout.status).toBe(302);
    expect(await (await get(`${APP}/`)).text()).toContain("Sign in with Google");
  });

  it.each([
    ["the state of another sign-in", "other", HUB],
    ["another issuer", undefined, "https://evil.example.com"],
    ["no issuer", undefined, undefined],
  ])("refuses an answer with %s, and shows no code", async (_, state, iss) => {
    const hub = await createTestHub();
    const { app, hubRequests } = appOn(hub, {
      ...offEnv,
      IDENTITY_HUB_ISSUER: HUB,
      IDENTITY_HUB_CLIENT_ID: "cl_x",
    });
    const login = await app(new Request(`${APP}/login`));
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const callback = new URL(`${APP}/callback`);
    callback.searchParams.set("code", "secret-code");
    callback.searchParams.set(
      "state",
      state ?? new URL(login.headers.get("location") ?? "").searchParams.get("state") ?? "",
    );
    if (iss !== undefined) callback.searchParams.set("iss", iss);

    const response = await app(new Request(callback, { headers: { Cookie: cookie } }));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain("secret-code");
    expect(hubRequests).not.toContain(`POST ${HUB}/token`);
  });
});

describe("the off configuration", () => {
  it("shows no sign-in link and refuses /login", async () => {
    const page = await handle(new Request(`${APP}/`), offEnv, () =>
      Promise.reject(new Error("no hub call expected")),
    );
    const text = await page.text();
    expect(text).toContain("Sign-in is not configured.");
    expect(text).not.toContain("/login");

    const login = await handle(new Request(`${APP}/login`), offEnv, () =>
      Promise.reject(new Error("no hub call expected")),
    );
    expect(login.status).toBe(503);
  });

  it("still serves the verification file", async () => {
    const response = await handle(new Request(`${APP}/samebase-verification.json`), offEnv, () =>
      Promise.reject(new Error("no hub call expected")),
    );
    expect(await response.json()).toEqual({ repository: REPOSITORY_ID });
  });
});

describe("the session cookie", () => {
  const onEnv: Env = { ...offEnv, IDENTITY_HUB_ISSUER: HUB, IDENTITY_HUB_CLIENT_ID: "cl_x" };
  const homeWith = async (value: string) => {
    const response = await handle(
      new Request(`${APP}/`, { headers: { Cookie: `__Host-session=${value}` } }),
      onEnv,
      () => Promise.reject(new Error("no hub call expected")),
    );
    return await response.text();
  };
  const session = (secret: string, exp: number, sub = "google:1") =>
    seal(secret, "session", { sub, name: "<b>Ada</b>" }, exp);

  it("shows a valid session, escaped", async () => {
    const text = await homeWith(await session(SESSION_SECRET, Date.now() + 60_000));
    expect(text).toContain("<dd>google:1</dd>");
    expect(text).toContain("<dd>&lt;b&gt;Ada&lt;/b&gt;</dd>");
  });

  it("refuses a value signed with another secret", async () => {
    expect(await homeWith(await session("other-secret", Date.now() + 60_000))).toContain(
      "Sign in with Google",
    );
  });

  it("refuses a changed payload", async () => {
    const [, mac] = (await session(SESSION_SECRET, Date.now() + 60_000)).split(".");
    const [forged] = (await session("other-secret", Date.now() + 60_000, "google:2")).split(".");
    expect(await homeWith(`${forged}.${mac}`)).toContain("Sign in with Google");
  });

  it("refuses an expired session", async () => {
    expect(await homeWith(await session(SESSION_SECRET, Date.now() - 1))).toContain(
      "Sign in with Google",
    );
  });

  it("refuses a sign-in cookie used as a session", async () => {
    const value = await seal(
      SESSION_SECRET,
      "sign-in",
      { sub: "google:1", state: "s", nonce: "n", verifier: "v" },
      Date.now() + 60_000,
    );
    expect(await homeWith(value)).toContain("Sign in with Google");
  });
});
