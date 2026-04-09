import { getRouteApi } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";
import { Layout } from "@/Layout";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/lib/codexAppServerResearch";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";

const PrivacyPolicyPage = lazy(async () => {
  const module = await import("@/components/PrivacyPolicyPage");
  return { default: module.PrivacyPolicyPage };
});

const TermsOfServicePage = lazy(async () => {
  const module = await import("@/components/TermsOfServicePage");
  return { default: module.TermsOfServicePage };
});

const LogoPreviewPage = lazy(async () => {
  const module = await import("@/components/LogoPreviewPage");
  return { default: module.LogoPreviewPage };
});

const LogoSingleCubeStudyPage = lazy(async () => {
  const module = await import("@/components/LogoSingleCubeStudyPage");
  return { default: module.LogoSingleCubeStudyPage };
});

const LogoStaticSvgPage = lazy(async () => {
  const module = await import("@/components/LogoStaticSvgPage");
  return { default: module.LogoStaticSvgPage };
});

const LogoTransitionLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionLabPage");
  return { default: module.LogoTransitionLabPage };
});

const LogoTransitionTransformsLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionTransformsLabPage");
  return { default: module.LogoTransitionTransformsLabPage };
});

const PitchDeckPage = lazy(async () => {
  const module = await import("@/components/PitchDeckPage");
  return { default: module.PitchDeckPage };
});

const CodexAppServerResearchPage = lazy(async () => {
  const module = await import("@/components/CodexAppServerResearchPage");
  return { default: module.CodexAppServerResearchPage };
});

const CodexAppServerThreadBrowserResearchPage = lazy(async () => {
  const module = await import(
    "@/components/CodexAppServerThreadBrowserResearchPage"
  );
  return { default: module.CodexAppServerThreadBrowserResearchPage };
});

const logoRouteApi = getRouteApi("/logo");
const logoIsoRouteApi = getRouteApi("/logo-iso");
const logoSvgRouteApi = getRouteApi("/logo-svg");
const logoIsoStudyRouteApi = getRouteApi("/logo-iso-study");

/**
 * Keep the current public-route metadata and layout behavior stable while the
 * route ownership moves from a handwritten table into route modules.
 */
function RoutedPage(props: {
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

export function PrivacyRoutePage() {
  return (
    <RoutedPage pathname="/privacy" withLayout>
      <PrivacyPolicyPage />
    </RoutedPage>
  );
}

export function TermsRoutePage() {
  return (
    <RoutedPage pathname="/terms" withLayout>
      <TermsOfServicePage />
    </RoutedPage>
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

export function LogoTransitionLabRoutePage() {
  return (
    <RoutedPage pathname="/logo-transition-lab">
      <LogoTransitionLabPage />
    </RoutedPage>
  );
}

export function LogoTransitionTransformsLabRoutePage() {
  return (
    <RoutedPage pathname="/logo-transition-lab-transforms">
      <LogoTransitionTransformsLabPage />
    </RoutedPage>
  );
}

export function PitchRoutePage() {
  return (
    <RoutedPage pathname="/pitch">
      <PitchDeckPage mode="interactive" />
    </RoutedPage>
  );
}

export function PitchPrintRoutePage() {
  return (
    <RoutedPage pathname="/pitch/print">
      <PitchDeckPage mode="print" />
    </RoutedPage>
  );
}

export function PitchPrintMobileRoutePage() {
  return (
    <RoutedPage pathname="/pitch/print/mobile">
      <PitchDeckPage mode="printMobile" />
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
