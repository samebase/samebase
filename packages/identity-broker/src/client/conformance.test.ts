/// <reference types="vite-plus/client" />
// openid-client, an OpenID-certified relying party, against the broker: discovery, the code flow
// with PKCE and nonce, userinfo; jose checks the id_token signature against the published JWKS.
// Then API authorization: the code flow with `resource`, refresh, and revocation.
import { createLocalJWKSet, jwtVerify } from "jose";
import * as client from "openid-client";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  createHarness,
  fakeUpstream,
  ISSUER,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";
import { createKeySet, rotateKeySet, type KeySet } from "./keys.js";
import { githubConnection } from "./resourceProviders.js";

const REDIRECT_URI = "https://app.test/oauth/hub/callback";
// GitHub's documented token response, for a code and for a refresh: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
const githubToken = {
  access_token: "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  expires_in: 28800,
  refresh_token: "ghr_1B4a2e77838347a7E420ce178F2E7c6912E169246c34E1ccbF66C46812d16D5B1A9Dc86A1498",
  refresh_token_expires_in: 15897600,
  scope: "",
  token_type: "bearer",
};

/** Every request openid-client makes goes to the broker's handlers. */
function brokerFetch(h: Harness): client.CustomFetch {
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * One sign-in with openid-client against a broker with `keySet`: discovery, the code flow with PKCE
 * and nonce, and the token response, checked by openid-client.
 */
async function signIn(options: { keySet?: KeySet } = {}) {
  const upstream = fakeUpstream();
  const h = await createHarness({ connectors: [upstream.connector], ...options });
  const { clientId, clientSecret } = await h.registerClient({
    appName: "My app",
    redirectUri: REDIRECT_URI,
  });

  const config = await client.discovery(
    new URL(ISSUER),
    clientId,
    undefined,
    client.ClientSecretPost(clientSecret),
    {
      [client.customFetch]: brokerFetch(h),
    },
  );
  expect(config.serverMetadata().issuer).toBe(ISSUER);
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

/** Verifies an id_token's signature against the JWKS that `h` publishes. */
async function verifyWithJwks(h: Harness, idToken: string, clientId: string) {
  const jwks = await (await h.fetchBroker(`${ISSUER}/.well-known/jwks.json`)).json();
  return await jwtVerify(idToken, createLocalJWKSet(jwks), {
    issuer: ISSUER,
    audience: clientId,
    algorithms: ["RS256"],
  });
}

test("openid-client completes a sign-in through the broker", async () => {
  const { h, config, clientId, nonce, tokens } = await signIn();
  const claims = tokens.claims();
  expect(claims?.iss).toBe(ISSUER);
  expect(claims?.aud).toBe(clientId);
  expect(claims?.nonce).toBe(nonce);
  expect(claims?.["email"]).toBe("octo@example.com");
  // openid-client does not check the signature of an id_token from the token endpoint.
  const idToken = tokens.id_token ?? "";
  expect((await verifyWithJwks(h, idToken, clientId)).payload.sub).toBe(claims?.sub);

  const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims?.sub ?? "");
  expect(userinfo.sub).toBe(claims?.sub);
  expect(userinfo["email"]).toBe("octo@example.com");
});

test("a token signed before a rotation verifies against the JWKS after it", async () => {
  const keySet = await createKeySet();
  const { clientId, tokens } = await signIn({ keySet });
  const idToken = tokens.id_token ?? "";
  // The deployment's IDENTITY_BROKER_KEYS changes; the JWKS keeps the retired public key.
  const rotated = await createHarness({
    connectors: [fakeUpstream().connector],
    keySet: await rotateKeySet(keySet),
  });
  expect((await verifyWithJwks(rotated, idToken, clientId)).payload.aud).toBe(clientId);
  // An emergency rotation drops the old key from the JWKS at once.
  const replaced = await createHarness({
    connectors: [fakeUpstream().connector],
    keySet: await createKeySet(),
  });
  await expect(verifyWithJwks(replaced, idToken, clientId)).rejects.toThrow();
});

test("openid-client gets, refreshes, and revokes a GitHub API token through the broker", async () => {
  const github = githubConnection({
    clientId: () => "provider-client",
    clientSecret: () => "provider-secret",
  });
  const h = await createHarness({ connectors: [fakeUpstream().connector], resources: [github] });
  const { clientId, clientSecret } = await h.registerClient({
    appName: "My app",
    redirectUri: REDIRECT_URI,
  });
  const providerGrants: (string | null)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.url !== github.server.token_endpoint) throw new Error("Unexpected request");
      providerGrants.push(new URLSearchParams(await request.text()).get("grant_type"));
      return Response.json(githubToken);
    }),
  );
  const config = await client.discovery(
    new URL(ISSUER),
    clientId,
    undefined,
    client.ClientSecretPost(clientSecret),
    { [client.customFetch]: brokerFetch(h) },
  );

  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    resource: github.resource,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
  });
  // The browser: the broker sends the user to GitHub, and GitHub sends them back with its issuer.
  const started = await h.fetchBroker(authorizationUrl);
  const upstreamUrl = new URL(started.headers.get("location") ?? "");
  expect(upstreamUrl.origin + upstreamUrl.pathname).toBe(github.server.authorization_endpoint);
  const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
  callback.searchParams.set("iss", github.server.issuer);
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  const currentUrl = new URL(back.headers.get("location") ?? "");

  // openid-client checks `iss` (RFC 9207), `state`, and the token response (RFC 6749 section 5.1).
  const tokens = await client.authorizationCodeGrant(
    config,
    currentUrl,
    { pkceCodeVerifier: codeVerifier, expectedState: state, idTokenExpected: false },
    { resource: github.resource },
  );
  expect(tokens.access_token).toBe(githubToken.access_token);
  expect(tokens.token_type).toBe("bearer");
  expect(tokens.expiresIn()).toBeLessThanOrEqual(githubToken.expires_in);
  const refreshToken = tokens.refresh_token ?? "";
  expect(refreshToken).not.toBe(githubToken.refresh_token);

  const refreshed = await client.refreshTokenGrant(config, refreshToken, {
    resource: github.resource,
  });
  expect(refreshed.access_token).toBe(githubToken.access_token);
  expect(refreshed.refresh_token).toBe(refreshToken);
  expect(providerGrants).toEqual(["authorization_code", "refresh_token"]);

  // RFC 7009: the broker's refresh grant ends, and the next refresh never reaches GitHub.
  await client.tokenRevocation(config, refreshToken, { token_type_hint: "refresh_token" });
  await expect(client.refreshTokenGrant(config, refreshToken)).rejects.toMatchObject({
    error: "invalid_grant",
  });
  expect(providerGrants).toHaveLength(2);
});
