import { buildUrlWithSearchParams } from "./urlSearchParams";

export const MCP_CONSENT_APP_PATH = "/oauth/mcp/consent";

export const MCP_OAUTH_DENY_ERROR_DESCRIPTION = "authorization_denied_by_user";

type McpDenyErrorSearchParams = {
  error: "access_denied";
  error_description: typeof MCP_OAUTH_DENY_ERROR_DESCRIPTION;
  state: string | undefined;
};
type McpAuthorizationSuccessSearchParams = {
  code: string;
  state: string | undefined;
};

export function buildMcpDenyErrorRedirectUrl(
  redirectUrl: string | URL,
  state: string | undefined,
): string {
  // Keep this token underscore-separated: URLSearchParams encodes spaces as `+`,
  // and Codex surfaces that `+` encoding in the loopback callback page.
  return buildUrlWithSearchParams(redirectUrl, {
    error: "access_denied",
    error_description: MCP_OAUTH_DENY_ERROR_DESCRIPTION,
    state,
  } satisfies McpDenyErrorSearchParams);
}

export const applyMcpDenyErrorParamsToRedirectUrl = (
  redirectUrl: URL,
  state: string | undefined,
): void => {
  redirectUrl.href = buildMcpDenyErrorRedirectUrl(redirectUrl, state);
};

export function buildMcpAuthorizationSuccessRedirectUrl(args: {
  redirectUri: string | URL;
  authorizationCode: string;
  state: string | undefined;
}): string {
  return buildUrlWithSearchParams(args.redirectUri, {
    code: args.authorizationCode,
    state: args.state,
  } satisfies McpAuthorizationSuccessSearchParams);
}
