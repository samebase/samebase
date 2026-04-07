import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@xyflow/react/dist/style.css";
import { client } from "./lib/convexClient";
import { QueryProvider } from "./lib/providers/query-provider";
import "./index.css";

const ROOT_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "noter",
      alternateName: "noter.md",
      legalName: "Flux Byte SRL",
      url: "https://noter.md/",
      logo: "https://noter.md/logo-static.svg",
      sameAs: ["https://github.com/noter-md/noter"],
    },
    {
      "@type": "WebSite",
      name: "noter",
      alternateName: "noter.md",
      url: "https://noter.md/",
    },
  ],
} as const;

export function Layout(props: { children: ReactNode }) {
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(ROOT_STRUCTURED_DATA),
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {props.children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return (
    <ThemeProvider attribute="class">
      <ConvexAuthProvider client={client}>
        <QueryProvider>
          <Outlet />
        </QueryProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  );
}
