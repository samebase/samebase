import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  retainSearchParams,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NotFoundRoutePage } from "@/components/NotFoundRoutePage";
import { RouterGestureDebugOverlay } from "@/components/RouterGestureDebugOverlay";
import { AppProviders } from "@/lib/providers/app-providers";
import { validateRootRouteSearch } from "@/lib/rootRouteSearch";

const themeBootstrapScript = `(() => {
  const prefersDarkTheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem("theme");
  } catch {}

  const useDarkTheme =
    storedTheme === "dark" ||
    (storedTheme !== "light" && prefersDarkTheme);
  document.documentElement.classList.toggle("dark", useDarkTheme);
})();`;

const structuredDataScript = `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "noter",
      "alternateName": "noter.md",
      "legalName": "Flux Byte SRL",
      "url": "https://noter.md/",
      "logo": "https://noter.md/logo-static.svg",
      "sameAs": ["https://github.com/noter-md/noter"]
    },
    {
      "@type": "WebSite",
      "name": "noter",
      "alternateName": "noter.md",
      "url": "https://noter.md/"
    }
  ]
}`;

function AppRouterRoot() {
  return (
    <RootDocument>
      <AppProviders>
        <Outlet />
        <RouterGestureDebugOverlay />
      </AppProviders>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  // Route tests still mount the router into a detached div instead of letting
  // TanStack Start hydrate the full document root, so skip the document shell
  // in that environment and keep the real shell for dev/build.
  if (import.meta.env.MODE === "test") {
    return <>{children}</>;
  }

  return (
    <html lang="en" translate="no">
      <head>
        <meta charSet="UTF-8" />
        <meta name="google" content="notranslate" />
        <link rel="icon" type="image/png" href="/favicon.png" sizes="16x16" />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-32.png"
          sizes="32x32"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png"
          sizes="180x180"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>noter | GitHub-backed markdown notes and AI workspace</title>
        <meta
          name="description"
          content="GitHub-backed markdown notes and AI workspace. Keep notes and code in a real repository, collaborate in real time, and ship small apps from the same workspace."
        />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href="https://noter.md/" />
        <meta property="og:site_name" content="noter" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="noter | GitHub-backed markdown notes and AI workspace"
        />
        <meta
          property="og:description"
          content="GitHub-backed markdown notes and AI workspace. Keep notes and code in a real repository, collaborate in real time, and ship small apps from the same workspace."
        />
        <meta property="og:url" content="https://noter.md/" />
        <meta
          property="og:image"
          content="https://noter.md/noter-social-card.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="noter | GitHub-backed markdown notes and AI workspace"
        />
        <meta
          name="twitter:description"
          content="GitHub-backed markdown notes and AI workspace. Keep notes and code in a real repository, collaborate in real time, and ship small apps from the same workspace."
        />
        <meta
          name="twitter:image"
          content="https://noter.md/noter-social-card.png"
        />
        <meta name="theme-color" content="#000000" />
        <script
          dangerouslySetInnerHTML={{
            __html: structuredDataScript,
          }}
          type="application/ld+json"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  component: AppRouterRoot,
  notFoundComponent: NotFoundRoutePage,
  search: {
    middlewares: [retainSearchParams(["devtools"])],
  },
  validateSearch: validateRootRouteSearch,
});
