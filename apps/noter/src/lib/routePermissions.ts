export type NoterRoutePermission = "public" | "admin";

export type NoterRouteStaticData = {
  permission: NoterRoutePermission;
};

export type NoterRoutePermissionViewer = {
  isAdmin: boolean;
};

export function canAccessNoterRoutePermission(
  permission: NoterRoutePermission,
  viewer: NoterRoutePermissionViewer,
): boolean {
  switch (permission) {
    case "public":
      return true;
    case "admin":
      return viewer.isAdmin;
  }

  return permission satisfies never;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends NoterRouteStaticData {}
}
