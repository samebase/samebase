// The moderation API through the typed client that its declaration gives (api.ts), against a broker
// on the memory host: what a dashboard does with it, and what reaches the cards.
import { Config, Effect, Redacted } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createBroker, pkce } from "../core/testing/harness.ts";
import { repositoryStop } from "../layers/github/clients.ts";
import { github } from "../layers/github/routes.ts";
import {
  createClient,
  createGithubBroker,
  OWNER_ID,
  PRODUCTION_CALLBACK,
  REPOSITORY_ID,
  type GithubBroker,
} from "../layers/github/testing/broker.ts";
import {
  InvalidToken,
  ModerationApi,
  ModerationKey,
  OwnerChanged,
  UnknownConnector,
} from "./api.ts";
import { moderation } from "./server.ts";

const KEY = "moderation-key";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A broker whose moderation key is `KEY`, and the GitHub layer's allow-list `allowList`. */
const moderatedBroker = (allowList: Parameters<typeof createGithubBroker>[0] = {}) =>
  createGithubBroker({
    ...allowList,
    moderation: moderation({ key: Config.succeed(Redacted.make(KEY)) }),
  });

/** The typed client of the declaration, with `key` as its Bearer token, over the broker's fetch. */
const clientOf = (h: GithubBroker, key = KEY) =>
  Effect.runPromise(
    HttpApiClient.make(ModerationApi, { baseUrl: h.issuer }).pipe(
      Effect.provide(
        HttpApiMiddleware.layerClient(ModerationKey, ({ next, request }) =>
          next(HttpClientRequest.bearerToken(request, key)),
        ),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
        h.fetchBroker(new Request(input, init)),
      ),
    ),
  );

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

/** The card of `clientId` as the store holds it. */
const cardOf = (h: GithubBroker, clientId: string) =>
  h.rows().clients.find((card) => card.clientId === clientId);

/** `/authorize` with `fake` named: `provider`, `page`, or the status of a refusal. */
async function authorize(h: GithubBroker, clientId: string) {
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: PRODUCTION_CALLBACK,
    response_type: "code",
    scope: "openid",
    code_challenge: (await pkce()).challenge,
    code_challenge_method: "S256",
    connector: "fake",
  }).toString();
  const response = await h.fetchBroker(url);
  return response.status === 302
    ? "provider"
    : response.status === 200
      ? "page"
      : `status ${response.status}`;
}

test("every endpoint through the typed client", async () => {
  // An owner entry with no repository covers every repository of that owner.
  const h = await moderatedBroker({ allowList: [{ ownerId: OWNER_ID }] });
  const registered = await createClient(h);
  const { moderation: api } = await clientOf(h);

  expect(await run(api.counts())).toEqual({
    day: { count: 1, atLeast: false },
    week: { count: 1, atLeast: false },
  });

  const listed = {
    clientId: registered.client_id,
    clientName: "prod",
    deploymentType: "production",
    ownerId: OWNER_ID,
    connectors: ["fake"],
    signInPage: "shown",
    policyConnectors: ["fake", "other"],
    usableConnectors: ["fake"],
    grantedConnectors: [],
  };
  expect((await run(api.clients({ query: {} }))).clients).toMatchObject([listed]);
  expect(await run(api.clients({ query: { owner: OWNER_ID } }))).toMatchObject({
    owner: OWNER_ID,
    clients: [listed],
    limitReached: false,
  });
  expect((await run(api.clients({ query: { owner: "66" } }))).clients).toEqual([]);

  const block = {
    action: "block",
    kind: "repository",
    githubId: "75",
    reason: "Spam",
    adminEmail: "admin@example.com",
  } as const;
  expect(await run(api.changeBlock({ payload: block }))).toEqual({ changed: true });
  expect(await run(api.changeBlock({ payload: block }))).toEqual({ changed: false });
  const blocks = await run(api.blocks());
  expect(blocks.blocks).toMatchObject([{ kind: "repository", githubId: "75", reason: "Spam" }]);
  expect(blocks.events).toMatchObject([{ action: "block", githubId: "75" }]);

  const repository = { scope: "repository", repositoryId: REPOSITORY_ID } as const;
  expect(
    await run(
      api.changeSignInPage({
        payload: {
          target: { ...repository, expectedOwnerId: OWNER_ID },
          skip: true,
          reason: "Ours",
        },
      }),
    ),
  ).toEqual({ changed: true });
  expect(
    await failure(
      api.changeSignInPage({
        payload: { target: { ...repository, expectedOwnerId: "66" }, skip: true, reason: "Ours" },
      }),
    ),
  ).toBeInstanceOf(OwnerChanged);
  expect(await run(api.signInPage())).toEqual({
    everyApp: null,
    repositories: [
      { repositoryId: REPOSITORY_ID, ownerId: OWNER_ID, active: true, reason: "Ours" },
    ],
  });

  const grant = {
    repositoryId: REPOSITORY_ID,
    expectedOwnerId: OWNER_ID,
    grant: true,
    reason: "Trusted",
  };
  expect(
    await run(api.changeConnectorGrant({ payload: { ...grant, connector: "other" } })),
  ).toEqual({ changed: true });
  expect(
    await failure(api.changeConnectorGrant({ payload: { ...grant, connector: "nope" } })),
  ).toBeInstanceOf(UnknownConnector);
  expect(await run(api.connectorGrants())).toEqual({
    connectors: ["fake", "other"],
    grants: [
      {
        repositoryId: REPOSITORY_ID,
        ownerId: OWNER_ID,
        connector: "other",
        active: true,
        reason: "Trusted",
      },
    ],
  });

  const target = { params: { clientId: registered.client_id } };
  expect(await run(api.deleteClient({ ...target, query: { owner: "66" } }))).toEqual({
    changed: false,
  });
  expect(await run(api.deleteClient({ ...target, query: {} }))).toEqual({ changed: true });
  expect((await run(api.clients({ query: {} }))).clients).toEqual([]);

  expect(await failure((await clientOf(h, "wrong")).moderation.counts())).toBeInstanceOf(
    InvalidToken,
  );
});

describe("the key, as a Bearer token of RFC 6750", () => {
  const seen = async (response: Response) => ({
    status: response.status,
    challenge: response.headers.get("www-authenticate"),
    cache: response.headers.get("cache-control"),
    body: await response.text(),
  });

  test("a request with no token gets the challenge with no error code", async () => {
    const h = await moderatedBroker();
    const at = `${h.issuer}/moderation/counts`;
    const unauthorized = {
      status: 401,
      challenge: 'Bearer realm="moderation"',
      cache: "no-store",
      body: "",
    };
    expect(await seen(await h.fetchBroker(at))).toEqual(unauthorized);
    // Another scheme is no Bearer token (RFC 6750 section 3.1).
    expect(
      await seen(await h.fetchBroker(at, { headers: { Authorization: `Basic ${KEY}` } })),
    ).toEqual(unauthorized);
  });

  test("a wrong token, or any token while the key is unset, is invalid_token", async () => {
    const invalid = {
      status: 401,
      challenge: 'Bearer error="invalid_token"',
      cache: "no-store",
      body: JSON.stringify({ error: "invalid_token", error_description: "The token is invalid." }),
    };
    const h = await moderatedBroker();
    const wrong = await h.fetchBroker(`${h.issuer}/moderation/counts`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(await seen(wrong)).toEqual(invalid);

    const unset = await createGithubBroker({
      moderation: moderation({ key: Config.Redacted("UNSET_MODERATION_KEY") }),
    });
    const keyless = await unset.fetchBroker(`${unset.issuer}/moderation/counts`, {
      headers: { Authorization: "Bearer anything" },
    });
    expect(await seen(keyless)).toEqual(invalid);
  });

  test("with the key, a body or a query that does not decode is invalid_request", async () => {
    const h = await moderatedBroker();
    const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
    const blocks = `${h.issuer}/moderation/blocks`;
    const invalid = (what: string) => ({
      status: 400,
      challenge: null,
      cache: "no-store",
      body: JSON.stringify({
        error: "invalid_request",
        error_description: `The ${what} is not valid.`,
      }),
    });
    const ban = JSON.stringify({ action: "ban", kind: "owner", githubId: "1" });
    expect(await seen(await h.fetchBroker(blocks, { method: "POST", headers, body: ban }))).toEqual(
      invalid("payload"),
    );
    expect(
      await seen(await h.fetchBroker(`${h.issuer}/moderation/clients?page=2`, { headers })),
    ).toEqual(invalid("query"));
    // The key is checked first: without it, the same body gets the challenge.
    const anonymous = await h.fetchBroker(blocks, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ban,
    });
    expect(anonymous.status).toBe(401);
  });

  test("a broker without the part has no moderation route", async () => {
    const h = await createGithubBroker();
    const response = await h.fetchBroker(`${h.issuer}/moderation/counts`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    expect(response.status).toBe(404);
  });
});

describe("a change reaches the cards in its own step", () => {
  test("a block stops a sign-in at once, and its removal lets it pass", async () => {
    const h = await moderatedBroker();
    const { client_id } = await createClient(h);
    const { moderation: api } = await clientOf(h);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const change = (action: "block" | "unblock") =>
      run(
        api.changeBlock({
          payload: {
            action,
            kind: "owner",
            githubId: OWNER_ID,
            reason: "Abuse",
            adminEmail: "a@b.c",
          },
        }),
      );

    expect(await authorize(h, client_id)).toBe("page");
    await change("block");
    expect(await authorize(h, client_id)).toBe("status 403");
    await change("unblock");
    expect(await authorize(h, client_id)).toBe("page");
  });

  test("a grant and an exemption rewrite the cards they cover", async () => {
    // No allow-list entry: only a grant opens a connector, and it can come before the first client.
    const h = await moderatedBroker({ allowList: [] });
    const { moderation: api } = await clientOf(h);
    const grant = (on: boolean) =>
      run(
        api.changeConnectorGrant({
          payload: {
            repositoryId: REPOSITORY_ID,
            expectedOwnerId: OWNER_ID,
            connector: "fake",
            grant: on,
            reason: "Trusted",
          },
        }),
      );
    const skip = (target: "every_app" | "repository", on: boolean) =>
      run(
        api.changeSignInPage({
          payload: {
            target:
              target === "every_app"
                ? { scope: "every_app" }
                : { scope: "repository", repositoryId: REPOSITORY_ID, expectedOwnerId: OWNER_ID },
            skip: on,
            reason: "Trusted",
          },
        }),
      );

    await grant(true);
    const { client_id } = await createClient(h);
    const card = () => {
      const found = cardOf(h, client_id);
      return { connectors: found?.connectors, confirm: found?.confirm };
    };
    expect(card()).toEqual({ connectors: ["fake"], confirm: true });

    await grant(false);
    expect(card()).toEqual({ connectors: [], confirm: true });
    await grant(true);
    await skip("repository", true);
    expect(card()).toEqual({ connectors: ["fake"], confirm: false });
    await skip("repository", false);
    expect(card()).toEqual({ connectors: ["fake"], confirm: true });
    await skip("every_app", true);
    expect(card()).toEqual({ connectors: ["fake"], confirm: false });
    expect((await run(api.clients({ query: {} }))).clients).toMatchObject([
      {
        signInPage: "every_app",
        policyConnectors: [],
        usableConnectors: ["fake"],
        grantedConnectors: ["fake"],
      },
    ]);
  });
});

test("a paused broker refuses every sign-in step of the layer's clients", async () => {
  const pausedBroker = (paused: boolean) =>
    createBroker({ registration: github([], { paused: Config.succeed(paused) }) });
  const signIn = async (h: Awaited<ReturnType<typeof pausedBroker>>) => {
    const { clientId } = await h.registerClient({
      appName: "app",
      redirectUri: PRODUCTION_CALLBACK,
      gates: [repositoryStop(REPOSITORY_ID)],
    });
    const url = new URL(`${h.issuer}/authorize`);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: PRODUCTION_CALLBACK,
      response_type: "code",
      scope: "openid",
      code_challenge: (await pkce()).challenge,
      code_challenge_method: "S256",
    }).toString();
    return (await h.fetchBroker(url)).status;
  };
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  // The broker's page that offers its connectors.
  expect(await signIn(await pausedBroker(false))).toBe(200);
  expect(await signIn(await pausedBroker(true))).toBe(403);
});
