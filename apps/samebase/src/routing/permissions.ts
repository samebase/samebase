import {
  canAccessRouteAvailability,
  type RouteAvailability,
  type RouteEnvironment,
} from "@/routing/availability";
import type { AccessKey } from "../../shared/accessModel";

export type RouteAccess = AccessKey;

export type RouteSearchParamNumericRange =
  | {
      maxValue: number;
      minValue: number;
      rangeType: "closed" | "wrap";
    }
  | {
      minValue: number;
      rangeType: "min";
    };
export type RouteSearchParamValueSuggestions = readonly [string, ...string[]];

/**
 * Each value type carries only the metadata the editor can safely use for that
 * type. Manual params such as auth still accept typed values, but must not
 * advertise a concrete value that could trigger runtime effects on preview.
 * Numeric `valueSuggestions` are curated dropdown rows, not the accepted route
 * range; keep them `null` when the value should use only `sampleValue`.
 */
export type RouteSearchParamValueSemantics =
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
      numericRange: RouteSearchParamNumericRange;
      numericStepValue: number;
      sampleValue: string;
      valueSuggestions: RouteSearchParamValueSuggestions | null;
    }
  | {
      valueType: "numeric-options";
      numericDefaultValue: number;
      sampleValue: string;
      valueSuggestions: RouteSearchParamValueSuggestions;
    }
  | {
      valueType: "options";
      sampleValue: string;
      valueSuggestions: RouteSearchParamValueSuggestions;
    }
  | {
      valueType: "completion";
      sampleValue: string;
      valueCompletion: "tailwind-color-token";
      valueSuggestions: RouteSearchParamValueSuggestions;
    };

export type RouteSearchParamSemantics =
  | {
      searchParamKind: "presence";
    }
  | (RouteSearchParamValueSemantics & {
      searchParamKind: "value";
    });

export type RouteSearchParamAccess<Key extends string = string> = {
  key: Key;
  access: RouteAccess;
};

export type RouteSearchParamSuggestion<Key extends string = string> = RouteSearchParamAccess<Key> &
  RouteSearchParamSemantics;

export type RouteSearchParamValueSuggestion<Key extends string = string> = Extract<
  RouteSearchParamSuggestion<Key>,
  { searchParamKind: "value" }
>;

export type RouteStaticData = {
  availableEnvironments?: RouteAvailability;
  access: RouteAccess;
  /**
  "hidden" keeps the path out of the URL editor's suggestion dropdown while
  direct entry still commits it. "redirect" additionally blocks editor commits:
  the route only forwards elsewhere, so committing it mid-edit would tear the
  editor out from under the draft.
  */
  pathSuggestion?: "hidden" | "redirect";
  prerender?: false;

  /**
  Query keys this route's own search schema accepts, beyond the root-owned keys
  every path accepts. Absent means the route accepts only root-owned keys.

  Acceptance is structural (schema membership) and viewer-independent; the
  per-param `access` gates editor exposure and direct URL cleanup, never key
  acceptance.
  */
  acceptedSearchKeys?: readonly string[];
  searchParamAccess?: readonly RouteSearchParamAccess[];
  searchParamSuggestions?: readonly RouteSearchParamSuggestion[];
};

export type RouteAccessViewer = {
  accessKeys: readonly AccessKey[];
};

type RouteAccessMatch = {
  staticData: {
    access: RouteAccess;
  };
};

export function canAccessRouteAccess(access: RouteAccess, viewer: RouteAccessViewer): boolean {
  return viewer.accessKeys.includes(access);
}

export function canAccessRouteMatchesAccess(
  matches: readonly RouteAccessMatch[],
  viewer: RouteAccessViewer,
): boolean {
  return matches.every((match) => canAccessRouteAccess(match.staticData.access, viewer));
}

export function canAccessRouteStaticData(
  staticData: RouteStaticData,
  viewer: RouteAccessViewer,
  routeEnvironment: RouteEnvironment,
): boolean {
  return (
    canAccessRouteAccess(staticData.access, viewer) &&
    canAccessRouteAvailability(staticData.availableEnvironments, routeEnvironment)
  );
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends RouteStaticData {}
}
