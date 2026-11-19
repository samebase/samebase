import { Effect } from "effect";
import { SIGNING_ALGORITHM } from "../../core/keys.ts";
import { readBearerToken, type TokenEndpointAuthMethod } from "../../core/protocol.ts";
import { invalidToken, json, noToken } from "../../core/responses.ts";
import { HubConfig } from "../../core/services.ts";
import { randomToken, sha256HexEffect } from "../../core/subject.ts";
import { command, GithubSettings } from "./settings.ts";

// Client management (RFC 7592) and what `POST /register` (register.ts) shares with it. Each
// client holds its own registration access token for its own record, so a client can read or
// delete only itself.

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
 * as discovery's `grant_types_supported`: this package configures no API resource, so a client gets
 * no refresh token (design section 9 item 1). `connectors` is the enrollment, the hub's own field.
 */
export function clientInformation(args: {
  issuer: string;
  clientId: string;
  createdAt: number;
  redirectUris: readonly string[];
  clientName: string;
  tenantId: string;
  app: string;
  softwareVersion: string;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  connectors: readonly string[];
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
    grant_types: ["authorization_code"],
    response_types: ["code"],
    application_type: "web",
    subject_type: "public",
    id_token_signed_response_alg: SIGNING_ALGORITHM,
    connectors: args.connectors,
  };
}

/**
 * The credentials of a new client. The secret and the registration access token go to the caller
 * once; the store keeps only their hashes.
 */
export const newClientCredentials = Effect.gen(function* () {
  const clientId = `cl_${yield* randomToken(16)}`;
  const clientSecret = yield* randomToken(32);
  const registrationAccessToken = yield* randomToken(32);
  return {
    clientId,
    clientSecret,
    registrationAccessToken,
    secretHash: yield* sha256HexEffect(clientSecret),
    registrationTokenHash: yield* sha256HexEffect(registrationAccessToken),
  };
});

/**
 * The client id and the token of a request to the client configuration endpoint, or the refusal:
 * `noToken` without a Bearer token, as at `POST /register`, and `invalid_token` without a client
 * id. The client id is the final segment of the path, as it is.
 */
const clientRequest = Effect.fnUntraced(function* (request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (token === null) {
    return noToken("register");
  }
  const clientId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (clientId === "") {
    return invalidToken();
  }
  return { clientId, token, registrationTokenHash: yield* sha256HexEffect(token) };
});

/**
 * `GET <prefix>/register/<client>`: a deploy of a client reads it (RFC 7592 section 2.1), which
 * also renews it and writes its card again from the settings and the rows of that step.
 */
export const readClient = Effect.fn("readClient")(function* (request: Request) {
  const target = yield* clientRequest(request);
  if (target instanceof Response) {
    return target;
  }
  const hub = yield* HubConfig;
  const { allowList } = yield* GithubSettings;
  const result = yield* command("github.renew", {
    clientId: target.clientId,
    registrationTokenHash: target.registrationTokenHash,
    allowList,
    configured: hub.configured,
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
      issuer: hub.issuer,
      clientId: target.clientId,
      createdAt: result.createdAt,
      redirectUris: result.redirectUris,
      clientName: result.clientName,
      tenantId: result.tenantId,
      app: result.app,
      softwareVersion: result.softwareVersion,
      tokenEndpointAuthMethod: result.tokenEndpointAuthMethod,
      connectors: result.connectors,
    }),
    registration_access_token: target.token,
  });
});

/**
 * `DELETE <prefix>/register/<client>`: a preview or development client deletes itself (RFC 7592
 * section 2.3). A production client cannot: a stack destroy can leave a production deployment
 * running, and the hub cannot know that it stopped.
 */
export const deleteClient = Effect.fn("deleteClient")(function* (request: Request) {
  const target = yield* clientRequest(request);
  if (target instanceof Response) {
    return target;
  }
  const result = yield* command("github.remove", {
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

/** `PUT <prefix>/register/<client>`: a client cannot update itself (RFC 7592 section 2.2). */
export const updateClient = (_request: Request) =>
  Effect.succeed(new Response(null, { status: 405, headers: { Allow: "GET, DELETE" } }));
