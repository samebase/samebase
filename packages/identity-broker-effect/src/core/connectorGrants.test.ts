// The connector grants (RFC 137 decision 10) on the sign-in side: the hub's administrator adds a
// connector to what the policy gives one repository. The test hub's policy gives the operator's
// repository both connectors and every other repository `fake` alone, so `other` is the private
// connector that only a grant opens. Ported from
// packages/identity-broker/src/client/connectorGrants.test.ts; the grant rows are written in a Store
// step (the moderation routes are out of scope), and the registration cases are builder B2's.
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { PolicyFunction } from "./policy.ts";
import { sha256Hex } from "./subject.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  testRegistration,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";
import { setExemption, setGrant, setTenantOwner } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const REDIRECT_URI = "https://app.test/oauth/hub/callback";
const OPERATOR_REPOSITORY = "81";

const hubPolicy: PolicyFunction = (registration) => ({
  connectors: registration.repositoryId === OPERATOR_REPOSITORY ? ["fake", "other"] : ["fake"],
  resources: [],
  paused: false,
});

/** The hub with `fake` and `other`, both of the fake provider, and the page skipped. */
async function createHub(options: { skipPage?: boolean } = {}) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({
    fetch,
    config: {
      connectors: [connector, { ...connector, name: "other", label: "Other" }],
      registration: testRegistration(hubPolicy),
    },
  });
  if (options.skipPage !== false) {
    setExemption(h.memory, { scope: "every_app" }, true);
  }
  return h;
}

const grant = (h: Broker, on: boolean, ownerId = "65") =>
  setGrant(h.memory, { repositoryId: "1", ownerId, connector: "other" }, on);

type Client = { clientId: string; clientSecret: string };

/**
 * `/authorize` for the client with `connector` named: `provider` when it goes straight to the
 * provider, else the refusal's status.
 */
async function signIn(h: Broker, client: Client, connector: string) {
  const { challenge, verifier } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    connector,
  }).toString();
  const response = await h.fetchBroker(url);
  const location = response.headers.get("location");
  const went =
    response.status === 302 &&
    location !== null &&
    new URL(location).origin === "https://upstream.test"
      ? "provider"
      : `status ${response.status}`;
  return { response, went, verifier };
}

/** The provider's answer to a sign-in that went to it: the broker's redirect to the app. */
async function finish(h: Broker, response: Response) {
  const upstream = new URL(response.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
  expect(back.status).toBe(302);
  return { back, location: new URL(back.headers.get("location") ?? "") };
}

const redeem = (h: Broker, client: Client, code: string, verifier: string) =>
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

const enrolled = (h: Broker, args: { appName?: string; ownerId?: string } = {}) =>
  h.registerClient({
    appName: args.appName ?? "My app",
    redirectUri: REDIRECT_URI,
    connectors: ["fake", "other"],
    deploymentType: "production",
    ...(args.ownerId === undefined ? {} : { ownerId: args.ownerId }),
  });

describe("the connector grants", () => {
  it("add a connector to one repository's enrolled clients, its previews included", async () => {
    const h = await createHub();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const before = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      connectors: ["fake"],
    });
    const after = await enrolled(h);
    expect((await signIn(h, after, "other")).went).toBe("status 403");
    grant(h, true);
    expect((await signIn(h, after, "other")).went).toBe("provider");
    // A client enrolled before keeps its enrollment: the grant opens nothing it did not enroll in.
    expect((await signIn(h, before, "other")).went).toBe("status 400");
    const preview = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      connectors: ["fake", "other"],
      deploymentType: "preview",
    });
    expect((await signIn(h, preview, "other")).went).toBe("provider");
    const otherRepository = await h.registerClient({
      appName: "Other app",
      redirectUri: REDIRECT_URI,
      connectors: ["fake", "other"],
      repositoryId: "82",
    });
    expect((await signIn(h, otherRepository, "other")).went).toBe("status 403");
  });

  it("bind a grant to the recorded owner through transfers", async () => {
    const h = await createHub();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    grant(h, true);
    const ownersClient = await enrolled(h);
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");
    setTenantOwner(h.memory, "1", "66");
    expect((await signIn(h, ownersClient, "other")).went).toBe("status 403");
    setTenantOwner(h.memory, "1", "65");
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");
  });

  it("never let an old client of another owner use a grant bound to the recorded owner", async () => {
    const h = await createHub();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI, connectors: ["fake"] });
    setTenantOwner(h.memory, "1", "66");
    grant(h, true, "66");
    const sixtySixsClient = await enrolled(h, { ownerId: "66" });
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("provider");
    setTenantOwner(h.memory, "1", "65");
    grant(h, true, "65");
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("status 403");
    const sixtyFivesClient = await enrolled(h);
    expect((await signIn(h, sixtyFivesClient, "other")).went).toBe("provider");
  });

  it("stop a sign-in at the provider's answer when the grant goes during it", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await enrolled(h);
    const { response, went } = await signIn(h, client, "other");
    expect(went).toBe("provider");
    grant(h, false);
    const { back, location } = await finish(h, response);
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("code")).toBeNull();
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("error_description")).toBe(
      "Sign-in for this app is no longer available.",
    );
    expect(back.headers.get("set-cookie")).toMatch(/Max-Age=0$/);
    // The claim refused before the provider's code was spent.
    expect(h.fetch.requests.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("log a sign-in with its connector, and the sign-in that the revoked grant turns off", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await enrolled(h);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { response, verifier } = await signIn(h, client, "other");
    const { location } = await finish(h, response);
    const exchanged = await redeem(h, client, location.searchParams.get("code") ?? "", verifier);
    expect(exchanged.status).toBe(200);
    grant(h, false);
    expect((await signIn(h, client, "other")).went).toBe("status 403");
    const line = (event: string, connector: string | null, reason: string | null) =>
      `hub_event ${JSON.stringify({ event, repository: "octo-org/octo-repo", app: "my-app", deployment: "production", connector, reason })}`;
    expect(info.mock.calls).toEqual([
      [line("sign_in", "other", null)],
      [line("sign_in_refused", null, "off")],
    ]);
  });

  it("refuse the code exchange when the grant goes after the code", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await enrolled(h);
    const { response, verifier } = await signIn(h, client, "other");
    const code = (await finish(h, response)).location.searchParams.get("code") ?? "";
    expect(code).not.toBe("");
    grant(h, false);
    const exchanged = await redeem(h, client, code, verifier);
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toEqual({
      error: "invalid_grant",
      error_description: "This client cannot sign in through that connector.",
    });
  });

  it("refuse the exchange of a code once its connector leaves the hub's configuration", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await enrolled(h);
    const { response, verifier } = await signIn(h, client, "other");
    const code = (await finish(h, response)).location.searchParams.get("code") ?? "";
    // The hub's configuration drops `other`: the grant row stays, and the policy may still list it.
    for (const policyConnectors of [["fake"], ["fake", "other"]]) {
      const exchanged = h.memory.run("authRequests.exchangeCode", {
        clientId: client.clientId,
        clientSecretHash: await sha256Hex(client.clientSecret),
        tokenEndpointAuthMethod: "client_secret_post",
        codeHash: await sha256Hex(code),
        redirectUri: REDIRECT_URI,
        codeChallengeOfVerifier: await calculatePKCECodeChallenge(verifier),
        policy: {
          ownerId: "65",
          paused: false,
          connectors: policyConnectors,
          configured: ["fake"],
        },
        now: h.clock.now(),
      });
      expect(exchanged).toMatchObject({ ok: false, error: "invalid_grant" });
    }
  });

  it("store and offer only what the grants allow when the request is created", async () => {
    const h = await createHub({ skipPage: false });
    grant(h, true);
    const client = await enrolled(h);
    const app = h.memory.run("clients.withApp", { clientId: client.clientId })?.app;
    // The caller read the grant; it was revoked before the request was created.
    grant(h, false);
    const create = (requestId: string, connectors: string[]) =>
      h.memory.run("authRequests.create", {
        tenantId: "gh-1",
        requestId,
        appId: app?.appId ?? "",
        clientId: client.clientId,
        redirectUri: REDIRECT_URI,
        scope: "openid",
        codeChallenge: "c",
        connectors,
        policy: {
          ownerId: "65",
          paused: false,
          connectors: ["fake"],
          configured: ["fake", "other"],
        },
        freshLogin: false,
        txnCookieHash: "cookie-hash",
        createdAt: h.clock.now(),
        expiresAt: h.clock.now() + 600_000,
      });
    expect(create("r1", ["fake", "other"])).toEqual({ ok: true, connectors: ["fake"] });
    expect(h.memory.run("authRequests.get", { requestId: "r1" })).toMatchObject({
      connectors: ["fake"],
    });
    expect(create("r2", ["other"])).toEqual({ ok: false, error: "off" });
    expect(h.memory.run("authRequests.get", { requestId: "r2" })).toBeNull();
  });

  it("skip no sign-in page: a grant and an exemption are separate", async () => {
    const h = await createHub({ skipPage: false });
    grant(h, true);
    const client = await enrolled(h);
    expect((await signIn(h, client, "other")).went).toBe("status 200");
  });
});
