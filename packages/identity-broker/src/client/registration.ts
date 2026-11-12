import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { SIGNING_ALGORITHM } from "./keys.js";
import { readBearerToken } from "./protocol.js";
import { json } from "./responses.js";
import type { PolicyFunction } from "./policy.js";
import { randomToken, sha256Hex } from "./subject.js";

/**
 * The hub mode. With this option the broker mounts `POST /register` (RFC 7591), where a GitHub
 * Actions run or a development server with the app's initial access token gets a client
 * (src/client/hubClients.ts), `/register/<client>`, where each client reads and deletes its own
 * record with its own registration access token (RFC 7592), and `/moderation/*` for the hub's
 * administrator.
 */
export type RegistrationConfig<
  Connector extends string = string,
  Resource extends string = string,
> = {
  /**
   * What a registration may do, decided from its facts (RFC 137 decision 2): the connectors it may
   * enroll in and use, the API resources it may authorize, and whether it is paused. The sign-in
   * page is not the policy's: it shows unless an exemption of the administrator covers the client
   * (`pageShown`). Run at registration and at each use, on the client's and
   * the tenant's rows, so a change applies to existing clients at once. A policy that throws or
   * answers a malformed value refuses the request, and nothing is allowed by default.
   */
  policy: PolicyFunction<Connector, Resource>;
  /** The key of `/moderation/*`, read in the request. Unset or empty: every request is refused. */
  moderationKey: () => string | undefined;
  /** The name of the hub's sign-in service as users know it, such as `Samebase`. */
  name: string;
  /**
   * The terms of the hub's sign-in service, which the answer of every new client names and the
   * sign-in page links.
   */
  terms: string;
  /**
   * The privacy notice of the hub's sign-in service, linked under the sign-in page. It says what
   * the hub keeps and passes to apps (Google's user data policy; GDPR articles 13 and 14).
   */
  privacy: string;
};

type TokenMethod = "client_secret_post" | "client_secret_basic";

/**
 * The answer to a request with no Bearer token: a challenge with no error code (RFC 6750 section
 * 3.1), but with `realm`, because the scheme needs at least one parameter (section 3).
 */
export const noToken = (realm: "register" | "userinfo") =>
  new Response(null, {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer realm="${realm}"`, "Cache-Control": "no-store" },
  });

/** The answer to a refused Bearer token (RFC 6750 section 3.1). */
export const invalidToken = () =>
  json({ error: "invalid_token", error_description: "The token is invalid." }, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });

/**
 * The answer to a good token whose holder may not do this (RFC 6750 section 3.1). `reason` is the
 * hub's own member: the rule that refused the request.
 */
export const insufficientScope = (description: string, more: { reason?: string } = {}) =>
  json({ error: "insufficient_scope", error_description: description, ...more }, 403, {
    "WWW-Authenticate": 'Bearer error="insufficient_scope"',
  });

/**
 * The client information response (RFC 7591 section 3.2.1), without what only the first holds.
 * `software_id` is `<tenant id>/<app name>`: the app, the same for every deployment of the app.
 * `client_name` is the stage that the hub derived from the proof. `grant_types` is the hub's own,
 * as discovery's `grant_types_supported`. `connectors` is the enrollment, the hub's own field.
 */
export function clientInformation(args: {
  issuer: string;
  clientId: string;
  createdAt: number;
  redirectUris: string[];
  clientName: string;
  tenantId: string;
  app: string;
  softwareVersion: string;
  tokenEndpointAuthMethod: TokenMethod;
  /** The hub has API resources, so a client gets refresh tokens. */
  refreshTokens: boolean;
  connectors: string[];
}) {
  return {
    client_id: args.clientId,
    client_id_issued_at: Math.floor(args.createdAt / 1000),
    client_secret_expires_at: 0,
    registration_client_uri: `${args.issuer}/register/${args.clientId}`,
    redirect_uris: args.redirectUris,
    client_name: args.clientName,
    software_id: `${args.tenantId}/${args.app}`,
    software_version: args.softwareVersion,
    token_endpoint_auth_method: args.tokenEndpointAuthMethod,
    grant_types: args.refreshTokens
      ? ["authorization_code", "refresh_token"]
      : ["authorization_code"],
    response_types: ["code"],
    application_type: "web",
    subject_type: "public",
    id_token_signed_response_alg: SIGNING_ALGORITHM,
    connectors: args.connectors,
  };
}

/**
 * The credentials of a new client. The secret and the registration access token go to the caller
 * once; the component keeps only their hashes. `registrationClientUri` is the client's own record at
 * this host (RFC 7592).
 */
export async function newClientCredentials(issuer: string) {
  const clientId = `cl_${randomToken(16)}`;
  const clientSecret = randomToken(32);
  const registrationAccessToken = randomToken(32);
  return {
    clientId,
    clientSecret,
    registrationAccessToken,
    registrationClientUri: `${issuer}/register/${clientId}`,
    secretHash: await sha256Hex(clientSecret),
    registrationTokenHash: await sha256Hex(registrationAccessToken),
  };
}

/**
 * Client management (RFC 7592). Each client holds its own registration access token for its own
 * record, so a client can read or delete only itself.
 */
export function registrationEndpoints(args: {
  component: ComponentApi;
  issuer: string;
  path: (suffix: string) => string;
  /** The hub has API resources, so a client gets refresh tokens. */
  refreshTokens: boolean;
}) {
  const { component, issuer, path } = args;

  /**
   * The client id and the token of a request to the client configuration endpoint, or the refusal:
   * `noToken` without a Bearer token, as at `POST /register`, and `invalid_token` without
   * a client id.
   */
  async function clientRequest(request: Request) {
    const token = readBearerToken(request.headers.get("authorization"));
    if (token === null) {
      return noToken("register");
    }
    const clientId = new URL(request.url).pathname.split("/").at(-1) ?? "";
    if (clientId === "") {
      return invalidToken();
    }
    return { clientId, token, registrationTokenHash: await sha256Hex(token) };
  }

  const read = httpActionGeneric(async (ctx: GenericActionCtx<GenericDataModel>, request) => {
    const target = await clientRequest(request);
    if (target instanceof Response) {
      return target;
    }
    const result = await ctx.runMutation(component.registration.renew, {
      clientId: target.clientId,
      registrationTokenHash: target.registrationTokenHash,
      now: Date.now(),
    });
    if (!result.ok) {
      // RFC 7592 section 2.1: a client that is gone answers 401, one that may not read answers 403.
      return result.error === "suspended"
        ? insufficientScope("This client is suspended.")
        : invalidToken();
    }
    // The hub stores only the hash of the registration access token, so the read echoes the token
    // that the request presented (RFC 7592 section 3). It never has the client's secret.
    return json({
      ...clientInformation({
        issuer,
        clientId: target.clientId,
        createdAt: result.createdAt,
        redirectUris: result.redirectUris,
        clientName: result.clientName,
        tenantId: result.tenantId,
        app: result.app,
        softwareVersion: result.softwareVersion,
        tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
        refreshTokens: args.refreshTokens,
        connectors: result.connectors,
      }),
      registration_access_token: target.token,
    });
  });

  const remove = httpActionGeneric(async (ctx, request) => {
    const target = await clientRequest(request);
    if (target instanceof Response) {
      return target;
    }
    const result = await ctx.runMutation(component.registration.remove, {
      clientId: target.clientId,
      registrationTokenHash: target.registrationTokenHash,
    });
    if (!result.ok) {
      return result.error === "production"
        ? insufficientScope("A production client cannot delete itself.")
        : invalidToken();
    }
    return new Response(null, { status: 204 });
  });

  /** A client cannot update itself (RFC 7592 section 2.2): it registers a new client instead. */
  const update = httpActionGeneric(
    async () => new Response(null, { status: 405, headers: { Allow: "GET, DELETE" } }),
  );

  return {
    addRoutes(http: HttpRouter): void {
      http.route({ pathPrefix: path("/register/"), method: "GET", handler: read });
      http.route({ pathPrefix: path("/register/"), method: "DELETE", handler: remove });
      http.route({ pathPrefix: path("/register/"), method: "PUT", handler: update });
    },
  };
}
