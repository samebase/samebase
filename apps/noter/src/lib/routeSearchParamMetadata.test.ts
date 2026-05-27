import { describe, expect, it } from "vite-plus/test";
import { expectType } from "@noter-md/dependent";
import { literal } from "@samebase/sure";
import {
  defineRouteSearchParams,
  readRouteSearchParamMetadata,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  routeSearchFiniteNumber,
  routeSearchPresenceParam,
  routeSearchValueParam,
  type InferRouteSearch,
} from "@/lib/routeSearchParamMetadata";

describe("routeSearchParamMetadata", () => {
  it("parses route search fields directly from param specs", () => {
    routeSearchValueParam(literal("google"), {
      permission: "public",
      sampleValue: "google",
      suggestion: "route",
      // @ts-expect-error Value suggestions must keep at least one option.
      valueSuggestions: [],
      valueType: "options",
    });
    routeSearchValueParam(literal("google"), {
      permission: "public",
      suggestion: "route",
      valueType: "manual",
      // @ts-expect-error Manual value params cannot define numeric defaults.
      numericDefaultValue: 1,
    });
    routeSearchValueParam(literal("google"), {
      permission: "public",
      // @ts-expect-error Manual value params cannot define sample values.
      sampleValue: "google",
      suggestion: "route",
      valueType: "manual",
    });
    routeSearchValueParam(literal("google"), {
      permission: "public",
      suggestion: "route",
      valueType: "manual",
      // @ts-expect-error Manual value params cannot define suggestions.
      valueSuggestions: ["google"],
    });
    // @ts-expect-error Numeric value params must define the suggestion step.
    routeSearchValueParam(routeSearchFiniteNumber, {
      numericDefaultValue: 1,
      numericRange: {
        minValue: 1,
        rangeType: "min",
      },
      permission: "public",
      sampleValue: "2",
      suggestion: "route",
      valueType: "numeric",
    });

    const searchParams = defineRouteSearchParams({
      auth: routeSearchValueParam(literal("google"), {
        permission: "public",
        sampleValue: "google",
        suggestion: "route",
        valueSuggestions: ["google"],
        valueType: "options",
      }),
      depth: routeSearchValueParam(routeSearchFiniteNumber, {
        numericDefaultValue: 1,
        numericRange: {
          minValue: 1,
          rangeType: "min",
        },
        numericStepValue: 1,
        permission: "public",
        sampleValue: "2",
        suggestion: "route",
        valueType: "numeric",
      }),
      dev: routeSearchPresenceParam({
        permission: "public",
        suggestion: "global",
      }),
    });

    type Search = InferRouteSearch<typeof searchParams>;
    const typedSearch: Search = {};

    expectType<{
      auth?: "google";
      depth?: number;
      dev?: true;
    }>()(typedSearch, true);

    expect(searchParams.parse({ auth: "google", depth: "2.5", dev: "false" })).toEqual({
      auth: "google",
      depth: 2.5,
      dev: true,
    });
    expect(searchParams.parse({ auth: "github", depth: "nope", dev: undefined })).toEqual({});
  });

  it("derives metadata, suggestions, and presence keys from the same specs", () => {
    const searchParams = defineRouteSearchParams({
      auth: routeSearchValueParam(literal("google"), {
        permission: "public",
        sampleValue: "google",
        suggestion: "route",
        valueSuggestions: ["google"],
        valueType: "options",
      }),
      depth: routeSearchValueParam(routeSearchFiniteNumber, {
        numericDefaultValue: 1,
        numericRange: {
          minValue: 1,
          rangeType: "min",
        },
        numericStepValue: 1,
        permission: "public",
        sampleValue: "2",
        suggestion: "route",
        valueType: "numeric",
      }),
      dev: routeSearchPresenceParam({
        permission: "public",
        suggestion: "global",
      }),
    });

    const metadata = readRouteSearchParamMetadata(searchParams);

    expect(readRouteSearchPresenceKeys(metadata)).toEqual(["dev"]);
    expect(readRouteSearchParamSuggestions(metadata, "route")).toEqual([
      {
        key: "auth",
        permission: "public",
        sampleValue: "google",
        valueKind: "value",
        valueSuggestions: ["google"],
        valueType: "options",
      },
      {
        key: "depth",
        numericDefaultValue: 1,
        numericRange: {
          minValue: 1,
          rangeType: "min",
        },
        numericStepValue: 1,
        permission: "public",
        sampleValue: "2",
        valueKind: "value",
        valueType: "numeric",
      },
    ]);
    expect(readRouteSearchParamSuggestions(metadata, "global")).toEqual([
      {
        key: "dev",
        permission: "public",
        valueKind: "presence",
      },
    ]);
  });

  it("keeps manual value params out of route URL suggestions", () => {
    const searchParams = defineRouteSearchParams({
      auth: routeSearchValueParam(literal("google"), {
        permission: "public",
        suggestion: "route",
        valueType: "manual",
      }),
    });

    const metadata = readRouteSearchParamMetadata(searchParams);

    expect(metadata.auth).toEqual({
      permission: "public",
      suggestion: "route",
      valueKind: "value",
      valueType: "manual",
    });
    expect(readRouteSearchParamSuggestions(metadata, "route")).toEqual([
      {
        key: "auth",
        permission: "public",
        valueKind: "value",
        valueType: "manual",
      },
    ]);
  });
});
