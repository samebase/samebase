import {
  httpActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  type PublicHttpAction,
} from "convex/server";
import { v } from "convex/values";
import * as oauth from "oauth4webapi";
import type { ComponentApi } from "../component/_generated/component.js";
import { vDeploymentType, vTokenEndpointAuthMethod } from "../component/schema.js";
import type { Connector } from "./connectors/types.js";
import { finishUpstream, startUpstream, type UpstreamFinish } from "./connectors/upstream.js";
import { chooserPage, errorPage } from "./html.js";
import {
  signAccessToken,
  signIdToken,
  TOKEN_TTL_SECONDS,
  verifyAccessToken,
  type IdentityClaims,
} from "./jwt.js";
import { parseKeySet, publicJwks, SIGNING_ALGORITHM, type KeySet } from "./keys.js";
import {
  isSecureUrl,
  parseRedirectUri,
  readBearerToken,
  readClientAuthentication,
  validateAuthorizeRest,
  validateAuthorizeTarget,
  validateTokenRequest,
} from "./protocol.js";
import {
  authorizationError,
  authorizationResponse,
  json,
  oauthError,
  readParameters,
  redirect,
} from "./responses.js";
import { registrationEndpoints, type RegistrationConfig } from "./registration.js";
import { appSalt, pairwiseSubject, randomToken, sha256Hex } from "./subject.js";

export type {
  Connector,
  OauthConnector,
  OidcConnector,
  UpstreamIdentity,
} from "./connectors/types.js";
export { github } from "./connectors/github.js";
export { google } from "./connectors/google.js";
export { createKeySet, parseKeySet, rotateKeySet, type KeySet } from "./keys.js";
export { assertKeySetUsable } from "./jwt.js";
export type { RegistrationConfig } from "./registration.js";

export type IdentityBrokerConfig = {
  /** `components.identityBroker` of the host app. */
  component: ComponentApi;
  /**
   * The issuer URL. Supported: a dedicated hostname with the issuer at `/`, e.g.
   * `https://auth.example.com`, where the transaction cookies carry the `__Host-` prefix. An issuer
   * under a path uses plain cookies and is not verified in browsers.
   */
  issuer: string;
  /** The content of `IDENTITY_BROKER_KEYS`, read in the request. */
  keys: () => string | undefined;
  connectors: Connector[];
  /**
   * Days without a sign-in after which `cleanup` deletes a preview client. Absent: `cleanup` deletes
   * no client, because a deployment whose client was deleted does not register again by itself.
   */
  previewClientIdleDays?: number;
  /** Lets apps that are not the host's own register (RFC 7591). Absent: no `/register` endpoint. */
  registration?: RegistrationConfig;
};

/** A request lives this long from /authorize to the code redirect. */
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
/** A code is redeemed by the client's callback at once. */
const CODE_TTL_MS = 60 * 1000;
/** How far an upstream `auth_time` may sit outside the request's lifetime: the clocks differ. */
const AUTH_TIME_SKEW_SECONDS = 60;
/** The scopes the broker grants; any other requested scope is dropped. */
const SCOPES = ["openid", "email", "profile"];
/** How long `cleanup` keeps an audit row of an issued id_token. */
export const SIGN_IN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type Ctx = GenericActionCtx<GenericDataModel>;

export function defineIdentityBroker(config: IdentityBrokerConfig) {
  const issuerUrl = new URL(config.issuer);
  if (!isSecureUrl(issuerUrl)) {
    throw new Error("The issuer must be https, or http on a loopback host for local development");
  }
  if (issuerUrl.search !== "" || issuerUrl.hash !== "") {
    throw new Error("The issuer must not have a query or fragment");
  }
  const issuer = issuerUrl.href.replace(/\/$/, "");
  const prefix = issuerUrl.pathname.replace(/\/$/, "");
  const path = (suffix: string) => `${prefix}${suffix}`;
  /**
   * `/authorize` binds each request to the browser that started it (RFC 9700 section 2.1.1) with one
   * cookie per request, named after the request id, so two sign-ins in one browser keep their own.
   * `__Host-` needs Path=/, so a path issuer uses a plain name scoped to its path.
   */
  const txnCookiePrefix = prefix === "" ? "__Host-broker_txn_" : "broker_txn_";
  const txnCookieAttributes = `Path=${prefix === "" ? "/" : prefix}; HttpOnly; Secure; SameSite=Lax`;
  const component = config.component;
  const connectors = new Map(config.connectors.map((connector) => [connector.name, connector]));
  if (connectors.size !== config.connectors.length) {
    throw new Error("Connector names must be unique");
  }
  if (connectors.size === 0) {
    throw new Error("At least one connector is required");
  }
  const { previewClientIdleDays, registration } = config;
  if (registration !== undefined && !connectors.has(registration.connector)) {
    throw new Error(`No connector "${registration.connector}" for registration`);
  }
  const openConnectors = [...connectors.values()].filter(
    (connector) => connector.reserved !== true,
  );
  // Zero or less would delete every preview client at the next cleanup.
  if (previewClientIdleDays !== undefined && !(previewClientIdleDays > 0)) {
    throw new Error("previewClientIdleDays must be a positive number of days");
  }

  /** The transaction cookies the browser sent, by request id. */
  function readTxnCookies(request: Request): Map<string, string> {
    const cookies = new Map<string, string>();
    for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      if (separator > 0 && name.startsWith(txnCookiePrefix)) {
        cookies.set(name.slice(txnCookiePrefix.length), pair.slice(separator + 1).trim());
      }
    }
    return cookies;
  }

  /** Whether the browser holds the cookie whose hash the request stores. */
  async function browserBound(
    request: Request,
    stored: { requestId: string; txnCookieHash: string },
  ): Promise<boolean> {
    const cookie = readTxnCookies(request).get(stored.requestId);
    return cookie !== undefined && (await sha256Hex(cookie)) === stored.txnCookieHash;
  }

  /** The Set-Cookie value that deletes a request's cookie, when the browser sent one. */
  function clearTxnCookie(request: Request, requestId: string): string | undefined {
    return readTxnCookies(request).has(requestId)
      ? `${txnCookiePrefix}${requestId}=; ${txnCookieAttributes}; Max-Age=0`
      : undefined;
  }

  const unboundPage = () =>
    errorPage(
      "Sign-in not continued",
      "This sign-in did not start in this browser. Return to the app and try again.",
      400,
    );

  /** An app from `/register` has one connector. Any other app has every connector but a reserved one. */
  const connectorAllowed = (app: { connector?: string }, connector: Connector) =>
    app.connector === undefined ? connector.reserved !== true : connector.name === app.connector;

  /**
   * The connector `/authorize` goes to with no page. A first-party app may skip the chooser: the one
   * it named, or the only one. An app from `/register` goes to its one connector, and the URL has no
   * say. Any other third-party app always gets the page, which doubles as consent (RFC 9700 4.11).
   */
  function directConnector(
    app: { connector?: string; firstParty: boolean },
    named: string | undefined,
  ): Connector | undefined {
    if (app.connector !== undefined) {
      return connectors.get(app.connector);
    }
    if (!app.firstParty) {
      return undefined;
    }
    const connector = named === undefined ? undefined : connectors.get(named);
    return connector !== undefined && connectorAllowed(app, connector)
      ? connector
      : openConnectors.length === 1
        ? openConnectors[0]
        : undefined;
  }

  /** A sign-in of an app from `/register` that stopped: suspended, or stopped for all such apps. */
  const stoppedPage = (app: { suspended: boolean; connector?: string }) =>
    app.suspended
      ? errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403)
      : app.connector !== undefined && registration?.paused?.() === true
        ? errorPage("Sign-in is off", "Sign-in is paused. Try again later.", 503)
        : null;

  /**
   * A refusal before the user has authenticated. An app from `/register` holds a redirect URI that
   * nobody reviewed, so a redirect would let a link on this host end on any page of that app. It gets
   * an error page here (RFC 9700 section 4.11.2).
   */
  function refuse(
    app: { connector?: string } | null,
    back: Parameters<typeof authorizationError>[0],
  ): Response {
    return app?.connector === undefined
      ? authorizationError(back)
      : errorPage("Sign-in refused", back.description, 400);
  }

  const keySet = (): KeySet => parseKeySet(config.keys());
  const callbackUrl = (connector: Connector) => `${issuer}/connectors/${connector.name}/callback`;

  const metadata = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    ...(registration === undefined ? {} : { registration_endpoint: `${issuer}/register` }),
    scopes_supported: SCOPES,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["pairwise"],
    id_token_signing_alg_values_supported: [SIGNING_ALGORITHM],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "auth_time",
      "nonce",
      "email",
      "email_verified",
      "name",
      "picture",
      "connector",
      "connector_account_id",
    ],
    authorization_response_iss_parameter_supported: true,
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
  });

  const discovery = httpActionGeneric(async () =>
    json(metadata(), 200, { "Cache-Control": "public, max-age=300" }),
  );

  const jwks = httpActionGeneric(async () =>
    json(publicJwks(keySet()), 200, { "Cache-Control": "public, max-age=300" }),
  );

  /** Sends the user to a connector for a stored request. */
  async function startConnector(
    ctx: Ctx,
    args: {
      connector: Connector;
      app: { connector?: string };
      request: {
        requestId: string;
        appId: string;
        redirectUri: string;
        state: string | undefined;
        freshLogin: boolean;
      };
      clearCookie: string | undefined;
    },
  ): Promise<Response> {
    const { connector, request } = args;
    const back = {
      redirectUri: request.redirectUri,
      issuer,
      state: request.state,
      clearCookie: args.clearCookie,
    };
    // Freshness is honored only as prompt=login upstream; a connector without it is refused, never
    // pretended.
    if (request.freshLogin && (connector.kind === "oauth" || !connector.promptLogin)) {
      return refuse(args.app, {
        ...back,
        error: "login_required",
        description: `${connector.label} cannot reauthenticate the user, which prompt=login or max_age asked for.`,
      });
    }
    const start = await startUpstream({
      connector,
      callbackUrl: callbackUrl(connector),
      freshLogin: request.freshLogin,
    });
    const now = Date.now();
    const result = await ctx.runMutation(component.authRequests.startUpstream, {
      requestId: request.requestId,
      connector: connector.name,
      upstreamStateHash: await sha256Hex(start.state),
      upstreamCodeVerifier: start.codeVerifier,
      ...(start.nonce === undefined ? {} : { upstreamNonce: start.nonce }),
      now,
    });
    if (!result.ok) {
      return result.error === "not_found"
        ? errorPage(
            "Sign-in not found",
            "This sign-in is unknown. Return to the app and try again.",
            404,
          )
        : refuse(args.app, {
            ...back,
            error: "access_denied",
            description: `The sign-in ${result.error === "expired" ? "expired" : "already moved on"}.`,
          });
    }
    return redirect(start.url);
  }

  async function readApp(ctx: Ctx, appId: string) {
    return await ctx.runQuery(component.apps.get, { appId });
  }

  const authorize = httpActionGeneric(async (ctx, request) => {
    const params = await readParameters(request);
    if (params === null) {
      return oauthError(
        415,
        "invalid_request",
        "A POST must be application/x-www-form-urlencoded.",
      );
    }
    const target = validateAuthorizeTarget(params);
    if (!target.ok) {
      return errorPage("Invalid sign-in request", target.description, target.status);
    }
    const found = await ctx.runQuery(component.clients.withApp, {
      clientId: target.value.clientId,
    });
    if (found === null) {
      return errorPage(
        "Unknown client",
        "The client_id is not registered with this provider.",
        400,
      );
    }
    const { client, app } = found;
    // Exact string comparison, and no redirect to a URI that is not registered (RFC 9700 4.1.3).
    if (client.redirectUri !== target.value.redirectUri) {
      return errorPage(
        "Invalid redirect URI",
        "The redirect_uri is not the one registered for this client.",
        400,
      );
    }
    const back = {
      redirectUri: client.redirectUri,
      issuer,
      state: params.get("state") ?? undefined,
      clearCookie: undefined,
    };
    const rest = validateAuthorizeRest(params, target.value);
    if (!rest.ok) {
      return refuse(app, { ...back, error: rest.error, description: rest.description });
    }
    if (app === null) {
      return authorizationError({
        ...back,
        error: "server_error",
        description: "The client's app is gone.",
      });
    }
    const stopped = stoppedPage(app);
    if (stopped !== null) {
      return stopped;
    }
    if (rest.value.prompt.includes("none")) {
      // The broker keeps no session, so it can never answer without interaction.
      return refuse(app, {
        ...back,
        error: "login_required",
        description: "This provider has no session to reuse.",
      });
    }
    const freshLogin = rest.value.prompt.includes("login") || rest.value.maxAge !== undefined;
    const scopes = SCOPES.filter((scope) => rest.value.scopes.includes(scope));
    const chosen = directConnector(app, rest.value.connector);
    // Every later step needs this cookie: a client that fetches the chooser itself cannot send a
    // user's browser on from it, and a provider callback finishes only where the sign-in started.
    const txnCookie = randomToken(32);
    const now = Date.now();
    const requestId = randomToken(24);
    const created = await ctx.runMutation(component.authRequests.create, {
      ...(app.tenantId === undefined ? {} : { tenantId: app.tenantId }),
      requestId,
      appId: app.appId,
      clientId: client.clientId,
      redirectUri: client.redirectUri,
      scope: scopes.join(" "),
      ...(rest.value.state === undefined ? {} : { state: rest.value.state }),
      ...(rest.value.nonce === undefined ? {} : { nonce: rest.value.nonce }),
      codeChallenge: rest.value.codeChallenge,
      freshLogin,
      txnCookieHash: await sha256Hex(txnCookie),
      createdAt: now,
      expiresAt: now + AUTH_REQUEST_TTL_MS,
    });
    if (!created.ok) {
      return errorPage("Too many sign-ins", "Too many sign-ins for this app. Try again soon.", 429);
    }
    const setCookie = `${txnCookiePrefix}${requestId}=${txnCookie}; ${txnCookieAttributes}; Max-Age=${AUTH_REQUEST_TTL_MS / 1000}`;
    if (chosen !== undefined) {
      const response = await startConnector(ctx, {
        connector: chosen,
        app,
        request: {
          requestId,
          appId: app.appId,
          redirectUri: client.redirectUri,
          state: rest.value.state,
          freshLogin,
        },
        clearCookie: undefined,
      });
      response.headers.append("Set-Cookie", setCookie);
      return response;
    }
    const page = chooserPage({
      appName: app.name,
      firstParty: app.firstParty,
      scopes,
      connectors: openConnectors.map((connector) => ({
        name: connector.name,
        label: connector.label,
        href: `${path("/continue")}?request=${encodeURIComponent(requestId)}&connector=${encodeURIComponent(connector.name)}`,
      })),
      denyHref: `${path("/continue")}?request=${encodeURIComponent(requestId)}&deny=1`,
    });
    page.headers.append("Set-Cookie", setCookie);
    return page;
  });

  /** A chooser click: start the chosen connector, or abandon the request on deny. */
  const continueSignIn = httpActionGeneric(async (ctx, request) => {
    const url = new URL(request.url);
    const requestId = url.searchParams.get("request") ?? "";
    const stored = await ctx.runQuery(component.authRequests.get, { requestId });
    if (stored === null) {
      return errorPage(
        "Sign-in not found",
        "This sign-in is unknown or finished. Return to the app and try again.",
        404,
      );
    }
    if (!(await browserBound(request, stored))) {
      return unboundPage();
    }
    const back = {
      redirectUri: stored.redirectUri,
      issuer,
      state: stored.state,
      clearCookie: clearTxnCookie(request, requestId),
    };
    if (url.searchParams.get("deny") !== null) {
      await ctx.runMutation(component.authRequests.abandon, { requestId });
      return authorizationError({
        ...back,
        error: "access_denied",
        description: "The user cancelled the sign-in.",
      });
    }
    if (stored.status === "completed" || stored.status === "claimed") {
      return errorPage(
        "Sign-in finished",
        "This sign-in already finished. Return to the app.",
        409,
      );
    }
    const connector = connectors.get(url.searchParams.get("connector") ?? "");
    if (connector === undefined) {
      return errorPage("Unknown connector", "That sign-in method is not configured.", 404);
    }
    const app = await readApp(ctx, stored.appId);
    if (app === null) {
      return authorizationError({
        ...back,
        error: "server_error",
        description: "The client's app is gone.",
      });
    }
    const stopped = stoppedPage(app);
    if (stopped !== null) {
      return stopped;
    }
    // The chooser link carries the connector, so a user can edit it, and this route can restart a
    // request that already went upstream. The rule holds here as it does in /authorize.
    if (!connectorAllowed(app, connector)) {
      return errorPage("Unknown connector", "That sign-in method is not configured.", 404);
    }
    return await startConnector(ctx, {
      connector,
      app,
      request: {
        requestId,
        appId: stored.appId,
        redirectUri: stored.redirectUri,
        state: stored.state,
        freshLogin: stored.freshLogin,
      },
      clearCookie: back.clearCookie,
    });
  });

  function upstreamCallback(connector: Connector): PublicHttpAction {
    return httpActionGeneric(async (ctx, request) => {
      const url = new URL(request.url);
      const state = url.searchParams.get("state");
      if (state === null) {
        return errorPage("Invalid callback", "The provider sent no state.", 400);
      }
      const now = Date.now();
      const claim = await ctx.runMutation(component.authRequests.claimUpstream, {
        upstreamStateHash: await sha256Hex(state),
        connector: connector.name,
        txnCookieHashes: await Promise.all(
          [...readTxnCookies(request).values()].map((cookie) => sha256Hex(cookie)),
        ),
        now,
      });
      if (claim.status === "missing") {
        return errorPage(
          "Sign-in link used",
          "This sign-in link is invalid or was already used. Return to the app and try again.",
          400,
        );
      }
      if (claim.status === "unbound") {
        return unboundPage();
      }
      const back = {
        redirectUri: claim.redirectUri,
        issuer,
        state: claim.state,
        clearCookie: clearTxnCookie(request, claim.requestId),
      };
      if (claim.status === "expired") {
        return authorizationError({
          ...back,
          error: "access_denied",
          description: "The sign-in expired.",
        });
      }
      let upstream: UpstreamFinish;
      try {
        upstream = await finishUpstream({
          connector,
          callbackUrl: callbackUrl(connector),
          currentUrl: url,
          state,
          codeVerifier: claim.upstreamCodeVerifier,
          nonce: claim.upstreamNonce,
        });
      } catch (error) {
        await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
        // The provider's error code picks one fixed answer; nothing the provider wrote is echoed.
        if (error instanceof oauth.AuthorizationResponseError && error.error === "access_denied") {
          return authorizationError({
            ...back,
            error: "access_denied",
            description: `${connector.label} sign-in was declined.`,
          });
        }
        if (
          error instanceof oauth.AuthorizationResponseError &&
          error.error === "temporarily_unavailable"
        ) {
          return authorizationError({
            ...back,
            error: "temporarily_unavailable",
            description: `${connector.label} is temporarily unavailable.`,
          });
        }
        // Only the class name: provider errors carry token responses and decoded claims.
        console.error(
          `Connector "${connector.name}" failed: ${error instanceof Error ? error.constructor.name : typeof error}`,
        );
        return authorizationError({
          ...back,
          error: "server_error",
          description: `${connector.label} sign-in failed.`,
        });
      }
      let authTime = now;
      if (claim.freshLogin) {
        // prompt=login and max_age=0 went upstream, but a provider can still reuse its session;
        // only the id_token's auth_time attests a login during this request. It must fall between
        // the request's creation and now, each widened by the clock skew; auth_time is in whole
        // seconds. A plain OAuth connector has no auth_time, and startConnector already refused it.
        const { authTimeSeconds } = upstream;
        if (
          authTimeSeconds === undefined ||
          authTimeSeconds < Math.floor(claim.createdAt / 1000) - AUTH_TIME_SKEW_SECONDS ||
          authTimeSeconds > Math.floor(now / 1000) + AUTH_TIME_SKEW_SECONDS
        ) {
          await ctx.runMutation(component.authRequests.abandon, { requestId: claim.requestId });
          return authorizationError({
            ...back,
            error: "login_required",
            description: `${connector.label} did not confirm a new login, which prompt=login or max_age asked for.`,
          });
        }
        authTime = authTimeSeconds * 1000;
      }
      const code = randomToken(32);
      const completed = await ctx.runMutation(component.authRequests.complete, {
        requestId: claim.requestId,
        identity: { connector: connector.name, ...upstream.identity },
        authTime,
        codeHash: await sha256Hex(code),
        codeExpiresAt: now + CODE_TTL_MS,
        now,
      });
      if (!completed.ok) {
        return authorizationError({
          ...back,
          error: "access_denied",
          description: "The sign-in expired.",
        });
      }
      return authorizationResponse({ ...back, params: { code } });
    });
  }

  const token = httpActionGeneric(async (ctx, request) => {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/x-www-form-urlencoded")) {
      return oauthError(
        415,
        "invalid_request",
        "The body must be application/x-www-form-urlencoded.",
      );
    }
    const params = new URLSearchParams(await request.text());
    const authorization = request.headers.get("authorization");
    // A 401 carries a challenge (RFC 9110 section 15.5.2), which also names the scheme this endpoint
    // takes for a client that sent its secret in the body (RFC 6749 section 5.2).
    const challenge = { "WWW-Authenticate": 'Basic realm="token"' };
    const clientAuth = readClientAuthentication(authorization, params);
    if (!clientAuth.ok) {
      return oauthError(
        clientAuth.status,
        clientAuth.error,
        clientAuth.description,
        clientAuth.status === 401 ? challenge : {},
      );
    }
    const validation = validateTokenRequest(params, clientAuth.value);
    if (!validation.ok) {
      return oauthError(validation.status, validation.error, validation.description);
    }
    const now = Date.now();
    // The client is authenticated in the transaction that redeems the code.
    const exchange = await ctx.runMutation(component.authRequests.exchangeCode, {
      clientId: clientAuth.value.clientId,
      clientSecretHash: await sha256Hex(clientAuth.value.clientSecret),
      tokenEndpointAuthMethod: clientAuth.value.method,
      codeHash: await sha256Hex(validation.value.code),
      ...(validation.value.redirectUri === undefined
        ? {}
        : { redirectUri: validation.value.redirectUri }),
      codeVerifier: validation.value.codeVerifier,
      ...(registration?.paused?.() === true ? { registrationPaused: true } : {}),
      now,
    });
    if (!exchange.ok) {
      return exchange.error === "invalid_client"
        ? oauthError(401, "invalid_client", exchange.description, challenge)
        : oauthError(400, "invalid_grant", exchange.description);
    }
    const keys = keySet();
    const sub = await pairwiseSubject({
      appId: exchange.appId,
      connector: exchange.identity.connector,
      upstreamId: exchange.identity.upstreamId,
      salt:
        exchange.tenantId === undefined
          ? keys.pairwiseSalt
          : await appSalt(keys.pairwiseSalt, exchange.appId),
    });
    // Claims follow the granted scopes (OIDC Core 5.4); userinfo reads them from the access token.
    const scopes = exchange.scope.split(" ");
    const claims: IdentityClaims = { sub, connector: exchange.identity.connector };
    // The connector's own account id is the same in every app, so only a first-party app, which
    // skips consent as the hub owner's own, receives it. A third-party app's consent promises a
    // stable id, the pairwise `sub`.
    if (exchange.firstParty) {
      claims.connector_account_id = exchange.identity.upstreamId;
    }
    if (scopes.includes("email") && exchange.identity.email !== undefined) {
      claims.email = exchange.identity.email;
      claims.email_verified = exchange.identity.emailVerified === true;
    }
    if (scopes.includes("profile") && exchange.identity.name !== undefined) {
      claims.name = exchange.identity.name;
    }
    if (scopes.includes("profile") && exchange.identity.picture !== undefined) {
      claims.picture = exchange.identity.picture;
    }
    const [idToken, accessToken] = await Promise.all([
      signIdToken({
        keySet: keys,
        issuer,
        clientId: exchange.clientId,
        claims,
        authTime: exchange.authTime,
        nonce: exchange.nonce,
      }),
      signAccessToken({ keySet: keys, issuer, clientId: exchange.clientId, claims }),
    ]);
    await ctx.runMutation(component.signIns.record, {
      appId: exchange.appId,
      clientId: exchange.clientId,
      connector: exchange.identity.connector,
      sub,
      at: now,
    });
    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
      id_token: idToken,
      scope: exchange.scope,
    });
  });

  const userinfo = httpActionGeneric(async (_ctx, request) => {
    const bearer = readBearerToken(request.headers.get("authorization"));
    const claims =
      bearer === null ? null : await verifyAccessToken({ keySet: keySet(), issuer, token: bearer });
    if (claims === null) {
      return json(
        {
          error: "invalid_token",
          error_description: "The access token is missing, invalid or expired.",
        },
        401,
        {
          "WWW-Authenticate": 'Bearer error="invalid_token"',
        },
      );
    }
    return json(claims);
  });

  return {
    /** Mounts every endpoint on the host's router. */
    addHttpRoutes(http: HttpRouter): void {
      http.route({
        path: path("/.well-known/openid-configuration"),
        method: "GET",
        handler: discovery,
      });
      http.route({
        path: `/.well-known/oauth-authorization-server${prefix}`,
        method: "GET",
        handler: discovery,
      });
      http.route({ path: path("/.well-known/jwks.json"), method: "GET", handler: jwks });
      http.route({ path: path("/authorize"), method: "GET", handler: authorize });
      http.route({ path: path("/authorize"), method: "POST", handler: authorize });
      http.route({ path: path("/continue"), method: "GET", handler: continueSignIn });
      http.route({ path: path("/token"), method: "POST", handler: token });
      http.route({ path: path("/userinfo"), method: "GET", handler: userinfo });
      http.route({ path: path("/userinfo"), method: "POST", handler: userinfo });
      for (const connector of connectors.values()) {
        http.route({
          path: path(`/connectors/${connector.name}/callback`),
          method: "GET",
          handler: upstreamCallback(connector),
        });
      }
      if (registration !== undefined) {
        registrationEndpoints({ component, issuer, path, registration }).addRoutes(http);
      }
    },

    /**
     * Administration as internal functions of the host, for `npx convex run`: export them from a
     * host module such as `convex/identityBroker.ts`.
     */
    admin() {
      const { boolean, string } = v;
      return {
        createApp: internalMutationGeneric({
          args: { name: string(), firstParty: boolean() },
          returns: v.object({ appId: string() }),
          handler: async (ctx, args) => {
            const slug =
              args.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "app";
            const appId = `${slug}-${randomToken(4)
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .slice(0, 5)}`;
            await ctx.runMutation(component.apps.create, {
              appId,
              name: args.name,
              firstParty: args.firstParty,
              createdAt: Date.now(),
            });
            return { appId };
          },
        }),
        /**
         * Registers one deployment of `appId` as a client, and answers with the issuer and the
         * client. The secret is in this reply only. The first client creates the app, as a first-party
         * app: whoever runs this function administers this hub, so the app is the team's own.
         */
        registerClient: internalMutationGeneric({
          args: {
            appId: string(),
            redirectUri: string(),
            deploymentType: vDeploymentType,
            clientName: string(),
            softwareVersion: string(),
            tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
          },
          returns: v.object({ issuer: string(), clientId: string(), clientSecret: string() }),
          handler: async (ctx, args) => {
            if (parseRedirectUri(args.redirectUri) === null) {
              throw new Error(
                "The redirect URI must be an absolute https URL without a fragment, or http on a loopback host.",
              );
            }
            const now = Date.now();
            const { appId } = args;
            if ((await ctx.runQuery(component.apps.get, { appId })) === null) {
              await ctx.runMutation(component.apps.create, {
                appId,
                name: appId,
                firstParty: true,
                createdAt: now,
              });
            }
            const clientId = `cl_${randomToken(16)}`;
            const clientSecret = randomToken(32);
            await ctx.runMutation(component.clients.create, {
              clientId,
              appId,
              secretHash: await sha256Hex(clientSecret),
              tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
              redirectUri: args.redirectUri,
              deploymentType: args.deploymentType,
              clientName: args.clientName,
              softwareVersion: args.softwareVersion,
              createdAt: now,
            });
            return { issuer, clientId, clientSecret };
          },
        }),
        deleteClient: internalMutationGeneric({
          args: { clientId: string() },
          returns: v.null(),
          handler: async (ctx, args) => {
            await ctx.runMutation(component.clients.remove, { clientId: args.clientId });
            return null;
          },
        }),
        /** Turns a tenant's switch on or off. It covers every app of the tenant. */
        setTenantSuspended: internalMutationGeneric({
          args: { tenantId: string(), suspended: boolean() },
          returns: v.null(),
          handler: async (ctx, args) => {
            await ctx.runMutation(component.registration.setSuspended, {
              ...args,
              now: Date.now(),
            });
            return null;
          },
        }),
        deleteApp: internalMutationGeneric({
          args: { appId: string() },
          returns: v.null(),
          handler: async (ctx, args) => {
            await ctx.runMutation(component.apps.remove, { appId: args.appId });
            return null;
          },
        }),
        listApps: internalQueryGeneric({
          args: {},
          handler: async (ctx) => await ctx.runQuery(component.apps.list, {}),
        }),
        listClients: internalQueryGeneric({
          args: { appId: string() },
          handler: async (ctx, args) =>
            await ctx.runQuery(component.clients.listByApp, { appId: args.appId }),
        }),
        cleanup: internalMutationGeneric({
          args: {},
          handler: async (ctx) =>
            await ctx.runMutation(component.lifecycle.cleanup, {
              now: Date.now(),
              ...(previewClientIdleDays === undefined
                ? {}
                : { previewClientMaxAgeMs: previewClientIdleDays * 24 * 60 * 60 * 1000 }),
              signInRetentionMs: SIGN_IN_RETENTION_MS,
            }),
        }),
      };
    },
  };
}
