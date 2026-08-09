import { buildUrlWithSearchParams } from "./urlSearchParams";

export const MCP_CONSENT_APP_PATH = "/oauth/mcp/consent";

export const MCP_OAUTH_DENY_ERROR_DESCRIPTION = "authorization_denied_by_user";

type McpDenyErrorSearchParams = {
  error: "access_denied";
  error_description: typeof MCP_OAUTH_DENY_ERROR_DESCRIPTION;
  iss: string;
  state: string | undefined;
};

type McpAuthorizationSuccessSearchParams = {
  code: string;
  iss: string;
  state: string | undefined;
};

export const buildMcpAuthorizationSuccessRedirectUrl = (
  redirectUri: string,
  params: McpAuthorizationSuccessSearchParams,
): string => buildUrlWithSearchParams(redirectUri, params);

export const applyMcpDenyErrorParamsToRedirectUrl = (
  redirectUrl: URL,
  state: string | undefined,
  issuer: string,
): void => {
  // Keep this token underscore-separated: URLSearchParams encodes spaces as `+`,
  // and Codex surfaces that `+` encoding in the loopback callback page.
  redirectUrl.href = buildUrlWithSearchParams(redirectUrl, {
    error: "access_denied",
    error_description: MCP_OAUTH_DENY_ERROR_DESCRIPTION,
    iss: issuer,
    state,
  } satisfies McpDenyErrorSearchParams);
};
