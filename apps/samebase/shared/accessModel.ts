export const ACCESS_APP_CREATE = "access_app_create";
export const ACCESS_BROWSER_LOGIN_HANDOFF = "access_browser_login_handoff";
export const ACCESS_FEEDBACK_SUBMIT = "access_feedback_submit";
export const ACCESS_ACCOUNT_DELETION = "access_account_deletion";
export const ACCESS_ACCOUNT_SETTINGS = "access_account_settings";
export const ACCESS_ORGANIZATION_INVITATION_ACCEPT = "access_organization_invitation_accept";

export const ACCESS_KEYS = [
  "access_public",
  ACCESS_ACCOUNT_DELETION,
  ACCESS_ACCOUNT_SETTINGS,
  ACCESS_ORGANIZATION_INVITATION_ACCEPT,
  "access_user_preferences",
  "access_dashboard",
  "access_provider_connections",
  "access_repo_connect",
  ACCESS_APP_CREATE,
  "access_app_refresh",
  "access_files_read",
  "access_files_write",
  "access_mcp",
  ACCESS_FEEDBACK_SUBMIT,
  ACCESS_BROWSER_LOGIN_HANDOFF,
  "access_schema_graph",
  "access_admin",
] as const;

export type AccessKey = (typeof ACCESS_KEYS)[number];
export type PublicAccessKey = "access_public";
export type AuthenticatedAccessKey = Exclude<AccessKey, PublicAccessKey>;

export const VIEWER_ROLES = [
  "role_anonymous",
  "role_deleting",
  "role_pending_access",
  "role_terms_pending",
  "role_member",
  "role_staff",
] as const;

export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const ROLE_ACCESS_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_deleting: ["access_public", ACCESS_ACCOUNT_DELETION],
  role_pending_access: [
    "access_public",
    ACCESS_ACCOUNT_DELETION,
    ACCESS_ACCOUNT_SETTINGS,
    ACCESS_ORGANIZATION_INVITATION_ACCEPT,
    "access_user_preferences",
  ],
  role_terms_pending: ["access_public", ACCESS_ACCOUNT_DELETION, ACCESS_ACCOUNT_SETTINGS],
  role_member: [
    "access_public",
    ACCESS_ACCOUNT_DELETION,
    ACCESS_ACCOUNT_SETTINGS,
    ACCESS_ORGANIZATION_INVITATION_ACCEPT,
    "access_user_preferences",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    ACCESS_APP_CREATE,
    "access_app_refresh",
    "access_mcp",
    ACCESS_FEEDBACK_SUBMIT,
    ACCESS_BROWSER_LOGIN_HANDOFF,
    "access_schema_graph",
  ],
  role_staff: ACCESS_KEYS,
};

export function readAccessKeysForRole(role: ViewerRole): readonly AccessKey[] {
  return ROLE_ACCESS_GRANTS[role];
}

export function canAccess(access: AccessKey, accessKeys: readonly AccessKey[]): boolean {
  return accessKeys.includes(access);
}
