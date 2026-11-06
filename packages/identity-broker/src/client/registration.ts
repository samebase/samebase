import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { readBearerToken } from "./protocol.js";
import { json } from "./responses.js";
import { randomToken, sha256Hex } from "./subject.js";

/**
 * The host creates each client in its own mutation with `newClientCredentials` and
 * `component.registration.register`. With this option, each client reads and deletes its own record
 * at `/register/<client>` with its own registration access token (RFC 7592).
 */
export type RegistrationConfig = {
  /** While true, no third-party app can sign in. An emergency brake for all of them. */
  paused?: () => boolean;
};

type TokenMethod = "client_secret_post" | "client_secret_basic";

const registrationError = (status: number, error: string, description: string) =>
  json({ error, error_description: description }, status);

const invalidToken = () =>
  json({ error: "invalid_token", error_description: "The token is invalid." }, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });

/** The client information response (RFC 7591 section 3.2.1), without what only the first holds. */
function clientInformation(args: {
  issuer: string;
  clientId: string;
  createdAt: number;
  redirectUri: string;
  clientName: string;
  softwareId: string;
  softwareVersion: string;
  tokenEndpointAuthMethod: TokenMethod;
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
