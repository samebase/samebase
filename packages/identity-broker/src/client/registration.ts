import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { readBearerToken } from "./protocol.js";
import { json } from "./responses.js";
import type { PolicyFunction } from "./policy.js";
import { randomToken, sha256Hex } from "./subject.js";

/**
 * The hub mode. With this option the broker mounts `POST /hub-clients`, where a GitHub Actions run or
 * a development server with the app's initial access token gets a client
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

const registrationError = (status: number, error: string, description: string) =>
  json({ error, error_description: description }, status);

const invalidToken = () =>
  json({ error: "invalid_token", error_description: "The token is invalid." }, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });

/**
 * The client information response (RFC 7591 section 3.2.1), without what only the first holds.
 * `connectors` is the enrollment, the hub's own field.
 */
function clientInformation(args: {
  issuer: string;
  clientId: string;
  createdAt: number;
  redirectUri: string;
  clientName: string;
  softwareId: string;
  softwareVersion: string;
  tokenEndpointAuthMethod: TokenMethod;
  connectors: string[];
}) {
  return {
    client_id: args.clientId,
    client_id_issued_at: Math.floor(args.createdAt / 1000),
    client_secret_expires_at: 0,
    registration_client_uri: `${args.issuer}/register/${args.clientId}`,
    redirect_uris: [args.redirectUri],
    client_name: args.clientName,
    software_id: args.softwareId,
    software_version: args.softwareVersion,
    token_endpoint_auth_method: args.tokenEndpointAuthMethod,
    grant_types: ["authorization_code"],
    response_types: ["code"],
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
}) {
  const { component, issuer, path } = args;

  /** The client id and the token of a request to the client configuration endpoint. */
  async function clientRequest(request: Request) {
    const clientId = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const token = readBearerToken(request.headers.get("authorization"));
    return token === null || clientId === ""
      ? null
      : { clientId, registrationTokenHash: await sha256Hex(token) };
  }

  const read = httpActionGeneric(async (ctx: GenericActionCtx<GenericDataModel>, request) => {
    const target = await clientRequest(request);
    if (target === null) {
      return invalidToken();
    }
    const result = await ctx.runMutation(component.registration.renew, {
      ...target,
      now: Date.now(),
    });
    if (!result.ok) {
      // RFC 7592 section 2.1: a client that is gone answers 401, one that may not read answers 403.
      return result.error === "suspended"
        ? registrationError(403, "access_denied", "This client is suspended.")
        : invalidToken();
    }
    return json(
      clientInformation({
        issuer,
        clientId: target.clientId,
        createdAt: result.createdAt,
        redirectUri: result.redirectUri,
        clientName: result.clientName,
        softwareId: result.appId,
        softwareVersion: result.softwareVersion,
        tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
        connectors: result.connectors,
      }),
    );
  });

  const remove = httpActionGeneric(async (ctx, request) => {
    const target = await clientRequest(request);
    if (target === null) {
      return invalidToken();
    }
    const result = await ctx.runMutation(component.registration.remove, target);
    if (!result.ok) {
      return result.error === "production"
        ? registrationError(403, "access_denied", "A production client cannot delete itself.")
        : invalidToken();
    }
    return new Response(null, { status: 204 });
  });

  return {
    addRoutes(http: HttpRouter): void {
      http.route({ pathPrefix: path("/register/"), method: "GET", handler: read });
      http.route({ pathPrefix: path("/register/"), method: "DELETE", handler: remove });
    },
  };
}
