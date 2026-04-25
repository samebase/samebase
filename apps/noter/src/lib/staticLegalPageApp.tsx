import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Layout, PublicLayoutShell } from "../Layout";
import { LegalMarkdownPage } from "../components/LegalMarkdownPage";

type StaticLegalPagePath = "/privacy" | "/terms";

const staticRootRoute = createRootRoute();
const staticIndexRoute = createRoute({
  getParentRoute: () => staticRootRoute,
  path: "/",
});
const staticHomeRoute = createRoute({
  getParentRoute: () => staticRootRoute,
  path: "/home",
});
const staticLogoRoute = createRoute({
  getParentRoute: () => staticRootRoute,
  path: "/logo",
});
const staticPrivacyRoute = createRoute({
  getParentRoute: () => staticRootRoute,
  path: "/privacy",
});
const staticTermsRoute = createRoute({
  getParentRoute: () => staticRootRoute,
  path: "/terms",
});
const staticLegalRouteTree = staticRootRoute.addChildren([
  staticIndexRoute,
  staticHomeRoute,
  staticLogoRoute,
  staticPrivacyRoute,
  staticTermsRoute,
]);

function normalizeStaticLegalPagePath(pathname: string): StaticLegalPagePath {
  if (pathname === "/privacy" || pathname === "/privacy/") {
    return "/privacy";
  }
  if (pathname === "/terms" || pathname === "/terms/") {
    return "/terms";
  }

  throw new Error(`Unsupported static legal page path: ${pathname}`);
}

function renderStaticLegalPageContent(markdown: string): ReactNode {
  return createElement(LegalMarkdownPage, { value: markdown });
}

function createStaticLegalPageRouter(pathname: StaticLegalPagePath) {
  const router = createRouter({
    defaultPreload: false,
    history: createMemoryHistory({
      initialEntries: [pathname],
    }),
    routeTree: staticLegalRouteTree,
  });

  void router.load({ sync: true });

  return router;
}

function withStaticAppBuildGlobals<T>(
  args: {
    appCommit: string;
    appCommitNumber: number | null;
    appRepoUrl: string;
  },
  render: () => T,
): T {
  const globalNames = [
    "__APP_COMMIT__",
    "__APP_COMMIT_NUMBER__",
    "__APP_REPO_URL__",
  ] as const;
  const previousGlobals = globalNames.map((name) => ({
    hadValue: Object.prototype.hasOwnProperty.call(globalThis, name),
    name,
    value: Reflect.get(globalThis, name),
  }));

  Reflect.set(globalThis, "__APP_COMMIT__", args.appCommit);
  Reflect.set(globalThis, "__APP_COMMIT_NUMBER__", args.appCommitNumber);
  Reflect.set(globalThis, "__APP_REPO_URL__", args.appRepoUrl);

  try {
    return render();
  } finally {
    previousGlobals.forEach((previousGlobal) => {
      if (previousGlobal.hadValue) {
        Reflect.set(globalThis, previousGlobal.name, previousGlobal.value);
        return;
      }

      Reflect.deleteProperty(globalThis, previousGlobal.name);
    });
  }
}

/**
 * Server-render the same public layout and legal route content that the SPA
 * renders after boot, then let `createRoot` replace it when the app starts.
 */
export function renderStaticLegalPageAppHtml(args: {
  appCommit: string;
  appCommitNumber: number | null;
  appRepoUrl: string;
  markdown: string;
  pathname: string;
}): string {
  const pathname = normalizeStaticLegalPagePath(args.pathname);
  const router = createStaticLegalPageRouter(pathname);

  return withStaticAppBuildGlobals(args, () =>
    renderToStaticMarkup(
      createElement(RouterContextProvider, {
        children: createElement(
          Layout,
          null,
          createElement(
            PublicLayoutShell,
            null,
            renderStaticLegalPageContent(args.markdown),
          ),
        ),
        router,
      }),
    ),
  );
}
