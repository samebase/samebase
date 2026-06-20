import {
  canAccessSamebaseRouteAvailability,
  type SamebaseRouteAvailability,
  type SamebaseRouteEnvironment,
} from "@/routing/availability";
import type { AccessKey } from "../../shared/accessModel";

export type SamebaseRouteAccess = AccessKey;

export type SamebaseRouteSearchParamNumericRange =
  | {
      maxValue: number;
      minValue: number;
      rangeType: "closed" | "wrap";
    }
  | {
      minValue: number;
      rangeType: "min";
    };
export type SamebaseRouteSearchParamValueSuggestions = readonly [string, ...string[]];

/**
 * Each value type carries only the metadata the editor can safely use for that
 * type. Manual params such as auth still accept typed values, but must not
 * advertise a concrete value that could trigger runtime effects on preview.
 * Numeric `valueSuggestions` are curated dropdown rows, not the accepted route
 * range; keep them `null` when the value should use only `sampleValue`.
 */
export type SamebaseRouteSearchParamValueSemantics =
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
      numericRange: SamebaseRouteSearchParamNumericRange;
      numericStepValue: number;
      sampleValue: string;
      valueSuggestions: SamebaseRouteSearchParamValueSuggestions | null;
    }
  | {
      valueType: "numeric-options";
      numericDefaultValue: number;
      sampleValue: string;
      valueSuggestions: SamebaseRouteSearchParamValueSuggestions;
    }
  | {
      valueType: "options";
      sampleValue: string;
      valueSuggestions: SamebaseRouteSearchParamValueSuggestions;
    }
  | {
      valueType: "completion";
      sampleValue: string;
      valueCompletion: "tailwind-color-token";
      valueSuggestions: SamebaseRouteSearchParamValueSuggestions;
    };

export type SamebaseRouteSearchParamSemantics =
  | {
      searchParamKind: "presence";
    }
  | (SamebaseRouteSearchParamValueSemantics & {
      searchParamKind: "value";
    });

export type SamebaseRouteSearchParamAccess<Key extends string = string> = {
  key: Key;
  access: SamebaseRouteAccess;
};

export type SamebaseRouteSearchParamSuggestion<Key extends string = string> =
  SamebaseRouteSearchParamAccess<Key> & SamebaseRouteSearchParamSemantics;

export type SamebaseRouteSearchParamValueSuggestion<Key extends string = string> = Extract<
  SamebaseRouteSearchParamSuggestion<Key>,
  { searchParamKind: "value" }
>;

export type SamebaseRouteStaticData = {
  availableEnvironments?: SamebaseRouteAvailability;
  access: SamebaseRouteAccess;
  pathSuggestion?: "hidden";

  /**
  Query keys this route's own search schema accepts, beyond the root-owned keys
  every path accepts. Absent means the route accepts only root-owned keys.

  Acceptance is structural (schema membership) and viewer-independent; the
  per-param `access` gates editor exposure and direct URL cleanup, never key
  acceptance.
  */
  acceptedSearchKeys?: readonly string[];
  searchParamAccess?: readonly SamebaseRouteSearchParamAccess[];
  searchParamSuggestions?: readonly SamebaseRouteSearchParamSuggestion[];
};

export type SamebaseRouteAccessViewer = {
  accessKeys: readonly AccessKey[];
};

type SamebaseRouteAccessMatch = {
  staticData: {
    access: SamebaseRouteAccess;
  };
};

export function canAccessSamebaseRouteAccess(
  access: SamebaseRouteAccess,
  viewer: SamebaseRouteAccessViewer,
): boolean {
  return viewer.accessKeys.includes(access);
}

export function canAccessSamebaseRouteMatchesAccess(
  matches: readonly SamebaseRouteAccessMatch[],
  viewer: SamebaseRouteAccessViewer,
): boolean {
  return matches.every((match) => canAccessSamebaseRouteAccess(match.staticData.access, viewer));
}

export function canAccessSamebaseRouteStaticData(
  staticData: SamebaseRouteStaticData,
  viewer: SamebaseRouteAccessViewer,
  routeEnvironment: SamebaseRouteEnvironment,
): boolean {
  return (
    canAccessSamebaseRouteAccess(staticData.access, viewer) &&
    canAccessSamebaseRouteAvailability(staticData.availableEnvironments, routeEnvironment)
  );
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends SamebaseRouteStaticData {}
}
