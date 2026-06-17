import {
  canAccessNoterRouteAvailability,
  type NoterRouteAvailability,
  type NoterRouteEnvironment,
} from "@/lib/routeAvailability";
import { canAccess, type AccessKey, type ViewerRole } from "../../shared/accessModel";

export type NoterRouteAccess = AccessKey;

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
  access: NoterRouteAccess;
} & NoterRouteSearchParamSemantics;

export type NoterRouteSearchParamValueSuggestion<Key extends string = string> = Extract<
  NoterRouteSearchParamSuggestion<Key>,
  { searchParamKind: "value" }
>;

export type NoterRouteStaticData = {
  availableEnvironments?: NoterRouteAvailability;
  access: NoterRouteAccess;

  /**
  Query keys this route's own search schema accepts, beyond the root-owned keys
  every path accepts. Absent means the route accepts only root-owned keys.

  Acceptance is structural (schema membership) and viewer-independent; the
  per-param `access` gates editor exposure, never key acceptance.
  */
  acceptedSearchKeys?: readonly string[];
  searchParamSuggestions?: readonly NoterRouteSearchParamSuggestion[];
};

export type NoterRouteAccessViewer = {
  role: ViewerRole;
};

export function canAccessNoterRouteAccess(
  access: NoterRouteAccess,
  viewer: NoterRouteAccessViewer,
): boolean {
  return canAccess(access, viewer.role);
}

export function readNoterRouteAccessViewerFromAdminStatus(
  isAdmin: boolean,
): NoterRouteAccessViewer {
  return { role: isAdmin ? "role_staff" : "role_anonymous" };
}

export function canAccessNoterRouteStaticData(
  staticData: NoterRouteStaticData,
  viewer: NoterRouteAccessViewer,
  routeEnvironment: NoterRouteEnvironment,
): boolean {
  return (
    canAccessNoterRouteAccess(staticData.access, viewer) &&
    canAccessNoterRouteAvailability(staticData.availableEnvironments, routeEnvironment)
  );
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends NoterRouteStaticData {}
}
