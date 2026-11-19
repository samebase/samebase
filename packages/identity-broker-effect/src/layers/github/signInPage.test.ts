// The exemptions from the sign-in page (RFC 137 decision 5, as amended) through the GitHub
// layer's cards. The page shows for every card by default; a card skips it while an exemption row
// of the repository's current owner covers it and that owner registered the client. The row
// reaches a card when the layer writes the card: at its registration, its renewal, or an owner
// transfer's rewrite. Ported from packages/identity-broker/src/client/signInPage.test.ts; the rows
// are written in a Store step, because the moderation routes are out of scope (design section 9
// item 4).
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { pkce, txnCookie } from "../../core/testing/harness.ts";
import {
  createClient,
  createHub,
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
import { setBlock, setExemption } from "./testing/seeds.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * `/authorize` for the client with `fake` named, as an app's button sends it: `provider` when it
 * goes straight to the provider, `page` when the hub shows its page.
 */
async function signIn(h: Hub, client: NewClient) {
  const { challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: PRODUCTION_CALLBACK,
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

const exemption = (h: Hub, on: boolean, ownerId = OWNER_ID) =>
  setExemption(h.memory, { repositoryId: REPOSITORY_ID, ownerId }, on);

/** A client of a run whose proof is one second newer than the last, of `claims`. */
async function registerLater(h: Hub, claims: Record<string, unknown>) {
  h.clock.advance(1_000);
  await stubProviders(h);
  const response = await postHubClient(h, await signToken(h, claims));
  expect(response.status).toBe(201);
  return await readNewClient(response);
}

async function quietHub() {
  const h = await createHub();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  return h;
}

describe("the exemptions from the sign-in page", () => {
  it("change nothing while the table is empty", async () => {
    const h = await quietHub();
    const client = await createClient(h);
    expect((await signIn(h, client)).went).toBe("page");
  });

  it("reach the repository's cards at their next renewal, previews included, not other repositories'", async () => {
    const h = await quietHub();
    const production = await createClient(h);
    const preview = await registerLater(h, pullRequestClaims);
    const other = await createClient(h, { repository_id: "81" });
    exemption(h, true);
    expect((await signIn(h, production)).went).toBe("page");
    for (const client of [production, preview, other]) {
      expect(await readOwnRecord(h, client)).toBe(200);
    }
    expect((await signIn(h, production)).went).toBe("provider");
    expect((await signIn(h, preview)).went).toBe("provider");
    expect((await signIn(h, other)).went).toBe("page");
  });

  it("bind one repository's row to its current owner through transfers", async () => {
    const h = await quietHub();
    exemption(h, true);
    const ownersClient = await createClient(h);
    expect((await signIn(h, ownersClient)).went).toBe("provider");

    // The repository moves to owner 66: the transfer rewrites 65's card.
    const newOwnersClient = await registerLater(h, { repository_owner_id: "66" });
    expect((await signIn(h, ownersClient)).went).toBe("page");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");

    // The repository comes back to owner 65: the row counts again, not for 66's client.
    await registerLater(h, { repository_owner_id: OWNER_ID });
    expect((await signIn(h, ownersClient)).went).toBe("provider");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");
  });

  it("bind a row to the new owner when the admin sets it after a transfer", async () => {
    const h = await quietHub();
    exemption(h, true);
    await createClient(h);
    const newOwnersClient = await registerLater(h, { repository_owner_id: "66" });
    exemption(h, true, "66");
    expect(await readOwnRecord(h, newOwnersClient)).toBe(200);
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");
    // Removing the old owner's row leaves the new owner's.
    exemption(h, false, OWNER_ID);
    expect(await readOwnRecord(h, newOwnersClient)).toBe(200);
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");
  });

  it("let a sign-in that passed /authorize finish after its card shows the page again", async () => {
    const h = await quietHub();
    exemption(h, true);
    const client = await createClient(h);
    const { response, went } = await signIn(h, client);
    expect(went).toBe("provider");
    exemption(h, false);
    expect(await readOwnRecord(h, client)).toBe(200);
    const upstream = new URL(response.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(PRODUCTION_CALLBACK);
    expect(location.searchParams.get("code")).toEqual(expect.any(String));
    expect((await signIn(h, client)).went).toBe("page");
  });

  it("lose to a stop of the repository or of its owner", async () => {
    const h = await quietHub();
    exemption(h, true);
    const client = await createClient(h);
    for (const kind of ["repository", "owner"] as const) {
      const githubId = kind === "repository" ? REPOSITORY_ID : OWNER_ID;
      setBlock(h.memory, { kind, githubId }, true);
      expect((await signIn(h, client)).went).toBe("status 403");
      setBlock(h.memory, { kind, githubId }, false);
    }
    expect((await signIn(h, client)).went).toBe("provider");
  });

  it("cover every app and deployment of its repository registered after it", async () => {
    const h = await quietHub();
    exemption(h, true);
    const first = await createClient(h);
    const second = await postHubClient(h, await signToken(h), { software_id: "second" });
    expect(second.status).toBe(201);
    const clients = [first, await registerLater(h, pullRequestClaims), await readNewClient(second)];
    for (const client of clients) {
      expect((await signIn(h, client)).went).toBe("provider");
    }
  });
});
