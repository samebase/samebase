import {
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { Layout } from "@/Layout";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/lib/codexAppServerResearch";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import {
  createElement,
  lazy,
  Suspense,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import App from "@/App";

function AppRouterRoot() {
  return createElement(Outlet);
}

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

function RoutedPage(props: {
  children?: ReactNode;
  pathname: string;
  withLayout?: boolean;
}) {
  // TODO(tanstack-router-migration): this wrapper is still an App-era bridge.
  // Replace it with route-owned metadata/search handling once these public
  // routes stop borrowing shared helpers from the old switchboard.
  usePageMetadata(
    resolvePageMetadata({
      pathname: props.pathname,
      isAuthenticated: false,
    }),
  );

  const content = createElement(Suspense, { fallback: null }, props.children);

  return props.withLayout ? createElement(Layout, null, content) : content;
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

  return createElement(
    Layout,
    null,
    createElement(
      "div",
      { className: "container my-auto" },
      createElement(
        "div",
        {
          className:
            "mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center",
        },
        createElement(
          "h2",
          { className: "text-xl font-semibold tracking-tight" },
          props.title,
        ),
        createElement(
          "p",
          { className: "text-sm text-muted-foreground" },
          props.description,
        ),
      ),
    ),
  );
}

function PrivacyRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/privacy", withLayout: true },
    createElement(PrivacyPolicyPage),
  );
}

function TermsRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/terms", withLayout: true },
    createElement(TermsOfServicePage),
  );
}

function LogoThreeRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo" },
    createElement(LogoPreviewPage, { renderMode: "three" }),
  );
}

function LogoIsoRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo-iso" },
    createElement(LogoPreviewPage, { renderMode: "iso" }),
  );
}

function LogoSvgRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo-svg" },
    createElement(LogoStaticSvgPage),
  );
}

function LogoIsoStudyRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo-iso-study" },
    createElement(LogoSingleCubeStudyPage),
  );
}

function LogoTransitionLabRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo-transition-lab" },
    createElement(LogoTransitionLabPage),
  );
}

function LogoTransitionTransformsLabRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/logo-transition-lab-transforms" },
    createElement(LogoTransitionTransformsLabPage),
  );
}

function PitchRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/pitch" },
    createElement(PitchDeckPage, { mode: "interactive" }),
  );
}

function PitchPrintRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/pitch/print" },
    createElement(PitchDeckPage, { mode: "print" }),
  );
}

function PitchPrintMobileRoutePage() {
  return createElement(
    RoutedPage,
    { pathname: "/pitch/print/mobile" },
    createElement(PitchDeckPage, { mode: "printMobile" }),
  );
}

function CodexResearchRoutePage() {
  if (!import.meta.env.DEV) {
    return createElement(ResearchRouteUnavailablePage, {
      pathname: CODEX_APP_SERVER_RESEARCH_ROUTE,
      title: "Codex research unavailable",
      description:
        "This research surface only runs in the local development server.",
    });
  }

  return createElement(
    RoutedPage,
    { pathname: CODEX_APP_SERVER_RESEARCH_ROUTE },
    createElement(CodexAppServerResearchPage),
  );
}

function CodexThreadBrowserRoutePage() {
  if (!import.meta.env.DEV) {
    return createElement(ResearchRouteUnavailablePage, {
      pathname: CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
      title: "Codex thread browser unavailable",
      description:
        "This research surface only runs in the local development server.",
    });
  }

  return createElement(
    RoutedPage,
    { pathname: CODEX_APP_SERVER_THREAD_BROWSER_ROUTE },
    createElement(CodexAppServerThreadBrowserResearchPage),
  );
}

const appRouterRootRoute = createRootRoute({
  component: AppRouterRoot,
});

// TODO(tanstack-router-migration): this root-plus-catch-all tree is only a
// bootstrap step so the app can run on TanStack Router before every pathname
// branch has been promoted into an explicit route.
//
// The real target shape is:
// - model the current `App.tsx` pathname branches as concrete TanStack routes
// - move search-param-heavy pages onto route-level `validateSearch`
// - stop rendering `App` for every path and let route ownership live here
// - delete the catch-all bridge once `App.tsx` is no longer a switchboard
const appIndexRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/",
  component: App,
});

const privacyRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/privacy",
  component: PrivacyRoutePage,
});

const termsRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/terms",
  component: TermsRoutePage,
});

const logoThreeRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo",
  component: LogoThreeRoutePage,
});

const logoIsoRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo-iso",
  component: LogoIsoRoutePage,
});

const logoSvgRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo-svg",
  component: LogoSvgRoutePage,
});

const logoIsoStudyRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo-iso-study",
  component: LogoIsoStudyRoutePage,
});

const logoTransitionLabRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo-transition-lab",
  component: LogoTransitionLabRoutePage,
});

const logoTransitionTransformsLabRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/logo-transition-lab-transforms",
  component: LogoTransitionTransformsLabRoutePage,
});

const pitchRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/pitch",
  component: PitchRoutePage,
});

const pitchPrintRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/pitch/print",
  component: PitchPrintRoutePage,
});

const pitchPrintMobileRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "/pitch/print/mobile",
  component: PitchPrintMobileRoutePage,
});

const codexResearchRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: CODEX_APP_SERVER_RESEARCH_ROUTE,
  component: CodexResearchRoutePage,
});

const codexThreadBrowserRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
  component: CodexThreadBrowserRoutePage,
});

const appSplatRoute = createRoute({
  getParentRoute: () => appRouterRootRoute,
  path: "$",
  component: App,
});

const appRouteTree = appRouterRootRoute.addChildren([
  appIndexRoute,
  privacyRoute,
  termsRoute,
  logoThreeRoute,
  logoIsoRoute,
  logoSvgRoute,
  logoIsoStudyRoute,
  logoTransitionLabRoute,
  logoTransitionTransformsLabRoute,
  pitchRoute,
  pitchPrintRoute,
  pitchPrintMobileRoute,
  codexResearchRoute,
  codexThreadBrowserRoute,
  appSplatRoute,
]);

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
    defaultPreload: false,
    history,
    routeTree: appRouteTree,
  });

  void router.load({ sync: true });

  return router;
}

export type AppRouter = ReturnType<typeof createAppRouter>;

export function AppRouterProvider(): ReactElement {
  const [router] = useState(() => createAppRouter(createBrowserHistory()));

  return createElement(RouterProvider, { router });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
