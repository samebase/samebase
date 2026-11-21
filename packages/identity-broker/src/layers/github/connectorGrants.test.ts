// The connector grants (RFC 137 decision 10) through the GitHub layer's cards: the hub's
// administrator gives one connector to one repository while one owner owns it. The repository
// here is not on the allow-list, so every connector it uses is a grant's. A grant reaches a card
// when the layer writes the card: at its registration, its renewal (the RFC 7592 read), or the
// rewrite of an owner transfer; a stop is the immediate tool. The grant rows are written in a
// Store step (the moderation routes are out of scope).
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { pkce, txnCookie } from "../../core/testing/harness.ts";
import {
  createHub as createGithubHub,
  OWNER_ID,
  postHubClient,
  PRODUCTION_CALLBACK,
  pullRequestClaims,
  readNewClient,
  readOwnRecord,
  REPOSITORY_ID,
  signToken,
  stubProviders,
  type Hub,
  type NewClient,
} from "./testing/hub.ts";
import { setBlock, setExemption, setGrant } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The hub with `fake` and `other` and an empty allow-list: owner 65 has a grant of `fake`, and
 * owner 66 one of `fake` too, so `other` is the private connector that only its own grant opens.
 * The page is skipped for owner 65's cards unless `skipPage` is false.
 */
async function createHub(options: { skipPage?: boolean } = {}) {
  const h = await createGithubHub({ allowList: [] });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const ownerId of [OWNER_ID, "66"]) {
    setGrant(h.memory, { repositoryId: REPOSITORY_ID, ownerId, connector: "fake" }, true);
  }
  if (options.skipPage !== false) {
    setExemption(h.memory, { repositoryId: REPOSITORY_ID, ownerId: OWNER_ID }, true);
  }
  await stubProviders(h);
  return h;
}

const grant = (h: Hub, on: boolean, ownerId = OWNER_ID) =>
  setGrant(h.memory, { repositoryId: REPOSITORY_ID, ownerId, connector: "other" }, on);

/** A client of a run of `owner` (65 by default), proof issued now, enrolled in `connectors`. */
async function register(
  h: Hub,
  connectors: string[],
  claims: Record<string, unknown> = {},
): Promise<NewClient | Response> {
  const response = await postHubClient(h, await signToken(h, claims), { connectors });
  return response.status === 201 ? await readNewClient(response) : response;
}

/** `register` that must succeed. */
async function registered(h: Hub, connectors: string[], claims: Record<string, unknown> = {}) {
  const client = await register(h, connectors, claims);
  if (client instanceof Response) {
    throw new Error(`POST /register answered ${client.status}`);
  }
  return client;
}

/** A run of `owner` with a proof one second newer than the last: it transfers the repository. */
async function transfer(h: Hub, owner: string) {
  h.clock.advance(1_000);
  return await registered(h, ["fake"], { ...pullRequestClaims, repository_owner_id: owner });
}

/**
 * `/authorize` for the client with `connector` named: `provider` when it goes straight to the
 * provider, else the answer's status.
 */
async function signIn(h: Hub, client: NewClient, connector: string) {
  const { challenge, verifier } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: PRODUCTION_CALLBACK,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(connector === "" ? {} : { connector }),
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
async function finish(h: Hub, response: Response) {
  const upstream = new URL(response.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
  expect(back.status).toBe(302);
  return { back, location: new URL(back.headers.get("location") ?? "") };
}

const redeem = (h: Hub, client: NewClient, code: string, verifier: string) =>
  h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: PRODUCTION_CALLBACK,
    }).toString(),
  });

describe("the connector grants", () => {
  it("add a connector to the repository's clients that enroll in it, its previews included", async () => {
    const h = await createHub();
    const before = await registered(h, ["fake"]);
    // Without the grant, an enrollment in `other` is refused.
    const refused = await register(h, ["fake", "other"]);
    expect(refused instanceof Response && refused.status).toBe(400);
    grant(h, true);
    const after = await registered(h, ["fake", "other"]);
    expect((await signIn(h, after, "other")).went).toBe("provider");
    // A client enrolled before keeps its enrollment: the grant opens nothing it did not enroll in.
    expect(await readOwnRecord(h, before)).toBe(200);
    expect((await signIn(h, before, "other")).went).toBe("status 400");
    const preview = await registered(h, ["fake", "other"], pullRequestClaims);
    expect((await signIn(h, preview, "other")).went).toBe("provider");
  });

  it("bind a grant to the owner that registered the client, through transfers both ways", async () => {
    const h = await createHub();
    grant(h, true);
    const ownersClient = await registered(h, ["fake", "other"]);
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");
    // Owner 66 takes the repository: the transfer rewrites 65's card, whose grant no longer counts.
    await transfer(h, "66");
    expect((await signIn(h, ownersClient, "other")).went).toBe("status 400");
    // Owner 65 takes it back: the rewrite gives the card its grant again.
    await transfer(h, OWNER_ID);
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");
  });

  it("never let a client of another owner use a grant bound to the current owner", async () => {
    const h = await createHub();
    h.clock.advance(1_000);
    grant(h, true, "66");
    const sixtySixsClient = await registered(h, ["fake", "other"], {
      repository_owner_id: "66",
    });
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("status 200");
    // Owner 65 takes the repository, with a grant of its own.
    grant(h, true, OWNER_ID);
    await transfer(h, OWNER_ID);
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("status 400");
    const sixtyFivesClient = await registered(h, ["fake", "other"]);
    expect((await signIn(h, sixtyFivesClient, "other")).went).toBe("provider");
  });

  it("reach a card at its renewal when the grant goes; a stop holds at once", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await registered(h, ["fake", "other"]);
    grant(h, false);
    expect((await signIn(h, client, "other")).went).toBe("provider");
    expect(await readOwnRecord(h, client)).toBe(200);
    expect((await signIn(h, client, "other")).went).toBe("status 400");
    setBlock(h.memory, { kind: "repository", githubId: REPOSITORY_ID }, true);
    expect((await signIn(h, client, "fake")).went).toBe("status 403");
  });

  it("stop a sign-in at the provider's answer when a renewal drops its connector during it", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await registered(h, ["fake", "other"]);
    const { response, went } = await signIn(h, client, "other");
    expect(went).toBe("provider");
    grant(h, false);
    expect(await readOwnRecord(h, client)).toBe(200);
    const { back, location } = await finish(h, response);
    expect(location.origin + location.pathname).toBe(PRODUCTION_CALLBACK);
    expect(location.searchParams.get("code")).toBeNull();
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("error_description")).toBe(
      "Sign-in for this app is no longer available.",
    );
    expect(back.headers.get("set-cookie")).toMatch(/Max-Age=0$/);
    // The claim refused before the provider's code was spent.
    expect(
      h.fetch.requests.filter(
        (request) => request.method === "POST" && request.url.startsWith("https://upstream.test"),
      ),
    ).toEqual([]);
  });

  it("log a sign-in with the client and the card's ref, and the sign-in that a renewal turned off", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await registered(h, ["other"]);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // The registration's own line came before.
    info.mockClear();
    const { response, verifier } = await signIn(h, client, "other");
    const { location } = await finish(h, response);
    const exchanged = await redeem(h, client, location.searchParams.get("code") ?? "", verifier);
    expect(exchanged.status).toBe(200);
    grant(h, false);
    expect(await readOwnRecord(h, client)).toBe(200);
    expect((await signIn(h, client, "")).went).toBe("status 403");
    const line = (event: string, connector: string | null, reason: string | null) =>
      `hub_event ${JSON.stringify({ event, clientId: client.client_id, ref: `github:gh-${REPOSITORY_ID}`, connector, reason })}`;
    expect(info.mock.calls).toEqual([
      [line("sign_in", "other", null)],
      [line("sign_in_refused", null, "off")],
    ]);
  });

  it("refuse the code exchange when a renewal drops the connector after the code", async () => {
    const h = await createHub();
    grant(h, true);
    const client = await registered(h, ["fake", "other"]);
    const { response, verifier } = await signIn(h, client, "other");
    const code = (await finish(h, response)).location.searchParams.get("code") ?? "";
    expect(code).not.toBe("");
    grant(h, false);
    expect(await readOwnRecord(h, client)).toBe(200);
    const exchanged = await redeem(h, client, code, verifier);
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toEqual({
      error: "invalid_grant",
      error_description: "This client cannot finish this sign-in now.",
    });
  });

  it("skip no sign-in page: a grant and an exemption are separate", async () => {
    const h = await createHub({ skipPage: false });
    grant(h, true);
    const client = await registered(h, ["other"]);
    expect((await signIn(h, client, "other")).went).toBe("status 200");
  });
});
