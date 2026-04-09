import { getRouteApi } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";
import { CodexAppServerResearchPage } from "@/components/CodexAppServerResearchPage";
import { CodexAppServerThreadBrowserResearchPage } from "@/components/CodexAppServerThreadBrowserResearchPage";
import { Layout } from "@/Layout";
import { LogoPreviewPage } from "@/components/LogoPreviewPage";
import { LogoSingleCubeStudyPage } from "@/components/LogoSingleCubeStudyPage";
import { LogoStaticSvgPage } from "@/components/LogoStaticSvgPage";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/lib/codexAppServerResearch";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

const logoRouteApi = getRouteApi("/logo");
const logoIsoRouteApi = getRouteApi("/logo-iso");
const logoSvgRouteApi = getRouteApi("/logo-svg");
const logoIsoStudyRouteApi = getRouteApi("/logo-iso-study");

/**
 * Keep the current public-route metadata and layout behavior stable while the
 * route ownership moves from a handwritten table into route modules.
 */
export function RoutedPage(props: {
  children?: ReactNode;
  pathname: string;
  withLayout?: boolean;
}) {
  usePageMetadata(
    resolvePageMetadata({
      pathname: props.pathname,
      isAuthenticated: false,
    }),
  );

  const content = <Suspense fallback={null}>{props.children}</Suspense>;

  return props.withLayout ? <Layout>{content}</Layout> : content;
}

function ResearchRouteUnavailablePage(props: {
  pathname: string;
  title: string;
  description: string;
}) {
  usePageMetadata(
    resolvePageMetadata({
      pathname: props.pathname,
      isAuthenticated: false,
    }),
  );

  return (
    <Layout>
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            {props.title}
          </h2>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
      </div>
    </Layout>
  );
}

export function LogoThreeRoutePage() {
  const routeSearch = logoRouteApi.useSearch();
  const navigate = logoRouteApi.useNavigate();

  return (
    <RoutedPage pathname="/logo">
      <LogoPreviewPage
        renderMode="three"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </RoutedPage>
  );
}

export function LogoIsoRoutePage() {
  const routeSearch = logoIsoRouteApi.useSearch();
  const navigate = logoIsoRouteApi.useNavigate();

  return (
    <RoutedPage pathname="/logo-iso">
      <LogoPreviewPage
        renderMode="iso"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </RoutedPage>
  );
}

export function LogoSvgRoutePage() {
  const routeSearch = logoSvgRouteApi.useSearch();

  return (
    <RoutedPage pathname="/logo-svg">
      <LogoStaticSvgPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export function LogoIsoStudyRoutePage() {
  const routeSearch = logoIsoStudyRouteApi.useSearch();

  return (
    <RoutedPage pathname="/logo-iso-study">
      <LogoSingleCubeStudyPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export function CodexResearchRoutePage() {
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

export function CodexThreadBrowserRoutePage() {
  if (!import.meta.env.DEV) {
    return (
      <ResearchRouteUnavailablePage
        pathname={CODEX_APP_SERVER_THREAD_BROWSER_ROUTE}
        title="Codex thread browser unavailable"
        description="This research surface only runs in the local development server."
      />
    );
  }

  return (
    <RoutedPage pathname={CODEX_APP_SERVER_THREAD_BROWSER_ROUTE}>
      <CodexAppServerThreadBrowserResearchPage />
    </RoutedPage>
  );
}
