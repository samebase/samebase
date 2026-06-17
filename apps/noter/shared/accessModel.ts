export const ACCESS_KEYS = [
  "access_public",
  "access_dashboard",
  "access_provider_connections",
  "access_repo_connect",
  "access_app_create",
  "access_app_refresh",
  "access_files_read",
  "access_files_write",
  "access_machines",
  "access_mcp",
  "access_admin",
] as const;

export type AccessKey = (typeof ACCESS_KEYS)[number];

export const VIEWER_ROLES = ["role_anonymous", "role_member", "role_staff"] as const;

export type ViewerRole = (typeof VIEWER_ROLES)[number];

export const ACCESS_GRANTS: Record<ViewerRole, readonly AccessKey[]> = {
  role_anonymous: ["access_public"],
  role_member: [
    "access_public",
    "access_dashboard",
    "access_provider_connections",
    "access_repo_connect",
    "access_app_create",
    "access_app_refresh",
    "access_files_read",
    "access_files_write",
  ],
  role_staff: ACCESS_KEYS,
};

export function canAccess(access: AccessKey, role: ViewerRole): boolean {
  return ACCESS_GRANTS[role].includes(access);
}
