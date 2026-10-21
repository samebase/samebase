export type PublicLandingLogoPrehydrationScriptArgs = {
  rootAttribute: string;
  staticFallbackSelector: string;
  styleElementId: string;
  unsafeSearchKeys: readonly string[];
};

/**
The page's head runs this function as a classic inline script before React hydration, compiled
from this file (dev/inlineScriptPlugin.ts). Keep it self-contained: it reads only browser globals
and `args`.

The static SSG document cannot know the request query string, so the public
landing logo fallback in the HTML can be the default SVG even when the URL asks
for a different logo view, color, shape, or render behavior. When such a query
key is present, this script hides only the static fallback image before first
paint. React then renders the query-aware SVG and removes this temporary
prehydration marker before the browser paints the hydrated tree.
*/
export default function prehydratePublicLandingLogoStaticFallback(
  args: PublicLandingLogoPrehydrationScriptArgs,
) {
  function hasUnsafeSearchParam(searchParams: { has: (key: string) => boolean }) {
    for (const key of args.unsafeSearchKeys) {
      if (searchParams.has(key)) return true;
    }

    return false;
  }

  function installPrehydrationStyle() {
    if (document.getElementById(args.styleElementId) !== null) return;

    const styleElement = document.createElement("style");
    styleElement.id = args.styleElementId;
    styleElement.textContent = `
html[${args.rootAttribute}] ${args.staticFallbackSelector} {
  opacity: 0 !important;
}
`;
    document.head.append(styleElement);
  }

  try {
    const searchParams = new window.URLSearchParams(window.location.search);
    if (!hasUnsafeSearchParam(searchParams)) return;

    document.documentElement.setAttribute(args.rootAttribute, "");
    installPrehydrationStyle();
  } catch {}
}
