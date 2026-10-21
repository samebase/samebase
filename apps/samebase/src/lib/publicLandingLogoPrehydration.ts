import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS } from "@/routeSearch/logo";
import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE } from "@/lib/publicLandingLogo";
import type { PublicLandingLogoPrehydrationScriptArgs } from "@/lib/publicLandingLogoPrehydrationScript";
import prehydratePublicLandingLogoSource from "@/lib/publicLandingLogoPrehydrationScript?inline-script";

const PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-public-landing-logo-prehydration";
const PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE =
  "data-public-landing-logo-static-fallback-hidden";

const publicLandingLogoPrehydrationArgs = {
  rootAttribute: PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE,
  staticFallbackSelector: `[${PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE}]`,
  styleElementId: PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID,
  unsafeSearchKeys: PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS,
} satisfies PublicLandingLogoPrehydrationScriptArgs;

export const publicLandingLogoPrehydrationScript = `(${prehydratePublicLandingLogoSource})(${JSON.stringify(publicLandingLogoPrehydrationArgs)});`;

export function clearPublicLandingLogoStaticFallbackPrehydration() {
  document.documentElement.removeAttribute(PUBLIC_LANDING_LOGO_PREHYDRATION_ROOT_ATTRIBUTE);
  document.getElementById(PUBLIC_LANDING_LOGO_PREHYDRATION_STYLE_ELEMENT_ID)?.remove();
}
