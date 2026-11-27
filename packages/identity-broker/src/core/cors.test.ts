// CORS through the real router: a page's script on another origin reads every answer of discovery,
// the JWKS, `/token` and `/userinfo`, errors too, and no other route allows it.
import { Effect, Schema } from "effect";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { Part } from "./router.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";

const REDIRECT_URI = "https://app.test/auth/callback";
const ORIGIN = { Origin: "https://page.test" };

afterEach(() => {
  vi.restoreAllMocks();
});

const allowOrigin = (response: Response) => response.headers.get("access-control-allow-origin");

/** A broker with the fake provider and one card; `part` stands for integrations. */
async function corsBroker(part?: Part) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({
    fetch,
    config: { connectors: [connector] },
    ...(part === undefined ? {} : { part }),
  });
  const client = await h.registerClient({ appName: "app", redirectUri: REDIRECT_URI });
  return { h, client };
}

/** The access token of one completed sign-in. */
async function accessToken(h: Broker, client: { clientId: string; clientSecret: string }) {
  const { verifier, challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const started = await h.fetchBroker(url);
  const upstream = new URL(started.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
  const tokens = await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  expect(tokens.status).toBe(200);
  expect(allowOrigin(tokens)).toBe("*");
  return Schema.decodeUnknownSync(Schema.Struct({ access_token: Schema.String }))(
    await tokens.json(),
  ).access_token;
}

test("discovery and the JWKS allow any origin, on success and on error", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { h } = await corsBroker();
  for (const path of [
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
    "/.well-known/jwks.json",
  ]) {
    const response = await h.fetchBroker(`${h.issuer}${path}`, { headers: ORIGIN });
    expect([path, response.status, allowOrigin(response)]).toEqual([path, 200, "*"]);
  }

  h.keys.set(undefined);
  const jwks = await h.fetchBroker(`${h.issuer}/.well-known/jwks.json`, { headers: ORIGIN });
  expect([jwks.status, allowOrigin(jwks)]).toEqual([500, "*"]);

  const failing = await corsBroker({
    routes: [],
    authorize: () => Effect.die(new Error("unused")),
    token: () => Effect.succeed(undefined),
    metadata: () => {
      throw new Error("discovery fails");
    },
  });
  const discovery = await failing.h.fetchBroker(
    `${failing.h.issuer}/.well-known/openid-configuration`,
    { headers: ORIGIN },
  );
  expect([discovery.status, allowOrigin(discovery)]).toEqual([500, "*"]);
});

test("/token and /userinfo allow any origin, on success and on error, with no credentials", async () => {
  const { h, client } = await corsBroker();
  const token = await accessToken(h, client);

  const userinfo = await h.fetchBroker(`${h.issuer}/userinfo`, {
    headers: { ...ORIGIN, Authorization: `Bearer ${token}` },
  });
  expect([userinfo.status, allowOrigin(userinfo)]).toEqual([200, "*"]);
  expect(userinfo.headers.get("access-control-allow-credentials")).toBeNull();

  const refused = await h.fetchBroker(`${h.issuer}/userinfo`, {
    method: "POST",
    headers: { ...ORIGIN, Authorization: "Bearer not-a-token" },
  });
  expect([refused.status, allowOrigin(refused)]).toEqual([401, "*"]);

  const invalidGrant = await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { ...ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: "used-or-unknown",
      code_verifier: "x".repeat(43),
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  expect([invalidGrant.status, allowOrigin(invalidGrant)]).toEqual([400, "*"]);
  expect(await invalidGrant.json()).toMatchObject({ error: "invalid_grant" });
});

test("a preflight of /token or /userinfo answers 204 with the route's methods", async () => {
  const { h } = await corsBroker();
  for (const [path, methods] of [
    ["/token", "POST"],
    ["/userinfo", "GET, POST"],
  ]) {
    const response = await h.fetchBroker(`${h.issuer}${path}`, {
      method: "OPTIONS",
      headers: {
        ...ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "access-control-allow-origin": "*",
      "access-control-allow-methods": methods,
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-max-age": "86400",
    });
  }
});

test("/authorize sends no CORS header", async () => {
  const { h, client } = await corsBroker();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({ client_id: client.clientId }).toString();
  const response = await h.fetchBroker(url, { headers: ORIGIN });
  expect(allowOrigin(response)).toBeNull();
  const preflight = await h.fetchBroker(url, { method: "OPTIONS", headers: ORIGIN });
  expect([preflight.status, allowOrigin(preflight)]).toEqual([404, null]);
});
