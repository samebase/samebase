import { createFileRoute } from "@tanstack/react-router";
import { CodexAppServerResearchPage } from "@/components/CodexAppServerResearchPage";
import { CODEX_APP_SERVER_RESEARCH_ROUTE } from "@/lib/codexAppServerResearch";
import {
  CODEX_RESEARCH_ROUTE_SEARCH_STATIC_DATA,
  validateCodexResearchRouteSearch,
} from "@/routeSearch/codexResearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = CODEX_APP_SERVER_RESEARCH_ROUTE;

function ResearchRouteUnavailablePage(props: {
  pathname: string;
  title: string;
  description: string;
}) {
  return (
    <RoutedPage pathname={props.pathname}>
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
      </div>
    </RoutedPage>
  );
}

function CodexResearchRouteComponent() {
  if (!import.meta.env.DEV) {
    return (
      <ResearchRouteUnavailablePage
        pathname={pathname}
        title="Codex research unavailable"
        description="This research surface only runs in the local development server."
      />
    );
  }

  return (
    <RoutedPage pathname={pathname}>
      <CodexAppServerResearchPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/research/codex-app-server")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    ...CODEX_RESEARCH_ROUTE_SEARCH_STATIC_DATA,
  },
  component: CodexResearchRouteComponent,
  validateSearch: validateCodexResearchRouteSearch,
});
