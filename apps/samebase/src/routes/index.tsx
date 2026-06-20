import { createFileRoute } from "@tanstack/react-router";
import { RootIndexRoutePage } from "@/components/RootIndexRoutePage";
import { ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/routeSearch/root";
import { SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/";

export const Route = createFileRoute("/")({
  staticData: {
    ...SAMEBASE_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: RootIndexRoutePage,
});
