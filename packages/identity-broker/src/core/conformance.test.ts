// openid-client, an OpenID-certified relying party, against the broker: discovery, the code flow
// with PKCE and nonce, userinfo; jose checks the id_token signature against the published JWKS.
// Ported from src/client/conformance.test.ts of @samebase/identity-broker 0.34.0 without the API resource
// case (design section 9 item 1).
import { Schema } from "effect";
import { createLocalJWKSet, jwtVerify } from "jose";
import * as client from "openid-client";
import { expect, test } from "vite-plus/test";
import { createKeySet, rotateKeySet } from "./keys.ts";
import {
  createBroker,
  fakeUpstream,
  stubFetch,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";

const REDIRECT_URI = "https://app.test/oauth/broker/callback";

/** Every request openid-client makes goes to the broker's handlers. */
function brokerFetch(h: Broker): client.CustomFetch {
  return async (url, options) => {
    // openid-client posts strings and URLSearchParams; nothing else crosses this stub.
    const body =
      typeof options.body === "string" || options.body instanceof URLSearchParams
        ? options.body
        : undefined;
    const init: RequestInit = { method: options.method, headers: options.headers };
    return await h.fetchBroker(url, body === undefined ? init : { ...init, body });
  };
}

/**
 * One sign-in with openid-client: discovery, the code flow with PKCE and nonce, and the token
 * response, checked by openid-client.
 */
async function signIn() {
  const fetch = stubFetch();
  const upstream = fakeUpstream(fetch);
  const h = await createBroker({ fetch, config: { connectors: [upstream.connector] } });
  const { clientId, clientSecret } = await h.registerClient({
    appName: "My app",
    redirectUri: REDIRECT_URI,
  });
  const config = await client.discovery(
    new URL(h.issuer),
    clientId,
    undefined,
    client.ClientSecretPost(clientSecret),
    { [client.customFetch]: brokerFetch(h) },
  );
  expect(config.serverMetadata().issuer).toBe(h.issuer);
  expect(config.serverMetadata().supportsPKCE()).toBe(true);

  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: "openid email profile",
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
  });

  // The browser: the broker sends the user upstream, the fake provider sends them back.
  const started = await h.fetchBroker(authorizationUrl);
  expect(started.status).toBe(302);
  const upstreamUrl = new URL(started.headers.get("location") ?? "");
  const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  expect(back.status).toBe(302);
  const currentUrl = new URL(back.headers.get("location") ?? "");
  expect(currentUrl.origin + currentUrl.pathname).toBe(REDIRECT_URI);

  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });
  return { h, config, clientId, nonce, tokens };
}

const Jwks = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({
      kty: Schema.String,
      n: Schema.String,
      e: Schema.String,
      kid: Schema.String,
      alg: Schema.optionalKey(Schema.String),
      use: Schema.optionalKey(Schema.String),
    }),
  ),
});

/** Verifies an id_token's signature against the JWKS that `h` publishes now. */
async function verifyWithJwks(h: Broker, idToken: string, clientId: string) {
  const response = await h.fetchBroker(`${h.issuer}/.well-known/jwks.json`);
  const jwks = Schema.decodeUnknownSync(Jwks)(await response.json());
  return await jwtVerify(idToken, createLocalJWKSet({ keys: [...jwks.keys] }), {
    issuer: h.issuer,
    audience: clientId,
    algorithms: ["RS256"],
  });
}

test("openid-client completes a sign-in through the broker", async () => {
  const { h, config, clientId, nonce, tokens } = await signIn();
  const claims = tokens.claims();
  expect(claims?.iss).toBe(h.issuer);
  expect(claims?.aud).toBe(clientId);
  expect(claims?.nonce).toBe(nonce);
  expect(claims?.["email"]).toBe("octo@example.com");
  // openid-client does not check the signature of an id_token from the token endpoint.
  const idToken = tokens.id_token ?? "";
  expect((await verifyWithJwks(h, idToken, clientId)).payload.sub).toBe(claims?.sub);

  const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims?.sub ?? "");
  expect(userinfo.sub).toBe(claims?.sub);
  expect(userinfo["email"]).toBe("octo@example.com");
  expect(h.fetch.unexpected).toEqual([]);
});

test("a token signed before a rotation verifies against the JWKS after it", async () => {
  const { h, clientId, tokens } = await signIn();
  const idToken = tokens.id_token ?? "";
  // The deployment's IDENTITY_BROKER_KEYS changes; the JWKS keeps the retired public key.
  h.keys.set(JSON.stringify(await rotateKeySet(h.keySet)));
  expect((await verifyWithJwks(h, idToken, clientId)).payload.aud).toBe(clientId);
  // An emergency rotation drops the old key from the JWKS at once.
  h.keys.set(JSON.stringify(await createKeySet()));
  await expect(verifyWithJwks(h, idToken, clientId)).rejects.toThrow();
});
