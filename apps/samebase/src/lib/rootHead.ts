import { COMPACT_IDENTITY_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { appWorkspaceSidebarPrehydrationScript } from "@/lib/appWorkspaceSidebarPrehydration";
import { agentBrowserHandoffPrehydrationScript } from "@/lib/agentBrowserHandoffPrehydration";
import { appAuthPresentationPrehydrationScript } from "@/lib/appAuthPresentationPrehydration";
import { publicLandingLogoPrehydrationScript } from "@/lib/publicLandingLogoPrehydration";
import { SAMEBASE_BRAND_COPY } from "@/lib/samebaseBrandCopy";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: SAMEBASE_BRAND_COPY.productName,
      alternateName: SAMEBASE_BRAND_COPY.siteName,
      url: "https://samebase.com/",
      logo: `https://samebase.com${COMPACT_IDENTITY_SVG_URL}`,
      sameAs: ["https://github.com/samebase/samebase"],
    },
    {
      "@type": "WebSite",
      name: SAMEBASE_BRAND_COPY.productName,
      alternateName: SAMEBASE_BRAND_COPY.siteName,
      url: "https://samebase.com/",
    },
  ],
} as const;
const disableInstallPromptScript = `
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});
`;
const initialThemeScript = `
(() => {
  const url = new URL(window.location.href);
  const readThemeModeFlag = (value) => value === "" || value === "true";
  const hasLightTheme = readThemeModeFlag(url.searchParams.get("light"));
  const hasDarkTheme = readThemeModeFlag(url.searchParams.get("dark"));

  if (hasLightTheme && hasDarkTheme) {
    const serializeSearchParams = (searchParams) => {
      const parts = [];
      for (const [key, value] of searchParams.entries()) {
        const encodedKey = encodeURIComponent(key);
        parts.push(
          value.length === 0
            ? encodedKey
            : \`\${encodedKey}=\${encodeURIComponent(value)}\`,
        );
      }
      return parts.length > 0 ? \`?\${parts.join("&")}\` : "";
    };
    url.searchParams.delete("light");
    url.searchParams.delete("dark");
    window.history.replaceState(
      window.history.state,
      "",
      \`\${url.pathname}\${serializeSearchParams(url.searchParams)}\${url.hash}\`,
    );
  }

  const forcedTheme =
    hasLightTheme === hasDarkTheme ? null : hasLightTheme ? "light" : "dark";
  const prefersDarkTheme = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  let storedTheme = null;

  try {
    storedTheme = window.localStorage.getItem("theme");
  } catch {}

  const useDarkTheme =
    forcedTheme === "dark" ||
    (forcedTheme === null &&
      (storedTheme === "dark" ||
        (storedTheme !== "light" && prefersDarkTheme)));
  document.documentElement.classList.toggle("dark", useDarkTheme);
})();
`;
// Production CSS stays owned by the client entry. This raw source URL is only
// for Vite dev SSR first paint before the client imports `index.css`.
const DEV_ROOT_STYLESHEET_HREF = "/src/index.css";

function buildDevRootStylesheetLinks() {
  if (!import.meta.env.DEV) {
    return [];
  }

  return [
    {
      rel: "stylesheet",
      href: DEV_ROOT_STYLESHEET_HREF,
    },
  ];
}

export function buildRootHead() {
  return {
    links: [
      ...buildDevRootStylesheetLinks(),
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon.png",
        sizes: "16x16",
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon-32.png",
        sizes: "32x32",
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/icon-192.png",
        sizes: "192x192",
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      {
        rel: "canonical",
        href: "https://samebase.com/",
      },
    ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "google",
        content: "notranslate",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      },
      {
        title: SAMEBASE_BRAND_COPY.homepage.title,
      },
      {
        name: "description",
        content: SAMEBASE_BRAND_COPY.homepage.description,
      },
      {
        name: "robots",
        content: "index,follow",
      },
      {
        name: "theme-color",
        content: "#ffffff",
      },
      {
        property: "og:site_name",
        content: SAMEBASE_BRAND_COPY.productName,
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:title",
        content: SAMEBASE_BRAND_COPY.homepage.title,
      },
      {
        property: "og:description",
        content: SAMEBASE_BRAND_COPY.homepage.description,
      },
      {
        property: "og:url",
        content: "https://samebase.com/",
      },
      {
        property: "og:image",
        content: "https://samebase.com/samebase-social-card.png",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: SAMEBASE_BRAND_COPY.homepage.title,
      },
      {
        name: "twitter:description",
        content: SAMEBASE_BRAND_COPY.homepage.description,
      },
      {
        name: "twitter:image",
        content: "https://samebase.com/samebase-social-card.png",
      },
    ],
    scripts: [
      {
        children: disableInstallPromptScript,
      },
      {
        children: agentBrowserHandoffPrehydrationScript,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(structuredData),
      },
      {
        children: initialThemeScript,
      },
      {
        children: publicLandingLogoPrehydrationScript,
      },
      {
        children: appAuthPresentationPrehydrationScript,
      },
      {
        children: appWorkspaceSidebarPrehydrationScript,
      },
    ],
  };
}
