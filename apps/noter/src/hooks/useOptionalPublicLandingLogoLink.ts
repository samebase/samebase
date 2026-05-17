import { useContext } from "react";
import { PublicLandingLogoLinkContext } from "#src/contexts/public-landing-logo-link-context-state.ts";

export function useOptionalPublicLandingLogoLink() {
  return useContext(PublicLandingLogoLinkContext);
}
