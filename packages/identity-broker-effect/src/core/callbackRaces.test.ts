// The callback while the provider's answer is held (design section 12): the only usable connector
// is revoked, or the request's or the code's expiry passes, between the claim and the completion.
// Expiry uses the callback's entry time, as in the Convex broker.
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { PolicyFunction } from "./policy.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  testRegistration,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";
import { setExemption, setGrant } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const REDIRECT_URI = "https://app.test/oauth/hub/callback";
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

/** The policy gives `fake` alone; `other` is open only through a grant. */
const policy: PolicyFunction = () => ({ connectors: ["fake"], resources: [], paused: false });

/**
 * A hub whose provider runs `during` while it holds its token answer: after the claim, before
 * the completion. The client is enrolled in `connectors`.
 */
async function heldSignIn(args: { connector: string; during: (h: Broker) => void }) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({
    fetch,
    config: {
      connectors: [connector, { ...connector, name: "other", label: "Other" }],
      registration: testRegistration(policy),
    },
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  setExemption(h.memory, { scope: "every_app" }, true);
  setGrant(h.memory, { repositoryId: "1", ownerId: "65", connector: "other" }, true);
  const client = await h.registerClient({
    appName: "My app",
    redirectUri: REDIRECT_URI,
    connectors: [args.connector],
  });
  const { challenge, verifier } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const started = await h.fetchBroker(url);
  expect(started.status).toBe(302);
  const upstream = new URL(started.headers.get("location") ?? "");
  const requestId = (started.headers.get("set-cookie") ?? "").split("=")[0]?.slice(18) ?? "";
  let held = 0;
  h.fetch.plan({
    match: (request) => request.url === "https://upstream.test/token",
    respond: async (request) => {
      held += 1;
      args.during(h);
      const body = new URLSearchParams(await request.text());
      return body.get("code") === "upstream-code"
        ? Response.json({ access_token: "up-access", token_type: "bearer" })
        : Response.json({ error: "invalid_grant" }, { status: 400 });
    },
  });
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  expect(held).toBe(1);
  return { h, client, verifier, back, requestId };
}

const redeem = (
  h: Broker,
  client: { clientId: string; clientSecret: string },
  code: string,
  verifier: string,
) =>
  h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

test("a held provider answer while the only usable connector is revoked ends in the exact refusal", async () => {
  const { h, back, requestId } = await heldSignIn({
    connector: "other",
    during: (hub) =>
      setGrant(hub.memory, { repositoryId: "1", ownerId: "65", connector: "other" }, false),
  });
  expect(back.status).toBe(302);
  const location = new URL(back.headers.get("location") ?? "");
  expect(location.origin + location.pathname).toBe(REDIRECT_URI);
  expect([...location.searchParams]).toEqual([
    ["error", "access_denied"],
    ["error_description", "Sign-in for this app is no longer available."],
    ["state", "client-state"],
    ["iss", h.issuer],
  ]);
  expect(back.headers.get("set-cookie")).toBe(
    `__Host-broker_txn_${requestId}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
  // The refusal deleted the request, and no code exists.
  expect(h.memory.run("authRequests.get", { requestId })).toBeNull();
  expect(h.memory.db.contents().authorizationCodes).toEqual([]);
});

test("a held provider answer across the request's expiry edge completes: expiry uses the callback's entry time", async () => {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({ fetch, config: { connectors: [connector] } });
  const client = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
  const signIn = async () => {
    const { challenge, verifier } = await pkce();
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
    return { started, callback, verifier };
  };
  let during = () => {};
  h.fetch.plan({
    match: (request) => request.url === "https://upstream.test/token",
    respond: () => {
      during();
      return Response.json({ access_token: "up-access", token_type: "bearer" });
    },
  });

  // Entry one second before the expiry, the answer two seconds after it: a code, at entry time.
  const crossing = await signIn();
  h.clock.advance(AUTH_REQUEST_TTL_MS - 1_000);
  during = () => h.clock.advance(2_000);
  const completed = await h.fetchBroker(crossing.callback, {
    headers: txnCookie(crossing.started),
  });
  const code = new URL(completed.headers.get("location") ?? "").searchParams.get("code") ?? "";
  expect(code).not.toBe("");
  expect((await redeem(h, client, code, crossing.verifier)).status).toBe(200);

  // Entry at the expiry: refused at the claim, and the provider is not asked.
  const expired = await signIn();
  h.clock.advance(AUTH_REQUEST_TTL_MS);
  let asked = false;
  during = () => {
    asked = true;
  };
  const refused = await h.fetchBroker(expired.callback, { headers: txnCookie(expired.started) });
  const location = new URL(refused.headers.get("location") ?? "");
  expect(location.searchParams.get("error")).toBe("access_denied");
  expect(location.searchParams.get("error_description")).toBe("The sign-in expired.");
  expect(location.searchParams.get("code")).toBeNull();
  expect(asked).toBe(false);
});

test("a held provider answer that crosses the code's lifetime gives a code that is already expired", async () => {
  const { h, client, verifier, back } = await heldSignIn({
    connector: "fake",
    during: (hub) => hub.clock.advance(60_000),
  });
  const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
  // The code's 60 seconds started at the callback's entry, and the provider used all of them.
  expect(code).not.toBe("");
  expect(await (await redeem(h, client, code, verifier)).json()).toEqual({
    error: "invalid_grant",
    error_description: "The authorization code expired.",
  });
});
