import {
  canAccessNoterRouteAvailability,
  type NoterRouteAvailability,
  type NoterRouteSurface,
} from "@/lib/routeAvailability";

export type NoterRoutePermission = "public" | "admin";

export type NoterRouteSearchParamNumericRange =
  | {
      maxValue: number;
      minValue: number;
      rangeType: "closed" | "wrap";
    }
  | {
      minValue: number;
      rangeType: "min";
    };
export type NoterRouteSearchParamValueSuggestions = readonly [string, ...string[]];

/**
 * Each value type carries only the metadata the editor can safely use for that
 * type. Manual params such as auth still accept typed values, but must not
 * advertise a concrete value that could trigger runtime effects on preview.
 * Numeric `valueSuggestions` are curated dropdown rows, not the accepted route
 * range; keep them `null` when the value should use only `sampleValue`.
 */
export type NoterRouteSearchParamValueSemantics =
  | {
      valueType: "manual";
    }
  | {
      valueType: "freeform";
      sampleValue: string;
    }
  | {
      valueType: "numeric";
      numericDefaultValue: number;
      numericRange: NoterRouteSearchParamNumericRange;
      numericStepValue: number;
      sampleValue: string;
      valueSuggestions: NoterRouteSearchParamValueSuggestions | null;
    }
  | {
      valueType: "numeric-options";
      numericDefaultValue: number;
      sampleValue: string;
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
    }
  | {
      valueType: "options";
      sampleValue: string;
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
    }
  | {
      valueType: "completion";
      sampleValue: string;
      valueCompletion: "tailwind-color-token";
      valueSuggestions: NoterRouteSearchParamValueSuggestions;
    };

export type NoterRouteSearchParamSemantics =
  | {
      searchParamKind: "presence";
    }
  | (NoterRouteSearchParamValueSemantics & {
      searchParamKind: "value";
    });

export type NoterRouteSearchParamSuggestion<Key extends string = string> = {
  key: Key;
  permission: NoterRoutePermission;
} & NoterRouteSearchParamSemantics;

export type NoterRouteSearchParamValueSuggestion<Key extends string = string> = Extract<
  NoterRouteSearchParamSuggestion<Key>,
  { searchParamKind: "value" }
>;

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
