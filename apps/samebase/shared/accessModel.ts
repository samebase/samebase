export const ACCESS_APP_CREATE = "access_app_create";
export const ACCESS_BROWSER_LOGIN_HANDOFF = "access_browser_login_handoff";

export const ACCESS_KEYS = [
  "access_public",
  "access_user_preferences",
  "access_dashboard",
  "access_provider_connections",
  "access_repo_connect",
  ACCESS_APP_CREATE,
  "access_app_refresh",
  "access_files_read",
  "access_files_write",
  "access_machines",
  "access_mcp",
  ACCESS_BROWSER_LOGIN_HANDOFF,
  "access_schema_graph",
  "access_admin",
] as const;

export type AccessKey = (typeof ACCESS_KEYS)[number];
export type PublicAccessKey = "access_public";
export type AuthenticatedAccessKey = Exclude<AccessKey, PublicAccessKey>;

export const VIEWER_ROLES = [
  "role_anonymous",
  "role_pending_access",
  "role_member",
  "role_staff",
] as const;

export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const ROLE_ACCESS_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_pending_access: ["access_public", "access_user_preferences"],
  role_member: [
    "access_public",
    "access_user_preferences",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    ACCESS_APP_CREATE,
    "access_app_refresh",
    "access_files_read",
    "access_files_write",
    "access_mcp",
    ACCESS_BROWSER_LOGIN_HANDOFF,
  ],
  role_staff: ACCESS_KEYS,
};

export function readAccessKeysForRole(role: ViewerRole): readonly AccessKey[] {
  return ROLE_ACCESS_GRANTS[role];
}

export function canAccess(access: AccessKey, accessKeys: readonly AccessKey[]): boolean {
  return accessKeys.includes(access);
}
