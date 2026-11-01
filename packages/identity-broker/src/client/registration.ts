import {
  httpActionGeneric,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { parseRedirectUri, readBearerToken } from "./protocol.js";
import { json } from "./responses.js";
import { randomToken, sha256Hex } from "./subject.js";

export type RegistrationConfig = {
  /**
   * The initial access token of RFC 7591 section 3, read in the request. Whoever holds it can create
   * clients of third-party apps, and can do nothing to the host's own apps. Absent: every request
   * is refused.
   */
  initialAccessToken: () => string | undefined;
  /** The one connector of every app that registers here. */
  connector: string;
  /** While true, no app from `/register` can sign in or register. An emergency brake for all of them. */
  paused?: () => boolean;
};

type TokenMethod = "client_secret_post" | "client_secret_basic";

type ClientMetadata = {
  redirectUri: string;
  clientName: string;
  softwareId: string;
  softwareVersion: string;
  tenantId: string;
  deploymentType: "production" | "preview";
  tokenEndpointAuthMethod: TokenMethod;
};

const registrationError = (status: number, error: string, description: string) =>
  json({ error, error_description: description }, status);

const invalidToken = () =>
  json({ error: "invalid_token", error_description: "The token is invalid." }, 401, {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });

function nonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

/** Only values that say the same as this hub's one flow pass: a field can be left out, not changed. */
function onlyValue(value: unknown, expected: string): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.length === 1 && value[0] === expected)
  );
}

/**
 * The client metadata of RFC 7591 section 2: one exact redirect URI, and `software_id` as the app.
 * `tenant_id` and `deployment_type` are extensions, which the section allows. All of it is
 * self-asserted (section 5), so it counts only because the caller holds the initial access token.
 */
function parseClientMetadata(
  value: unknown,
): ClientMetadata | { error: string; description: string } {
  const body = asRecord(value);
  if (body === null) {
    return { error: "invalid_client_metadata", description: "The body must be a JSON object." };
  }
  const redirectUris = body["redirect_uris"];
  if (!Array.isArray(redirectUris) || redirectUris.length !== 1) {
    return { error: "invalid_redirect_uri", description: "Send exactly one redirect URI." };
  }
  const redirectUri: unknown = redirectUris[0];
  if (typeof redirectUri !== "string" || parseRedirectUri(redirectUri) === null) {
    return {
      error: "invalid_redirect_uri",
      description: "The redirect URI must be an absolute https URL without a fragment.",
    };
  }
  const clientName = nonEmptyString(body, "client_name");
  const softwareId = nonEmptyString(body, "software_id");
  const softwareVersion = nonEmptyString(body, "software_version");
  const tenantId = nonEmptyString(body, "tenant_id");
  const deploymentType = body["deployment_type"];
  const method = body["token_endpoint_auth_method"];
  if (
    clientName === undefined ||
    softwareId === undefined ||
    softwareVersion === undefined ||
    tenantId === undefined ||
    (deploymentType !== "production" && deploymentType !== "preview") ||
    (method !== "client_secret_post" && method !== "client_secret_basic") ||
    !onlyValue(body["grant_types"], "authorization_code") ||
    !onlyValue(body["response_types"], "code")
  ) {
    return { error: "invalid_client_metadata", description: "The client metadata is not valid." };
  }
  return {
    redirectUri,
    clientName,
    softwareId,
    softwareVersion,
    tenantId,
    deploymentType,
    tokenEndpointAuthMethod: method,
  };
}

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
 * Dynamic client registration (RFC 7591) and client management (RFC 7592). The initial access token
 * opens `/register` and the tenant switch. Each client holds its own registration access token for
 * its own record, so a client can read or delete only itself.
 */
export function registrationEndpoints(args: {
  component: ComponentApi;
  issuer: string;
  path: (suffix: string) => string;
  registration: RegistrationConfig;
}) {
  const { component, issuer, path, registration } = args;

  /** Compared by hash, so the time it takes says nothing about the token. */
  async function holdsInitialToken(request: Request): Promise<boolean> {
    const expected = registration.initialAccessToken();
    const presented = readBearerToken(request.headers.get("authorization"));
    return (
      expected !== undefined &&
      expected !== "" &&
      presented !== null &&
      (await sha256Hex(presented)) === (await sha256Hex(expected))
    );
  }

  const register = httpActionGeneric(async (ctx, request) => {
    if (!(await holdsInitialToken(request))) {
      return invalidToken();
    }
    if (registration.paused?.() === true) {
      return registrationError(403, "access_denied", "Registration is paused.");
    }
    const metadata = parseClientMetadata(await request.json().catch(() => null));
    if ("error" in metadata) {
      return registrationError(400, metadata.error, metadata.description);
    }
    const now = Date.now();
    const clientId = `cl_${randomToken(16)}`;
    const clientSecret = randomToken(32);
    const registrationAccessToken = randomToken(32);
    const result = await ctx.runMutation(component.registration.register, {
      tenantId: metadata.tenantId,
      appId: metadata.softwareId,
      connector: registration.connector,
      deploymentType: metadata.deploymentType,
      clientId,
      secretHash: await sha256Hex(clientSecret),
      registrationTokenHash: await sha256Hex(registrationAccessToken),
      tokenEndpointAuthMethod: metadata.tokenEndpointAuthMethod,
      redirectUri: metadata.redirectUri,
      clientName: metadata.clientName,
      softwareVersion: metadata.softwareVersion,
      now,
    });
    if (!result.ok) {
      return registrationError(403, "access_denied", `Registration refused: ${result.error}.`);
    }
    return json(
      {
        ...clientInformation({
          issuer,
          clientId,
          createdAt: now,
          redirectUri: metadata.redirectUri,
          clientName: metadata.clientName,
          softwareId: metadata.softwareId,
          softwareVersion: metadata.softwareVersion,
          tokenEndpointAuthMethod: metadata.tokenEndpointAuthMethod,
        }),
        client_secret: clientSecret,
        registration_access_token: registrationAccessToken,
      },
      201,
    );
  });

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
    return result.ok ? new Response(null, { status: 204 }) : invalidToken();
  });

  const suspension = httpActionGeneric(async (ctx, request) => {
    if (!(await holdsInitialToken(request))) {
      return invalidToken();
    }
    const body = asRecord(await request.json().catch(() => null));
    const tenantId = body === null ? undefined : nonEmptyString(body, "tenant_id");
    const suspended = body?.["suspended"];
    if (tenantId === undefined || typeof suspended !== "boolean") {
      return registrationError(400, "invalid_request", "Send tenant_id and suspended.");
    }
    await ctx.runMutation(component.registration.setSuspended, {
      tenantId,
      suspended,
      now: Date.now(),
    });
    return new Response(null, { status: 204 });
  });

  return {
    addRoutes(http: HttpRouter): void {
      http.route({ path: path("/register"), method: "POST", handler: register });
      http.route({ pathPrefix: path("/register/"), method: "GET", handler: read });
      http.route({ pathPrefix: path("/register/"), method: "DELETE", handler: remove });
      http.route({ path: path("/tenant-suspension"), method: "POST", handler: suspension });
    },
  };
}
