import { useContext } from "react";
import { PublicLandingLogoLinkContext } from "@/contexts/public-landing-logo-link-context-state";

export function useOptionalPublicLandingLogoLink() {
  return useContext(PublicLandingLogoLinkContext);
}
