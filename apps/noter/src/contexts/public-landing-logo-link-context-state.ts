import { createContext } from "react";

export type PublicLandingLogoLinkContextValue = {
  isLogoLinkVisible: boolean;
  setIsLogoLinkVisible: (value: boolean) => void;
};

export const PublicLandingLogoLinkContext =
  createContext<PublicLandingLogoLinkContextValue | null>(null);
