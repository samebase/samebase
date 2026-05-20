import { ajvConvexOAuthTokenResponse } from "./validators.generated";
import { validatePayload } from "./payloadValidation";

const CONVEX_OAUTH_TOKEN_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
  "access_token",
  "token_type",
]);

export type ConvexOAuthTokenResponse = {
  access_token: string;
  token_type: "bearer";
};

export function parseConvexOAuthTokenResponse(
  payload: unknown,
): ConvexOAuthTokenResponse {
  const tokenResponse = validatePayload({
    path: "/oauth/token",
    schemaName: "ConvexOAuthTokenResponse",
    validator: ajvConvexOAuthTokenResponse,
    payload,
  });
  warnUnexpectedConvexOAuthTokenResponseFields(payload);
  return {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type,
  };
}

function warnUnexpectedConvexOAuthTokenResponseFields(payload: unknown): void {
  const fields = collectUnexpectedConvexOAuthTokenResponseFields(payload);
  if (fields.length === 0) {
    return;
  }

  // TODO: Send this schema-drift event through server-side PostHog once the
  // backend analytics client exists.
  console.warn("convex:api:unexpected_response_fields", {
    path: "/oauth/token",
    schemaName: "ConvexOAuthTokenResponse",
    fields,
  });
}

function collectUnexpectedConvexOAuthTokenResponseFields(
  payload: unknown,
): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  return Object.keys(payload)
    .filter((field) => !CONVEX_OAUTH_TOKEN_RESPONSE_FIELDS.has(field))
    .sort();
}
