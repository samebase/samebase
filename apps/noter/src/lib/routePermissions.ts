import {
  canAccessNoterRouteAvailability,
  type NoterRouteAvailability,
  type NoterRouteSurface,
} from "@/lib/routeAvailability";

export type NoterRoutePermission = "public" | "admin";

export type NoterRouteSearchParamValueKind = "presence" | "value";
export type NoterRouteSearchParamValueCompletion = "tailwind-color-token";
export type NoterRouteSearchParamNumericRange =
  | {
      maxValue: number;
      minValue: number;
      rangeType: "closed";
    }
  | {
      minValue: number;
      rangeType: "min";
    }
  | {
      maxValue: number;
      minValue: number;
      rangeType: "wrap";
    };
export type NoterRouteSearchParamValueSuggestions = readonly [string, ...string[]];

/**
 * Each value type carries only the metadata the editor can safely use for that
 * type. Manual params such as auth still accept typed values, but must not
 * advertise a concrete value that could trigger runtime effects on preview.
 */
export type NoterRouteSearchParamValueSemantics =
  | {
      valueType: "manual";
    }
  | {
      sampleValue: string;
      valueType: "freeform";
    }
  | {
      numericDefaultValue: number;
      numericRange: NoterRouteSearchParamNumericRange;
      numericStepValue: number;
      sampleValue: string;
      valueType: "numeric";
    }
  | {
      numericDefaultValue: number;
      sampleValue: string;
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
      valueType: "numeric-options";
    }
  | {
      sampleValue: string;
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
      valueType: "options";
    }
  | {
      sampleValue: string;
      valueCompletion: NoterRouteSearchParamValueCompletion;
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
      valueType: "completion";
    };

type NoterRouteSearchParamSuggestionBase<Key extends string> = {
  key: Key;
  permission: NoterRoutePermission;
};

export type NoterRouteSearchParamSuggestion<Key extends string = string> =
  | (NoterRouteSearchParamSuggestionBase<Key> & {
      valueKind: "presence";
    })
  | (NoterRouteSearchParamSuggestionBase<Key> &
      NoterRouteSearchParamValueSemantics & {
        valueKind: "value";
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
