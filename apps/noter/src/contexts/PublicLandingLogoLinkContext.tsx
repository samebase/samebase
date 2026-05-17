import { useState, type ReactNode } from "react";
import { PublicLandingLogoLinkContext } from "#src/contexts/public-landing-logo-link-context-state.ts";

export function PublicLandingLogoLinkProvider({
  children,
}: {
  children: ReactNode;
}) {
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
