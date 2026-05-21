import { useState, type ReactNode } from "react";
import { PublicLandingLogoLinkContext } from "@/contexts/public-landing-logo-link-context-state";

export function PublicLandingLogoLinkProvider({ children }: { children: ReactNode }) {
  const [isLogoLinkVisible, setIsLogoLinkVisible] = useState(false);

  return (
    <PublicLandingLogoLinkContext.Provider
      value={{
        isLogoLinkVisible,
        setIsLogoLinkVisible,
      }}
    >
      {children}
    </PublicLandingLogoLinkContext.Provider>
  );
}
