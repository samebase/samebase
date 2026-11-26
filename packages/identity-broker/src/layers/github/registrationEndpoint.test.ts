// The port of registrationEndpoint.test.ts of the Convex broker: `POST /register` as RFC 7591
// describes it. openid-client registers with its own `dynamicClientRegistration` and signs in,
// discovery names the endpoint, and the client metadata that the hub reads, defaults, refuses, or
// ignores.
import { Config } from "effect";
import * as client from "openid-client";
import { describe, expect, it } from "vite-plus/test";
import * as Connectors from "../../core/connectors/index.ts";
import { hub } from "../../core/hub.ts";
import { createBroker, TEST_SERVICE, txnCookie } from "../../core/testing/harness.ts";
import { github } from "./routes.ts";
import {
  createHub,
  ISSUER,
  postHubClient,
  PRODUCTION_CALLBACK,
  REPOSITORY_ID,
  signToken,
  skipSignInPage,
  stubProviders,
  type Hub,
} from "./testing/hub.ts";

const refusalBody = (error: string) => ({ error, error_description: expect.any(String) });

/** Every request openid-client makes goes to the broker's handler. */
function brokerFetch(h: { fetchBroker: Hub["fetchBroker"] }): client.CustomFetch {
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
async function registerAndSignIn(h: Hub, metadata: Partial<client.ClientMetadata>) {
  const registered = await client.dynamicClientRegistration(new URL(ISSUER), metadata, undefined, {
    initialAccessToken: await signToken(h),
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
    skipSignInPage(h);
    await stubProviders(h);

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
    skipSignInPage(h);
    await stubProviders(h);

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
  it("is on a hub that names its service: strangers register here", () => {
    const google = Connectors.google({
      clientId: Config.Redacted("GOOGLE_CLIENT_ID"),
      clientSecret: Config.Redacted("GOOGLE_CLIENT_SECRET"),
    });
    // @ts-expect-error A hub on the `github` layer needs `service`.
    hub({ issuer: ISSUER, connectors: [google], registration: github([]) });
    hub({
      issuer: ISSUER,
      connectors: [google],
      registration: github([]),
      service: TEST_SERVICE,
    });
  });

  it("names the registration endpoint and the terms with the layer's routes", async () => {
    const h = await createHub();

    const document = await h.fetchBroker(`${ISSUER}/.well-known/openid-configuration`);

    expect(await document.json()).toMatchObject({
      registration_endpoint: `${ISSUER}/register`,
      op_tos_uri: "https://hub.example.com/terms",
    });
  });

  it("names no registration endpoint without the layer's routes, and the paths are not served", async () => {
    const h = await createBroker();

    const document = await h.fetchBroker(`${ISSUER}/.well-known/openid-configuration`);

    const metadata = await document.json();
    expect(metadata).not.toHaveProperty("registration_endpoint");
    const register = await h.fetchBroker(`${ISSUER}/register`, {
      method: "POST",
      headers: { Authorization: "Bearer token" },
      body: "{}",
    });
    expect(register.status).toBe(404);
    expect((await h.fetchBroker(`${ISSUER}/register/cl_x`, { method: "PUT" })).status).toBe(404);
  });
});

describe("the client metadata", () => {
  it.each([
    ["no method", undefined, "client_secret_basic"],
    ["client_secret_basic", "client_secret_basic", "client_secret_basic"],
    ["client_secret_post", "client_secret_post", "client_secret_post"],
  ])("registers %s at the token endpoint as %s", async (_, method, registered) => {
    const h = await createHub();
    await stubProviders(h);

    const response = await postHubClient(h, await signToken(h), {
      token_endpoint_auth_method: method,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ token_endpoint_auth_method: registered });
    expect(h.rows().clients.map((row) => row.tokenEndpointAuthMethod)).toEqual([registered]);
  });

  it.each(["none", "private_key_jwt", "tls_client_auth"])(
    "refuses the token endpoint auth method %s",
    async (method) => {
      const h = await createHub();
      const fileRequests = await stubProviders(h);

      const response = await postHubClient(h, await signToken(h), {
        token_endpoint_auth_method: method,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(refusalBody("invalid_client_metadata"));
      expect(fileRequests).toEqual([]);
    },
  );

  it("ignores fields it does not read, and names the client by its stage", async () => {
    const h = await createHub();
    await stubProviders(h);

    const response = await postHubClient(h, await signToken(h), {
      client_name: "x",
      logo_uri: "https://ideal-dolphin-15.convex.site/logo.png",
      contacts: ["octo@example.com"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    expect(response.status).toBe(201);
    const answer = await response.json();
    expect(answer).toMatchObject({
      client_name: "prod",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
    expect(answer).not.toHaveProperty("logo_uri");
    expect(answer).not.toHaveProperty("contacts");
  });

  it("reads the JSON body whatever its Content-Type says", async () => {
    const h = await createHub();
    await stubProviders(h);

    const response = await h.fetchBroker(`${ISSUER}/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await signToken(h)}`, "Content-Type": "text/plain" },
      body: JSON.stringify({ redirect_uris: [PRODUCTION_CALLBACK] }),
    });

    expect(response.status).toBe(201);
  });
});

/** `POST /register` of a good body with `authorization`, or no Authorization header for null. */
async function postWithAuthorization(h: Hub, authorization: string | null) {
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
    ["a token with a space in it", "Bearer one two"],
  ])("answers 401 with the realm challenge and no body for %s", async (_, authorization) => {
    const h = await createHub();
    const fileRequests = await stubProviders(h);

    const response = await postWithAuthorization(h, authorization);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="register"');
    expect(await response.text()).toBe("");
    expect(fileRequests).toEqual([]);
  });

  it("takes the scheme in any case", async () => {
    const h = await createHub();
    await stubProviders(h);

    const response = await postWithAuthorization(h, `bEaReR ${await signToken(h)}`);

    expect(response.status).toBe(201);
  });
});
