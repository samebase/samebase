import { buildUrlWithSearchParams, removeUrlSearchParams } from "./urlSearchParams";

export const AUTHORIZATION_PROVIDER_QUERY_PARAM = "authorization-provider";
export const AUTHORIZATION_ERROR_QUERY_PARAM = "authorization-error";

export const AUTHORIZATION_PROVIDERS = [
  "convex",
  "cloudflare",
  "github-app",
  "github-user",
  "google-sign-in",
  "github-sign-in",
] as const;
export type AuthorizationProvider = (typeof AUTHORIZATION_PROVIDERS)[number];

export const AUTHORIZATION_ERROR_CODES = [
  "canceled",
  "expired",
  "access-changed",
  "configuration-changed",
  "target-mismatch",
  "failed",
] as const;
export type AuthorizationErrorCode = (typeof AUTHORIZATION_ERROR_CODES)[number];

export type AuthorizationError = {
  provider: AuthorizationProvider;
  code: AuthorizationErrorCode;
};

const AUTHORIZATION_SENSITIVE_QUERY_PARAMS = [
  "access_token",
  AUTHORIZATION_ERROR_QUERY_PARAM,
  AUTHORIZATION_PROVIDER_QUERY_PARAM,
  "code",
  "code_verifier",
  "error",
  "error_description",
  "id_token",
  "refresh_token",
  "state",
  "token",
] as const;

export function removeAuthorizationSensitiveSearchParams(search: string): string {
  return removeUrlSearchParams(search, AUTHORIZATION_SENSITIVE_QUERY_PARAMS);
}

export function buildAuthorizationErrorUrl(
  returnUrl: string,
  authorizationError: AuthorizationError,
): string {
  return buildUrlWithSearchParams(returnUrl, {
    [AUTHORIZATION_PROVIDER_QUERY_PARAM]: authorizationError.provider,
    [AUTHORIZATION_ERROR_QUERY_PARAM]: authorizationError.code,
  });
}
