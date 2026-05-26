import {
  canAccessNoterRouteAvailability,
  type NoterRouteAvailability,
  type NoterRouteSurface,
} from "@/lib/routeAvailability";

export type NoterRoutePermission = "public" | "admin";

export type NoterRouteSearchParamValueKind = "presence" | "value";
export type NoterRouteSearchParamValueCompletion = "tailwind-color-token";

type NoterRouteSearchParamSuggestionBase<Key extends string> = {
  key: Key;
  permission: NoterRoutePermission;
};

export type NoterRouteSearchParamSuggestion<Key extends string = string> =
  | (NoterRouteSearchParamSuggestionBase<Key> & {
      valueKind: "presence";
    })
  | (NoterRouteSearchParamSuggestionBase<Key> & {
      valueKind: "value";
      numericDefaultValue?: number;
      valueCompletion?: NoterRouteSearchParamValueCompletion;
      valueSuggestions: readonly string[];
    });

export type NoterRouteStaticData = {
  availableOn?: NoterRouteAvailability;
  permission: NoterRoutePermission;
  searchParamSuggestions?: readonly NoterRouteSearchParamSuggestion[];
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

export function canAccessNoterRouteStaticData(
  staticData: NoterRouteStaticData,
  viewer: NoterRoutePermissionViewer,
  surface: NoterRouteSurface,
): boolean {
  return (
    canAccessNoterRoutePermission(staticData.permission, viewer) &&
    canAccessNoterRouteAvailability(staticData.availableOn, surface)
  );
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends NoterRouteStaticData {}
}
