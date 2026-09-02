import { LogoMengerWebGpuLabPage } from "@/components/logo/LogoMengerWebGpuLabPage";
import {
  MENGER_TYPE_GPU_DEFAULT_DEPTH,
  MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_MAXIMUM_DEPTH,
  MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_MINIMUM_DEPTH,
  MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP,
  normalizeMengerTypeGpuDepth,
  normalizeMengerTypeGpuResolutionScale,
} from "@/components/logo/mengerTypeGpuSettings";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamMetadata,
  readRouteSearchStaticData,
  routeSearchNormalizedFiniteNumber,
  routeSearchValueParam,
} from "@/routing/searchParamMetadata";
import { applySearchPatch } from "@/routing/searchFlags";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/webgpu/menger";
const RouteSearchSchema_logoMengerWebGpu = defineRouteSearchParams({
  depth: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeMengerTypeGpuDepth), {
    access: "access_public",
    numericDefaultValue: MENGER_TYPE_GPU_DEFAULT_DEPTH,
    numericRange: {
      maxValue: MENGER_TYPE_GPU_MAXIMUM_DEPTH,
      minValue: MENGER_TYPE_GPU_MINIMUM_DEPTH,
      rangeType: "closed",
    },
    numericStepValue: 1,
    sampleValue: `${MENGER_TYPE_GPU_MAXIMUM_DEPTH}`,
    suggestion: "route",
    valueSuggestions: null,
    valueType: "numeric",
  }),
  resolution: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerTypeGpuResolutionScale),
    {
      access: "access_public",
      numericDefaultValue: MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE,
      numericRange: {
        maxValue: MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
        minValue: MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE,
        rangeType: "closed",
      },
      numericStepValue: MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP,
      sampleValue: `${MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE}`,
      suggestion: "route",
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
});
type LogoMengerWebGpuRouteSearch = InferRouteSearch<typeof RouteSearchSchema_logoMengerWebGpu>;
const logoMengerWebGpuRouteSearchStaticData = readRouteSearchStaticData(
  readRouteSearchParamMetadata(RouteSearchSchema_logoMengerWebGpu),
);

function validateLogoMengerWebGpuRouteSearch(
  search: Record<string, unknown>,
): LogoMengerWebGpuRouteSearch {
  return RouteSearchSchema_logoMengerWebGpu.parse(search);
}

function LogoMengerWebGpuRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const depth = routeSearch.depth ?? MENGER_TYPE_GPU_DEFAULT_DEPTH;
  const resolutionScale = routeSearch.resolution ?? MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE;

  return (
    <LogoMengerWebGpuLabPage
      depth={depth}
      onSettingsChange={(nextSettings) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: (currentSearch) =>
            applySearchPatch(currentSearch, {
              depth: nextSettings.depth,
              resolution: nextSettings.resolutionScale,
            }),
          to: ".",
        });
      }}
      resolutionScale={resolutionScale}
    />
  );
}

export const Route = createFileRoute("/logo/webgpu/menger")({
  head: () => buildLogoLabPageHead(pathname, "TypeGPU Menger Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...logoMengerWebGpuRouteSearchStaticData,
  },
  component: LogoMengerWebGpuRouteComponent,
  validateSearch: validateLogoMengerWebGpuRouteSearch,
});
