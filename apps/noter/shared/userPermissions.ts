export const USER_PERMISSION_ORDER = [
  "dashboard.monitoring.view",
  "fileView.access",
  "developerTools.view",
  "machines.access",
] as const;

export type UserPermission = (typeof USER_PERMISSION_ORDER)[number];

export function hasUserPermission(
  permissions: readonly UserPermission[] | undefined,
  permission: UserPermission,
): boolean {
  return permissions?.includes(permission) === true;
}
