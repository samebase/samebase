// The metadata layer in a broker: openid-client as an independent public client whose client id is
// the address of its document, through the whole sign-in, with the layer alone, beside the
// integrations part, and beside the GitHub layer; and a stored card that gives no new sign-in once
// the broker no longer accepts its host.
import { createLocalJWKSet, jwtVerify } from "jose";
import * as client from "openid-client";
import { Schema } from "effect";
import { describe, expect, test } from "vite-plus/test";
import type { Part, Registration } from "../../core/router.ts";
import {
  createBroker,
  fakeUpstream,
  stubFetch,
  txnCookie,
  type Broker,
} from "../../core/testing/harness.ts";
import { PROVIDERS } from "../../integrations/testing.ts";
import { integrationsPart } from "../../integrations/routes.ts";
import { githubActions } from "../github/routes.ts";
import { metadataDocuments } from "./registration.ts";

const CLIENT_ID = "https://app.example.com/oauth-client.json";
const REDIRECT_URI = "https://app.example.com/auth/callback";

/** The app's file, as section 2 of the design shows it. */
const DOCUMENT = {
  client_id: CLIENT_ID,
  client_name: "My app",
  redirect_uris: [REDIRECT_URI],
  token_endpoint_auth_methods_supported: ["none"],
};

/** A broker on the fake provider with `registration`, and the app's file on its `Fetch`. */
async function brokerWith(registration: ReadonlyArray<Registration>, part?: Part) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  fetch.json(CLIENT_ID, DOCUMENT);
  return await createBroker({
    fetch,
    config: { connectors: [connector] },
    registration,
    ...(part === undefined ? {} : { part }),
  });
}

/** Every request openid-client makes goes to the broker's handlers. */
const brokerFetch =
  (h: Broker): client.CustomFetch =>
  async (url, options) => {
    // openid-client posts strings and URLSearchParams; nothing else crosses this stub.
    const body =
      typeof options.body === "string" || options.body instanceof URLSearchParams
        ? options.body
        : undefined;
    const init: RequestInit = { method: options.method, headers: options.headers };
    return await h.fetchBroker(url, body === undefined ? init : { ...init, body });
  };

const Jwks = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({ kty: Schema.String, n: Schema.String, e: Schema.String, kid: Schema.String }),
  ),
});

describe.each([
  ["the layer alone", () => brokerWith([metadataDocuments()])],
  ["the integrations part", () => brokerWith([metadataDocuments()], integrationsPart(PROVIDERS))],
  ["the GitHub layer", () => brokerWith([githubActions([]), metadataDocuments()])],
])("with %s", (_name, make) => {
  test("openid-client signs in as a public client whose client id is the address of its file", async () => {
    const h = await make();
    const config = await client.discovery(new URL(h.issuer), CLIENT_ID, undefined, client.None(), {
      [client.customFetch]: brokerFetch(h),
    });
    expect(config.serverMetadata()["client_id_metadata_document_supported"]).toBe(true);
    expect(config.serverMetadata().token_endpoint_auth_methods_supported).toContain("none");

    const codeVerifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const page = await h.fetchBroker(
      client.buildAuthorizationUrl(config, {
        redirect_uri: REDIRECT_URI,
        scope: "openid email",
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state,
        nonce,
      }),
    );
    // A card of the layer always shows the page, with the host of the return address.
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("app.example.com");
    const href = /href="([^"]*\/continue\?[^"]*)"/.exec(html)?.[1] ?? "";
    const started = await h.fetchBroker(new URL(href.replaceAll("&amp;", "&"), h.issuer), {
      headers: txnCookie(page),
    });
    expect(started.status).toBe(302);
    const upstream = new URL(started.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    const back = await h.fetchBroker(callback, { headers: txnCookie(page) });
    expect(back.status).toBe(302);
    const returned = new URL(back.headers.get("location") ?? "");

    // The token request carries the client id and no secret.
    const tokens = await client.authorizationCodeGrant(config, returned, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
      expectedNonce: nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    expect(claims?.aud).toBe(CLIENT_ID);
    expect(claims?.iss).toBe(h.issuer);
    const jwks = Schema.decodeUnknownSync(Jwks)(
      await (await h.fetchBroker(`${h.issuer}/.well-known/jwks.json`)).json(),
    );
    const verified = await jwtVerify(
      tokens.id_token ?? "",
      createLocalJWKSet({ keys: [...jwks.keys] }),
      { issuer: h.issuer, audience: CLIENT_ID, algorithms: ["RS256"] },
    );
    expect(verified.payload.sub).toBe(claims?.sub);

    const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims?.sub ?? "");
    expect(userinfo["email"]).toBe("octo@example.com");
    // One read of the file: the later steps read the card.
    expect(h.fetch.requests.filter((request) => request.url === CLIENT_ID)).toHaveLength(1);
    expect(h.fetch.unexpected).toEqual([]);
  });
});

describe("a stored card of the layer", () => {
  /** A fresh card of the app, written by the layer's own step. */
  const storeCard = (h: Broker) =>
    h.memory.run("metadata.put", {
      clientId: CLIENT_ID,
      fetchStartedAt: h.clock.now(),
      freshUntil: h.clock.now() + 3_600_000,
      redirectUris: [REDIRECT_URI],
      connectors: ["fake"],
      newCards: { rate: 30, periodMs: 3_600_000, capacity: 30 },
    });
  const authorize = (h: Broker) =>
    h.fetchBroker(
      `${h.issuer}/authorize?${new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "openid",
        code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        code_challenge_method: "S256",
      }).toString()}`,
    );

  test("gives a sign-in with no fetch while the broker accepts its host", async () => {
    const h = await brokerWith([metadataDocuments({ hosts: ["app.example.com"] })]);
    expect(storeCard(h)).toBe("inserted");
    expect((await authorize(h)).status).toBe(200);
    expect(h.fetch.requests).toEqual([]);
  });

  test("gives no new sign-in once the layer is removed from the broker", async () => {
    const h = await brokerWith([githubActions([])]);
    expect(storeCard(h)).toBe("inserted");
    const page = await authorize(h);
    expect([page.status, await page.text()]).toEqual([400, expect.stringContaining("Unknown")]);
  });

  test("gives no new sign-in once its host is removed from `hosts`", async () => {
    const h = await brokerWith([metadataDocuments({ hosts: ["other.example.com"] })]);
    expect(storeCard(h)).toBe("inserted");
    const page = await authorize(h);
    expect([page.status, await page.text()]).toEqual([
      400,
      expect.stringContaining("invalid_client"),
    ]);
    expect(h.fetch.requests).toEqual([]);
  });
});
