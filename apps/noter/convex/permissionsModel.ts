import { Infer, v } from "convex/values";
import {
  USER_PERMISSION_ORDER,
  type UserPermission,
} from "../shared/userPermissions";

const { array, boolean, id, literal, object, union } = v;
const [
  dashboardMonitoringViewPermission,
  fileViewAccessPermission,
  developerToolsViewPermission,
  machinesAccessPermission,
] = USER_PERMISSION_ORDER;

const ADMIN_USERNAMES = ["nicu-chiciuc"];
const ADMIN_EMAILS = new Set([
  "nicu.dev@gmail.com",
  "nicuchiciuc@gmail.com",
  "nicu@noter.md",
]);

export const userPermissionValidator = union(
  literal(dashboardMonitoringViewPermission),
  literal(fileViewAccessPermission),
  literal(developerToolsViewPermission),
  literal(machinesAccessPermission),
);

export const userPermissionListValidator = array(userPermissionValidator);

export const userAccessValidator = object({
  isAuthenticated: boolean(),
  isApproved: boolean(),
  isAdmin: boolean(),
  permissions: userPermissionListValidator,
});

export const userAccessByUserIdArgsValidator = object({
  userId: id("users"),
});

export type UserAccess = Infer<typeof userAccessValidator>;

export function isAdminUser(
  githubUsername: string | null | undefined,
  email?: string | null,
): boolean {
  if (githubUsername && ADMIN_USERNAMES.includes(githubUsername)) {
    return true;
  }
  if (!email) {
    return false;
  }
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/**
 * Keep invite approval in persisted user data so operators can flip one
 * `users.isApproved` field instead of editing a code-side email allowlist.
 */
export function hasAppAccess(args: {
  githubUsername: string | null | undefined;
  email?: string | null;
  isApproved?: boolean | null | undefined;
}): boolean {
  if (args.isApproved === true) {
    return true;
  }
  return isAdminUser(args.githubUsername, args.email);
}

export function resolveUserPermissions(args: {
  email?: string | null;
  githubUsername: string | null | undefined;
  isApproved?: boolean | null | undefined;
  permissionGrants?: UserPermission[] | null | undefined;
}): UserPermission[] {
  if (
    !hasAppAccess({
      githubUsername: args.githubUsername,
      email: args.email,
      isApproved: args.isApproved,
    })
  ) {
    return [];
  }

  if (isAdminUser(args.githubUsername, args.email)) {
    return [...USER_PERMISSION_ORDER];
  }

  const grants = new Set(args.permissionGrants ?? []);
  return USER_PERMISSION_ORDER.filter((permission) => grants.has(permission));
}

export function hasPermission(
  access: Pick<UserAccess, "permissions">,
  permission: UserPermission,
): boolean {
  return access.permissions.includes(permission);
}

export function emptyUserAccess(): UserAccess {
  return {
    isAuthenticated: false,
    isApproved: false,
    isAdmin: false,
    permissions: [],
  };
}
