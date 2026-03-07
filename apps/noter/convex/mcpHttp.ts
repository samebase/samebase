import { getAuthUserId } from "@convex-dev/auth/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { randomToken } from "./oauthUtils";
import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
  validateAuthorizeRequestFromUrl,
  validateDynamicClientRegistrationPayload,
} from "./mcpOAuthProtocol";

const MCP_PROVISIONAL_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MCP_AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().startsWith("application/json");
}

export const getMcpOauthProtectedResourceMetadata = httpAction(
  async (_ctx, request) => {
    const origin = parseOrigin(request);
    return jsonResponse(buildMcpProtectedResourceMetadata(origin), 200);
  },
);

export const getMcpOauthAuthorizationServerMetadata = httpAction(
  async (_ctx, request) => {
    const origin = parseOrigin(request);
    return jsonResponse(buildMcpAuthorizationServerMetadata(origin), 200);
  },
);

export const registerMcpOauthClient = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return jsonResponse(
      {
        error: "invalid_request",
        error_description: "content-type must be application/json",
      },
      415,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      {
        error: "invalid_request",
        error_description: "Request body must be valid JSON.",
      },
      400,
    );
  }

  const validation = validateDynamicClientRegistrationPayload(payload);
  if (!validation.ok) {
    return jsonResponse(
      {
        error: "invalid_client_metadata",
        error_description: validation.error,
      },
      validation.status,
    );
  }

  const now = Date.now();
  const clientId = `mcpc_${randomToken(24)}`;
  const provisionalExpiresAt = now + MCP_PROVISIONAL_CLIENT_TTL_MS;

  await ctx.runMutation(internal.mcpOAuth.registerDynamicClient, {
    clientId,
    clientName: validation.value.clientName ?? undefined,
    redirectUris: validation.value.redirectUris,
    grantTypes: validation.value.grantTypes,
    responseTypes: validation.value.responseTypes,
    tokenEndpointAuthMethod: validation.value.tokenEndpointAuthMethod,
    provisionalExpiresAt,
    createdAt: now,
    updatedAt: now,
    metadataJson: JSON.stringify(payload),
  });

  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: validation.value.clientName ?? undefined,
      redirect_uris: validation.value.redirectUris,
      grant_types: validation.value.grantTypes,
      response_types: validation.value.responseTypes,
      token_endpoint_auth_method: validation.value.tokenEndpointAuthMethod,
    },
    201,
  );
});

export const authorizeMcpOauthRequest = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const validation = validateAuthorizeRequestFromUrl(url);
  if (!validation.ok) {
    return jsonResponse(
      {
        error: "invalid_request",
        error_description: validation.error,
      },
      validation.status,
    );
  }

  const client = await ctx.runQuery(internal.mcpOAuth.getClientByClientId, {
    clientId: validation.value.clientId,
  });
  if (!client) {
    return jsonResponse(
      {
        error: "invalid_client",
        error_description: "Unknown client_id.",
      },
      400,
    );
  }

  if (
    client.registrationStatus === "expired" ||
    client.registrationStatus === "disabled"
  ) {
    return jsonResponse(
      {
        error: "invalid_client",
        error_description: "Client is not active.",
      },
      400,
    );
  }

  if (!client.redirectUris.includes(validation.value.redirectUri)) {
    return jsonResponse(
      {
        error: "invalid_request",
        error_description: "redirect_uri is not registered for this client.",
      },
      400,
    );
  }

  const expectedResource = `${parseOrigin(request)}/mcp`;
  if (validation.value.resource !== expectedResource) {
    return jsonResponse(
      {
        error: "invalid_target",
        error_description: "resource must target this MCP server.",
      },
      400,
    );
  }

  const now = Date.now();
  const requestId = `mcpar_${randomToken(24)}`;
  const userId = await getAuthUserId(ctx);
  await ctx.runMutation(internal.mcpOAuth.createAuthRequest, {
    requestId,
    clientId: validation.value.clientId,
    redirectUri: validation.value.redirectUri,
    resource: validation.value.resource,
    scope: validation.value.scopes.join(" "),
    state: validation.value.state ?? undefined,
    codeChallenge: validation.value.codeChallenge,
    codeChallengeMethod: validation.value.codeChallengeMethod,
    userId: userId ?? undefined,
    createdAt: now,
    expiresAt: now + MCP_AUTH_REQUEST_TTL_MS,
  });

  const consentUrl = new URL("/", parseOrigin(request));
  consentUrl.searchParams.set("mcp_consent_request", requestId);
  if (!userId) {
    consentUrl.searchParams.set("mcp_login_required", "1");
  }

  return Response.redirect(consentUrl.toString(), 302);
});
