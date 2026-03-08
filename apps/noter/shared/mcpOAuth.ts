export const MCP_CONSENT_APP_PATH = "/oauth/mcp/consent";

export const MCP_OAUTH_DENY_ERROR_DESCRIPTION = "authorization_denied_by_user";

export const applyMcpDenyErrorParamsToRedirectUrl = (
  redirectUrl: URL,
  state: string | undefined,
): void => {
  redirectUrl.searchParams.set("error", "access_denied");
  // Keep this token underscore-separated: URLSearchParams encodes spaces as `+`,
  // and Codex surfaces that `+` encoding in the loopback callback page.
  redirectUrl.searchParams.set(
    "error_description",
    MCP_OAUTH_DENY_ERROR_DESCRIPTION,
  );
  if (state !== undefined) {
    redirectUrl.searchParams.set("state", state);
  }
};
