import appCss from "#src/index.css?url";

const appTitle = "noter | GitHub-backed markdown notes and AI workspace";
const appDescription =
  "GitHub-backed markdown notes and AI workspace. Keep notes and code in a real repository, collaborate in real time, and ship small apps from the same workspace.";
const productionHostnames = ["noter.md", "www.noter.md"] as const;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "noter",
      alternateName: "noter.md",
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
const disableInstallPromptScript = `
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});
`;
const stripProductionUiQueryScript = `
(() => {
  const productionHostnames = new Set(${JSON.stringify(productionHostnames)});
  if (!productionHostnames.has(window.location.hostname)) return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has("prod-ui")) return;

  url.searchParams.delete("prod-ui");
  window.history.replaceState(
    window.history.state,
    "",
    \`\${url.pathname}\${url.search}\${url.hash}\`,
  );
})();
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

export function buildRootHead() {
  return {
    links: [
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
        href: "https://noter.md/",
      },
      {
        rel: "stylesheet",
        href: appCss,
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
        title: appTitle,
      },
      {
        name: "description",
        content: appDescription,
      },
      {
        name: "robots",
        content: "index,follow",
      },
      {
        name: "theme-color",
        content: "#000000",
      },
      {
        property: "og:site_name",
        content: "noter",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:title",
        content: appTitle,
      },
      {
        property: "og:description",
        content: appDescription,
      },
      {
        property: "og:url",
        content: "https://noter.md/",
      },
      {
        property: "og:image",
        content: "https://noter.md/noter-social-card.png",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: appTitle,
      },
      {
        name: "twitter:description",
        content: appDescription,
      },
      {
        name: "twitter:image",
        content: "https://noter.md/noter-social-card.png",
      },
    ],
    scripts: [
      {
        children: disableInstallPromptScript,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(structuredData),
      },
      {
        children: stripProductionUiQueryScript,
      },
      {
        children: initialThemeScript,
      },
    ],
  };
}
