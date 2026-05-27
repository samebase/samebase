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
    });

    const searchParams = defineRouteSearchParams({
      auth: routeSearchValueParam(literal("google"), {
        permission: "public",
        sampleValue: "google",
        suggestion: "route",
        valueSuggestions: ["google"],
      }),
      depth: routeSearchValueParam(routeSearchFiniteNumber, {
        permission: "public",
        sampleValue: "2",
        suggestion: "route",
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
      }),
      depth: routeSearchValueParam(routeSearchFiniteNumber, {
        numericDefaultValue: 1,
        permission: "public",
        sampleValue: "2",
        suggestion: "route",
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
      },
      {
        key: "depth",
        numericDefaultValue: 1,
        permission: "public",
        sampleValue: "2",
        valueKind: "value",
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
});
