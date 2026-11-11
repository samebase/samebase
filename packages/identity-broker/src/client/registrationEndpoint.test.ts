/// <reference types="vite-plus/client" />
// `POST /register` as RFC 7591 describes it: openid-client registers with its own
// `dynamicClientRegistration` and signs in, discovery names the endpoint, and the client metadata
// that the hub reads, defaults, refuses, or ignores.
import * as client from "openid-client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createHarness,
  fakeUpstream,
  ISSUER,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";
import {
  createHub,
  foreignKey,
  postHubClient,
  PRODUCTION_CALLBACK,
  refusalBody,
  REPOSITORY_ID,
  signToken,
  skipSignInPage,
  stubProviders,
} from "./hub.test.helper.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

/**
 * Registers with openid-client's own `dynamicClientRegistration` and `metadata`, then signs in with
 * the client as it registered: HTTP Basic, which openid-client does not choose by itself.
 */
async function registerAndSignIn(h: Harness, metadata: Partial<client.ClientMetadata>) {
  const registered = await client.dynamicClientRegistration(new URL(ISSUER), metadata, undefined, {
    initialAccessToken: await signToken(),
    [client.customFetch]: brokerFetch(h),
  });
  const answer = registered.clientMetadata();
  const config = new client.Configuration(
    registered.serverMetadata(),
    answer.client_id,
    undefined,
    client.ClientSecretBasic(String(answer.client_secret)),
  );
  config[client.customFetch] = brokerFetch(h);
  // The provider answers from here on.
  fakeUpstream();
  const codeVerifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: PRODUCTION_CALLBACK,
    scope: "openid email profile",
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state,
    nonce,
    connector: "fake",
  });
  const started = await h.fetchBroker(authorizationUrl);
  expect(started.status).toBe(302);
  const upstreamUrl = new URL(started.headers.get("location") ?? "");
  const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
  expect(back.status).toBe(302);

  const tokens = await client.authorizationCodeGrant(
    config,
    new URL(back.headers.get("location") ?? ""),
    { pkceCodeVerifier: codeVerifier, expectedState: state, expectedNonce: nonce },
  );
  expect(tokens.claims()).toMatchObject({ iss: ISSUER, aud: answer.client_id, nonce });
  return answer;
}

describe("POST /register with a standard client library", () => {
  it("registers with openid-client and the GitHub token, and the client signs in", async () => {
    const h = await createHub();
    await skipSignInPage(h);
    stubProviders();

    const metadata = await registerAndSignIn(h, {
      redirect_uris: [PRODUCTION_CALLBACK],
      software_id: "my-app",
      software_version: "abc123",
      connectors: ["fake"],
    });

    expect(metadata).toMatchObject({
      client_id: expect.stringMatching(/^cl_/),
      client_secret: expect.any(String),
      client_secret_expires_at: 0,
      redirect_uris: [PRODUCTION_CALLBACK],
      client_name: "prod",
      software_id: `gh-${REPOSITORY_ID}/my-app`,
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      application_type: "web",
      subject_type: "public",
      id_token_signed_response_alg: "RS256",
      connectors: ["fake"],
    });
  });

  it("registers with openid-client and only redirect_uris, and the client signs in", async () => {
    const h = await createHub();
    await skipSignInPage(h);
    stubProviders();

    const metadata = await registerAndSignIn(h, { redirect_uris: [PRODUCTION_CALLBACK] });

    expect(metadata).toMatchObject({
      software_id: `gh-${REPOSITORY_ID}/app`,
      software_version: "unknown",
      token_endpoint_auth_method: "client_secret_basic",
      connectors: ["fake", "other"],
    });
  });
});

describe("discovery", () => {
  it("names the registration endpoint and the terms in the hub mode", async () => {
    const h = await createHub();

    const document = await h.fetchBroker(`${ISSUER}/.well-known/openid-configuration`);

    expect(await document.json()).toMatchObject({
      registration_endpoint: `${ISSUER}/register`,
      op_tos_uri: "https://samebase.com/terms",
    });
  });

  it("names neither without `registration`, and the path is not served", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });

    const document = await h.fetchBroker(`${ISSUER}/.well-known/openid-configuration`);

    const metadata: Record<string, unknown> = await document.json();
    expect(metadata).not.toHaveProperty("registration_endpoint");
    expect(metadata).not.toHaveProperty("op_tos_uri");
    expect((await postHubClient(h, await signToken())).status).toBe(404);
  });
});

describe("the client metadata", () => {
  it.each([
    ["no method", undefined, "client_secret_basic"],
    ["client_secret_basic", "client_secret_basic", "client_secret_basic"],
    ["client_secret_post", "client_secret_post", "client_secret_post"],
  ])("registers %s at the token endpoint as %s", async (_, method, registered) => {
    const h = await createHub();
    stubProviders();

    const response = await postHubClient(h, await signToken(), {
      token_endpoint_auth_method: method,
    });

    expect(response.status).toBe(201);
    const answer: { client_id: string; token_endpoint_auth_method: string } = await response.json();
    expect(answer.token_endpoint_auth_method).toBe(registered);
    const record = await h.t.run(async (ctx) =>
      (await ctx.db.query("clients").collect()).map((row) => row.tokenEndpointAuthMethod),
    );
    expect(record).toEqual([registered]);
  });

  it.each(["none", "private_key_jwt", "tls_client_auth"])(
    "refuses the token endpoint auth method %s",
    async (method) => {
      const h = await createHub();
      const fileRequests = stubProviders();

      const response = await postHubClient(h, await signToken(), {
        token_endpoint_auth_method: method,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_client_metadata"));
      expect(fileRequests).toEqual([]);
    },
  );

  it("ignores fields it does not read, and names the client by its stage", async () => {
    const h = await createHub();
    stubProviders();

    const response = await postHubClient(h, await signToken(), {
      client_name: "x",
      logo_uri: "https://ideal-dolphin-15.convex.site/logo.png",
      contacts: ["octo@example.com"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    expect(response.status).toBe(201);
    const answer: Record<string, unknown> = await response.json();
    expect(answer).toMatchObject({
      client_name: "prod",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
    expect(answer).not.toHaveProperty("logo_uri");
    expect(answer).not.toHaveProperty("contacts");
  });
});

/** `POST /register` of a good body with `authorization`, or no Authorization header for null. */
async function postWithAuthorization(h: Harness, authorization: string | null) {
  return await h.fetchBroker(`${ISSUER}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === null ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({ redirect_uris: [PRODUCTION_CALLBACK] }),
  });
}

describe("the Bearer token (RFC 6750 section 3.1)", () => {
  it.each([
    ["no Authorization header", null],
    ["Basic credentials", "Basic dXNlcjpwYXNz"],
    ["the word Bearer alone", "Bearer"],
  ])("answers 401 with the bare challenge and no body for %s", async (_, authorization) => {
    const h = await createHub();
    const fileRequests = stubProviders();

    const response = await postWithAuthorization(h, authorization);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
    expect(await response.text()).toBe("");
    expect(fileRequests).toEqual([]);
  });

  it.each([
    ["a JWT that fails verification", async () => await signToken({}, { key: foreignKey })],
    ["an unknown initial access token", async () => "unknown-token"],
    ["a token with two parts", async () => "one.dot"],
  ])("answers 401 invalid_token with the challenge for %s", async (_, token) => {
    const h = await createHub();
    stubProviders();

    const response = await postWithAuthorization(h, `Bearer ${await token()}`);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer error="invalid_token"');
    expect(await response.json()).toEqual({
      error: "invalid_token",
      error_description: "The token is invalid.",
    });
  });
});
