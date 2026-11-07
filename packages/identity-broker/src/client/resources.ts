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

/** The OAuth error code or the class name: provider errors carry token responses. */
function failureName(error: unknown) {
  if (error instanceof oauth.AuthorizationResponseError || error instanceof oauth.ResponseBodyError)
    return error.error;
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
  providers: ResourceProvider[];
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
      { clientId: client.clientId, redirectUri: client.redirectUri },
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
      redirectUri: client.redirectUri,
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
      if (claim.status !== "claimed")
        return errorPage(
          "Authorization unavailable",
          claim.status === "unbound"
            ? "Return to the browser that started authorization."
            : "The authorization expired or was already used.",
          400,
        );
      const back = {
        redirectUri: claim.redirectUri,
        issuer,
        state: claim.state,
        clearCookie: cookies.clear(request, claim.requestId),
      };
      try {
        const tokens = await finishResourceAuthorization({
          provider,
          callbackUrl: callbackUrl(provider),
          currentUrl: url,
          state,
          codeVerifier: claim.upstreamCodeVerifier,
        });
        const code = randomToken(32);
        const completed = await ctx.runMutation(component.resourceRequests.complete, {
          requestId: claim.requestId,
          tokens,
          codeHash: await sha256Hex(code),
          codeExpiresAt: Date.now() + CODE_TTL_MS,
          now: Date.now(),
        });
        if (!completed)
          return authorizationError({
            ...back,
            error: "access_denied",
            description: "The authorization expired.",
          });
        return authorizationResponse({ ...back, params: { code } });
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
    if (refreshToken === null || refreshToken === "")
      return oauthError(400, "invalid_request", "refresh_token is required.");
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
    try {
      const tokens = await refreshResourceToken({
        provider,
        refreshToken: claim.upstreamRefreshToken,
      });
      // The release decision, on the rows as they are now. A client that is gone, or a policy
      // that fails now, refuses the release; the rotation is saved either way.
      const current = await ctx.runQuery(component.clients.withApp, {
        clientId: client.clientId,
      });
      const release = current === null ? null : decide(current);
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
  }

  const revoke = httpActionGeneric(async (ctx, request) => {
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/x-www-form-urlencoded")
    )
      return oauthError(
        415,
        "invalid_request",
        "The body must be application/x-www-form-urlencoded.",
      );
    const params = new URLSearchParams(await request.text());
    const auth = readClientAuthentication(request.headers.get("authorization"), params);
    if (!auth.ok)
      return oauthError(
        auth.status,
        auth.error,
        auth.description,
        auth.status === 401 ? challenge : {},
      );
    const token = params.get("token");
    if (token === null || token === "")
      return oauthError(400, "invalid_request", "token is required.");
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
