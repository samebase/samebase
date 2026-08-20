import { createFileRoute } from "@tanstack/react-router";
import { RootIndexRoutePage } from "@/components/RootIndexRoutePage";
import { ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import {
  LANDING_PAGE_ROUTE_SEARCH_STATIC_DATA,
  validateLandingPageRouteSearch,
} from "@/routeSearch/landingPreview";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/";

export const Route = createFileRoute("/")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...LANDING_PAGE_ROUTE_SEARCH_STATIC_DATA,
    searchParamSuggestions: [
      ...ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS,
      ...LANDING_PAGE_ROUTE_SEARCH_STATIC_DATA.searchParamSuggestions,
    ],
  },
  component: RootIndexRoutePage,
  validateSearch: validateLandingPageRouteSearch,
});
