import { createFileRoute } from "@tanstack/react-router";
import { RootIndexRoutePage } from "@/components/RootIndexRoutePage";
import { selectLandingPageMarkdown } from "@/lib/landingCopy";
import { ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/rootRouteSearch";

function RootIndexRouteComponent() {
  const { landingPageMarkdown } = Route.useLoaderData();

  return <RootIndexRoutePage landingPageMarkdown={landingPageMarkdown} />;
}

export const Route = createFileRoute("/")({
  staticData: {
    permission: "public",
    searchParamSuggestions: ROOT_INDEX_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  loader: () => ({
    landingPageMarkdown: selectLandingPageMarkdown(),
  }),
  component: RootIndexRouteComponent,
});
