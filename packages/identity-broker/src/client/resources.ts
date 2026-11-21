import {
  httpActionGeneric,
  type FunctionReturnType,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import * as oauth from "oauth4webapi";
import type { ComponentApi } from "../component/_generated/component.js";
import { errorPage } from "./html.js";
import { policyArg, type Decision } from "./policy.js";
import { readClientAuthentication, validateAuthorizeRest, type TokenInput } from "./protocol.js";
import {
  authorizationError,
  authorizationResponse,
  json,
  oauthError,
  readParameters,
  redirect,
} from "./responses.js";
import {
  finishResourceAuthorization,
  refreshResourceToken,
  startResourceAuthorization,
  type ResourceProvider,
} from "./resourceProviders.js";
import { randomToken, sha256Hex } from "./subject.js";

type Ctx = GenericActionCtx<GenericDataModel>;
type ClientWithApp = NonNullable<FunctionReturnType<ComponentApi["clients"]["withApp"]>>;
const REQUEST_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;
const challenge = { "WWW-Authenticate": 'Basic realm="token"' };

/** The error codes of RFC 6749 sections 4.1.2.1 and 5.2 and RFC 8707, which a log may name. */
const OAUTH_ERRORS = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "access_denied",
  "unsupported_response_type",
  "server_error",
  "temporarily_unavailable",
  "invalid_target",
]);

/**
 * What a log says of a provider failure: a standard OAuth error code, else the class name. Provider
 * errors carry token responses and free text, and none of that is logged.
 */
function failureName(error: unknown) {
  if (
    (error instanceof oauth.AuthorizationResponseError ||
      error instanceof oauth.ResponseBodyError) &&
    OAUTH_ERRORS.has(error.error)
  ) {
    return error.error;
  }
  return error instanceof Error ? error.constructor.name : typeof error;
}

/** Token responses remain RFC 6749 responses. Provider expiry starts upstream, before redemption. */
export function resourceTokenResponse(
  tokens: { accessToken: string; scope: string; expiresAt?: number },
  refreshToken?: string,
) {
  return json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    ...(tokens.scope === "" ? {} : { scope: tokens.scope }),
    ...(tokens.expiresAt === undefined
      ? {}
      : { expires_in: Math.max(0, Math.floor((tokens.expiresAt - Date.now()) / 1000)) }),
    ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
  });
}

export function resourceEndpoints(options: {
  component: ComponentApi;
  issuer: string;
  path: (suffix: string) => string;
  providers: readonly ResourceProvider[];
  /** The host's decision for a client at this request; null when its policy refused (see `decide`). */
  decide: (found: ClientWithApp) => Decision | null;
  cookies: {
    prefix: string;
    attributes: string;
    read: (request: Request) => Map<string, string>;
    clear: (request: Request, requestId: string) => string | undefined;
  };
}) {
  const { component, issuer, path, cookies, decide } = options;
  const providers = new Map(options.providers.map((provider) => [provider.resource, provider]));
  const callbackUrl = (provider: ResourceProvider) =>
    `${issuer}/connections/${provider.name}/callback`;
  const refusedPage = () =>
    errorPage(
      "API authorization unavailable",
      "This client cannot connect this API resource.",
      403,
    );

  /**
   * The start of an API authorization. Nobody has continued from a page yet, so every refusal is
   * an error page here, as at `/authorize` (RFC 9700 section 4.11.2).
   */
  async function authorize(
    ctx: Ctx,
    params: URLSearchParams,
    found: ClientWithApp,
    /** The return address the request named, one of the client's (checked at `/authorize`). */
    redirectUri: string,
  ): Promise<Response> {
    const { client, app } = found;
    if (app === null) {
      return errorPage("API authorization unavailable", "The client's app is gone.", 400);
    }
    // A blocked app starts no provider authorization, as it starts no sign-in.
    if (app.suspended) {
      return errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403);
    }
    const decision = decide(found);
    if (decision === null) {
      return errorPage(
        "API authorization unavailable",
        "Authorization is not available right now. Try again later.",
        503,
      );
    }
    if (decision.paused) {
      return errorPage(
        "API authorization unavailable",
        "Authorization is paused. Try again later.",
        503,
      );
    }
    const targets = params.getAll("resource");
    const provider = targets.length === 1 ? providers.get(targets[0] ?? "") : undefined;
    if (provider === undefined) {
      return errorPage("API authorization refused", "Request one configured API resource.", 400);
    }
    if (!decision.resources.includes(provider.resource)) {
      return refusedPage();
    }
    const parsed = validateAuthorizeRest(
      params,
      { clientId: client.clientId, redirectUri },
      "resource",
    );
    if (!parsed.ok) {
      return errorPage("API authorization refused", parsed.description, 400);
    }
    // RFC 6749 section 3.3: a response without `scope` would claim the requested scope was granted.
    if (provider.scopes.length === 0 && parsed.value.scopes.length > 0) {
      return errorPage("API authorization refused", "This API resource has no scopes.", 400);
    }
    const start = await startResourceAuthorization({
      provider,
      callbackUrl: callbackUrl(provider),
    });
    const requestId = randomToken(24);
    const cookie = randomToken(32);
    const created = await ctx.runMutation(component.resourceRequests.create, {
      requestId,
      clientId: client.clientId,
      redirectUri,
      resource: provider.resource,
      ...(parsed.value.state === undefined ? {} : { state: parsed.value.state }),
      codeChallenge: parsed.value.codeChallenge,
      txnCookieHash: await sha256Hex(cookie),
      expiresAt: Date.now() + REQUEST_TTL_MS,
      upstreamStateHash: await sha256Hex(start.state),
      upstreamCodeVerifier: start.codeVerifier,
      policy: policyArg(decision),
    });
    if (!created) {
      return refusedPage();
    }
    const response = redirect(start.url);
    response.headers.append(
      "Set-Cookie",
      `${cookies.prefix}${requestId}=${cookie}; ${cookies.attributes}; Max-Age=${REQUEST_TTL_MS / 1000}`,
    );
    return response;
  }

  function callback(provider: ResourceProvider) {
    return httpActionGeneric(async (ctx, request) => {
      const url = new URL(request.url);
      const state = url.searchParams.get("state");
      if (state === null) return errorPage("Invalid callback", "The provider sent no state.", 400);
      const claim = await ctx.runMutation(component.resourceRequests.claim, {
        stateHash: await sha256Hex(state),
        resource: provider.resource,
        cookieHashes: await Promise.all([...cookies.read(request).values()].map(sha256Hex)),
        now: Date.now(),
      });
      if (claim.status === "missing" || claim.status === "unbound")
        return errorPage(
          "Authorization unavailable",
          claim.status === "unbound"
            ? "Return to the browser that started authorization."
            : "The authorization was already used.",
          400,
        );
      // The browser holds the request's cookie: from here on, every outcome goes to the app.
      const back = {
        redirectUri: claim.redirectUri,
        issuer,
        state: claim.state,
        clearCookie: cookies.clear(request, claim.requestId),
      };
      const expired = () =>
        authorizationError({
          ...back,
          error: "access_denied",
          description: "The authorization expired.",
        });
      if (claim.status === "expired") return expired();
      let tokens;
      try {
        tokens = await finishResourceAuthorization({
          provider,
          callbackUrl: callbackUrl(provider),
          currentUrl: url,
          state,
          codeVerifier: claim.upstreamCodeVerifier,
        });
      } catch (error) {
        await ctx.runMutation(component.resourceRequests.abandon, { requestId: claim.requestId });
        console.error(`Resource "${provider.name}" failed: ${failureName(error)}`);
        return authorizationError({
          ...back,
          error:
            error instanceof oauth.AuthorizationResponseError && error.error === "access_denied"
              ? "access_denied"
              : "server_error",
          description: "The provider authorization did not complete.",
        });
      }
      // The completion: the decision again, on the rows as they are now, then the mutation, which
      // reads them once more. The provider's code is spent, so whatever fails in here still
      // answers the app, and the request is abandoned when that write goes through.
      const unavailable = () =>
        authorizationError({
          ...back,
          error: "temporarily_unavailable",
          description: "Authorization is not available right now.",
        });
      try {
        const current = await ctx.runQuery(component.clients.withApp, {
          clientId: claim.clientId,
        });
        const completion = current === null ? null : decide(current);
        if (completion === null) {
          await ctx.runMutation(component.resourceRequests.abandon, {
            requestId: claim.requestId,
          });
          return unavailable();
        }
        const code = randomToken(32);
        const completed = await ctx.runMutation(component.resourceRequests.complete, {
          requestId: claim.requestId,
          tokens,
          codeHash: await sha256Hex(code),
          codeExpiresAt: Date.now() + CODE_TTL_MS,
          policy: policyArg(completion),
          now: Date.now(),
        });
        switch (completed) {
          case "completed":
            return authorizationResponse({ ...back, params: { code } });
          case "refused":
            return completion.paused
              ? authorizationError({
                  ...back,
                  error: "temporarily_unavailable",
                  description: "Authorization is paused.",
                })
              : authorizationError({
                  ...back,
                  error: "access_denied",
                  description: "This client cannot connect this API resource.",
                });
          case "gone":
            return expired();
          default:
            return completed satisfies never;
        }
      } catch (error) {
        console.error(`Resource "${provider.name}" completion failed: ${failureName(error)}`);
        try {
          await ctx.runMutation(component.resourceRequests.abandon, {
            requestId: claim.requestId,
          });
        } catch {
          // The request stays claimed until it expires; nothing can finish it.
        }
        return unavailable();
      }
    });
  }

  /**
   * A refresh has two decisions: the admission, before the provider is called, and the release,
   * after it answered, each on the rows of that moment. A refused release keeps the grant with the
   * provider's rotation and answers 401 (RFC 137 decision 7).
   */
  async function refresh(
    ctx: Ctx,
    params: URLSearchParams,
    client: TokenInput["client"],
  ): Promise<Response> {
    const refreshToken = params.get("refresh_token");
    if (refreshToken === null)
      return oauthError(400, "invalid_request", "refresh_token is required.");
    // RFC 6749 section 3.3: the broker cannot narrow the provider's token and keeps no grant scope,
    // so a response could not say which scope the token has.
    if (params.has("scope"))
      return oauthError(400, "invalid_scope", "A refresh cannot change the scope of this grant.");
    if (params.getAll("resource").length > 1)
      return oauthError(400, "invalid_target", "Request one API resource.");
    const resource = params.get("resource") ?? undefined;
    const found = await ctx.runQuery(component.clients.withApp, { clientId: client.clientId });
    const admission = found === null ? null : decide(found);
    if (found === null)
      return oauthError(401, "invalid_client", "Client authentication failed.", challenge);
    if (admission === null)
      return oauthError(503, "temporarily_unavailable", "Refresh is not available right now.");
    const claim = await ctx.runMutation(component.resourceRequests.claimRefresh, {
      clientId: client.clientId,
      clientSecretHash: await sha256Hex(client.clientSecret),
      tokenEndpointAuthMethod: client.method,
      tokenHash: await sha256Hex(refreshToken),
      ...(resource === undefined ? {} : { resource }),
      policy: policyArg(admission),
      now: Date.now(),
    });
    if (!claim.ok) {
      const status =
        claim.error === "invalid_client"
          ? 401
          : claim.error === "temporarily_unavailable"
            ? 503
            : 400;
      return oauthError(status, claim.error, claim.description, status === 401 ? challenge : {});
    }
    const provider = providers.get(claim.resource);
    if (provider === undefined)
      return oauthError(400, "invalid_target", "The API resource is unavailable.");
    let tokens;
    try {
      tokens = await refreshResourceToken({ provider, refreshToken: claim.upstreamRefreshToken });
    } catch (error) {
      // Only the provider can say a token is dead. Its replay check judges any retry of this one.
      const rejected = error instanceof oauth.ResponseBodyError && error.error === "invalid_grant";
      await ctx.runMutation(component.resourceRequests.failRefresh, {
        grantId: claim.grantId,
        attempt: claim.attempt,
        rejected,
      });
      console.error(`Resource "${provider.name}" refresh failed: ${failureName(error)}`);
      return rejected
        ? oauthError(400, "invalid_grant", "The provider refused this grant. Authorize again.")
        : oauthError(503, "temporarily_unavailable", "The provider is unavailable. Retry shortly.");
    }
    // The release decision, on the rows as they are now. A client that is gone, a policy that
    // fails now, or a read that fails refuses the release; the provider may have rotated the
    // refresh token, and only `finishRefresh` saves it, so it runs either way.
    let release: Decision | null = null;
    try {
      const current = await ctx.runQuery(component.clients.withApp, {
        clientId: client.clientId,
      });
      release = current === null ? null : decide(current);
    } catch (error) {
      console.error(`Resource "${provider.name}" release read failed: ${failureName(error)}`);
    }
    const finished = await ctx.runMutation(component.resourceRequests.finishRefresh, {
      grantId: claim.grantId,
      attempt: claim.attempt,
      tokens,
      policy: release === null ? null : policyArg(release),
      now: Date.now(),
    });
    switch (finished) {
      case "released":
        return resourceTokenResponse(tokens, refreshToken);
      case "refused":
        return oauthError(401, "invalid_client", "Client authentication failed.", challenge);
      case "stale":
        return oauthError(
          503,
          "temporarily_unavailable",
          "Another refresh holds this grant. Retry shortly.",
        );
      case "gone":
        return oauthError(
          400,
          "invalid_grant",
          "The grant is no longer available. Authorize again.",
        );
      default:
        return finished satisfies never;
    }
  }

  const revoke = httpActionGeneric(async (ctx, request) => {
    const params = await readParameters(request);
    if (params === null)
      return oauthError(
        400,
        "invalid_request",
        "The body must be application/x-www-form-urlencoded.",
      );
    const auth = readClientAuthentication(request.headers.get("authorization"), params);
    if (!auth.ok)
      return oauthError(
        auth.status,
        auth.error,
        auth.description,
        auth.status === 401 ? challenge : {},
      );
    const token = params.get("token");
    if (token === null) return oauthError(400, "invalid_request", "token is required.");
    const authenticated = await ctx.runMutation(component.resourceRequests.revoke, {
      clientId: auth.value.clientId,
      clientSecretHash: await sha256Hex(auth.value.clientSecret),
      tokenEndpointAuthMethod: auth.value.method,
      tokenHash: await sha256Hex(token),
    });
    return authenticated
      ? new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } })
      : oauthError(401, "invalid_client", "Client authentication failed.", challenge);
  });

  return {
    authorize,
    refresh,
    enabled: providers.size > 0,
    scopes: [...new Set(options.providers.flatMap((provider) => [...provider.scopes]))],
    addRoutes(http: HttpRouter) {
      if (providers.size > 0)
        http.route({ path: path("/revoke"), method: "POST", handler: revoke });
      for (const provider of providers.values())
        http.route({
          path: path(`/connections/${provider.name}/callback`),
          method: "GET",
          handler: callback(provider),
        });
    },
  };
}
