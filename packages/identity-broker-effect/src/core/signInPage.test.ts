// The exemptions from the sign-in page (RFC 137 decision 5, as amended), on the sign-in side. In
// hub mode the page shows for every client by default, so each skip below comes from an exemption
// row. Ported from packages/identity-broker/src/client/signInPage.test.ts; the rows are written in
// a Store step, because the moderation routes are out of scope (design section 9 item 4).
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Policy, PolicyFunction } from "./policy.ts";
import {
  createBroker,
  fakeUpstream,
  pkce,
  stubFetch,
  testRegistration,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";
import { setBlock, setExemption, setTenantOwner } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const REDIRECT_URI = "https://app.test/oauth/hub/callback";

/** The hub with the fake connector and `policy`, which gives `fake` to every repository. */
async function createHub(policy: PolicyFunction = () => testPolicy()) {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  return await createBroker({
    fetch,
    config: { connectors: [connector], registration: testRegistration(policy) },
  });
}

const testPolicy = (overrides: Partial<Policy> = {}): Policy => ({
  connectors: ["fake"],
  resources: [],
  paused: false,
  ...overrides,
});

type Client = { clientId: string };

/**
 * `/authorize` for the client with the one connector named, as an app's button sends it:
 * `provider` when it goes straight to the provider, `page` when the hub shows its page.
 */
async function signIn(h: Broker, client: Client) {
  const { challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    connector: "fake",
  }).toString();
  const response = await h.fetchBroker(url);
  const location = response.headers.get("location");
  const went =
    response.status === 302 &&
    location !== null &&
    new URL(location).origin === "https://upstream.test"
      ? "provider"
      : response.status === 200
        ? "page"
        : `status ${response.status}`;
  return { response, went };
}

const oneRepository = (h: Broker, on: boolean, ownerId = "65", repositoryId = "1") =>
  setExemption(h.memory, { scope: "repository", repositoryId, ownerId }, on);
const everyApp = (h: Broker, on: boolean) => setExemption(h.memory, { scope: "every_app" }, on);

describe("the exemptions from the sign-in page", () => {
  it("change nothing while the table is empty", async () => {
    const h = await createHub();
    const client = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    expect((await signIn(h, client)).went).toBe("page");
  });

  it("skip the page for one repository's clients, its previews included, not for others", async () => {
    const h = await createHub();
    const production = await h.registerClient({
      appName: "App",
      redirectUri: REDIRECT_URI,
      deploymentType: "production",
    });
    const preview = await h.registerClient({
      appName: "App",
      redirectUri: REDIRECT_URI,
      deploymentType: "preview",
    });
    const other = await h.registerClient({
      appName: "Other",
      redirectUri: REDIRECT_URI,
      repositoryId: "81",
    });
    oneRepository(h, true);
    expect((await signIn(h, production)).went).toBe("provider");
    expect((await signIn(h, preview)).went).toBe("provider");
    expect((await signIn(h, other)).went).toBe("page");
  });

  it("skip the page for every app, new ones included, until the switch is off", async () => {
    const h = await createHub();
    const before = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    everyApp(h, true);
    const after = await h.registerClient({
      appName: "Other",
      redirectUri: REDIRECT_URI,
      repositoryId: "81",
    });
    expect((await signIn(h, before)).went).toBe("provider");
    expect((await signIn(h, after)).went).toBe("provider");
    everyApp(h, false);
    expect((await signIn(h, before)).went).toBe("page");
  });

  it("bind one repository's row to its recorded owner through transfers", async () => {
    const h = await createHub();
    const ownersClient = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    oneRepository(h, true);
    expect((await signIn(h, ownersClient)).went).toBe("provider");

    // The repository moves to owner 66, which the hub learns at its next registration.
    setTenantOwner(h.memory, "1", "66");
    const newOwnersClient = await h.registerClient({
      appName: "App",
      redirectUri: REDIRECT_URI,
      ownerId: "66",
    });
    expect((await signIn(h, ownersClient)).went).toBe("page");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");

    // The repository comes back to owner 65: the row counts again, not for 66's old client.
    setTenantOwner(h.memory, "1", "65");
    expect((await signIn(h, ownersClient)).went).toBe("provider");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");
  });

  it("bind a row to the new owner when the admin sets it again after a transfer", async () => {
    const h = await createHub();
    await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    oneRepository(h, true);
    setTenantOwner(h.memory, "1", "66");
    const newOwnersClient = await h.registerClient({
      appName: "App",
      redirectUri: REDIRECT_URI,
      ownerId: "66",
    });
    oneRepository(h, true, "66");
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");
    // Removing the old owner's row leaves the new owner's.
    oneRepository(h, false, "65");
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");
  });

  it("let a sign-in that passed /authorize finish after the row goes", async () => {
    const h = await createHub();
    const client = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    oneRepository(h, true);
    const { response, went } = await signIn(h, client);
    expect(went).toBe("provider");
    oneRepository(h, false);
    const upstream = new URL(response.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("code")).toEqual(expect.any(String));
    expect((await signIn(h, client)).went).toBe("page");
  });

  it("lose to a block and to the pause", async () => {
    let paused = false;
    const h = await createHub(() => testPolicy({ paused }));
    const client = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    everyApp(h, true);
    setBlock(h.memory, { kind: "repository", githubId: "1" }, true);
    expect((await signIn(h, client)).went).toBe("status 403");
    setBlock(h.memory, { kind: "repository", githubId: "1" }, false);
    setBlock(h.memory, { kind: "owner", githubId: "65" }, true);
    expect((await signIn(h, client)).went).toBe("status 403");
    setBlock(h.memory, { kind: "owner", githubId: "65" }, false);
    paused = true;
    expect((await signIn(h, client)).went).toBe("status 503");
    paused = false;
    expect((await signIn(h, client)).went).toBe("provider");
  });

  it("show the page by default for every hub client, whatever its policy decides", async () => {
    // The policy decides connectors and the pause; it has no say in the page.
    const h = await createHub((registration) =>
      testPolicy({ resources: registration.repositoryId === "82" ? ["cloudflare"] : [] }),
    );
    const client = await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI });
    const own = await h.registerClient({
      appName: "Own",
      redirectUri: REDIRECT_URI,
      repositoryId: "82",
    });
    expect((await signIn(h, client)).went).toBe("page");
    expect((await signIn(h, own)).went).toBe("page");
    oneRepository(h, true);
    expect((await signIn(h, client)).went).toBe("provider");
    expect((await signIn(h, own)).went).toBe("page");
  });

  it("cover every app and deployment of its repository", async () => {
    const h = await createHub();
    const clients = [
      await h.registerClient({
        appName: "App",
        redirectUri: REDIRECT_URI,
        deploymentType: "preview",
      }),
      await h.registerClient({ appName: "App", redirectUri: REDIRECT_URI }),
      await h.registerClient({ appName: "Second", redirectUri: REDIRECT_URI }),
    ];
    for (const client of clients) {
      expect((await signIn(h, client)).went).toBe("page");
    }
    oneRepository(h, true);
    for (const client of clients) {
      expect((await signIn(h, client)).went).toBe("provider");
    }
  });
});
