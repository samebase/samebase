import { createFileRoute } from "@tanstack/react-router";
import { CodexAppServerResearchPage } from "@/components/CodexAppServerResearchPage";
import { CODEX_APP_SERVER_RESEARCH_ROUTE } from "@/lib/codexAppServerResearch";
import { validateCodexResearchRouteSearch } from "@/lib/codexResearchRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

function ResearchRouteUnavailablePage(props: {
  pathname: string;
  title: string;
  description: string;
}) {
  return (
    <RoutedPage pathname={props.pathname}>
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            {props.title}
          </h2>
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
        pathname={CODEX_APP_SERVER_RESEARCH_ROUTE}
        title="Codex research unavailable"
        description="This research surface only runs in the local development server."
      />
    );
  }

  return (
    <RoutedPage pathname={CODEX_APP_SERVER_RESEARCH_ROUTE}>
      <CodexAppServerResearchPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute(CODEX_APP_SERVER_RESEARCH_ROUTE)({
  component: CodexResearchRouteComponent,
  validateSearch: validateCodexResearchRouteSearch,
});
