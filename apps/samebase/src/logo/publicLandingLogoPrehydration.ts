import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS } from "@/routeSearch/logo";
import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE } from "@/logo/publicLandingLogoConstants";

const PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-public-landing-logo-prehydration";
const PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE =
  "data-public-landing-logo-static-fallback-hidden";

type PublicLandingLogoPrehydrationArgs = {
  rootAttribute: string;
  staticFallbackSelector: string;
  styleElementId: string;
  unsafeSearchKeys: readonly string[];
};

const publicLandingLogoPrehydrationArgs = {
  rootAttribute: PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE,
  staticFallbackSelector: `[${PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE}]`,
  styleElementId: PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID,
  unsafeSearchKeys: PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS,
} satisfies PublicLandingLogoPrehydrationArgs;

/**
This function is serialized with Function#toString and emitted as a classic
inline head script before React hydration. Keep the body self-contained: it can
only reference browser globals and values passed through args.

The static SSG document cannot know the request query string, so the public
landing logo fallback in the HTML can be the default SVG even when the URL asks
for a different logo view, color, shape, or render behavior. When such a query
key is present, this script hides only the static fallback image before first
paint. React then renders the query-aware SVG and removes this temporary
prehydration marker before the browser paints the hydrated tree.
*/
function InlineScript_prehydratePublicLandingLogoStaticFallback(
  args: PublicLandingLogoPrehydrationArgs,
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

export const publicLandingLogoPrehydrationScript = `(${InlineScript_prehydratePublicLandingLogoStaticFallback.toString()})(${JSON.stringify(publicLandingLogoPrehydrationArgs)});`;

export function clearPublicLandingLogoStaticFallbackPrehydration() {
  document.documentElement.removeAttribute(PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE);
  document.getElementById(PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID)?.remove();
}
