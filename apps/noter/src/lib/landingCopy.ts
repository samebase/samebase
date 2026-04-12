import {
  parseLandingSlogans,
  selectStableLandingSlogan,
  STABLE_LANDING_SLOGAN_SEED,
} from "@/lib/landingSlogans";
import {
  buildLandingPageMarkdown,
  landingPageBullets,
  parseLandingCopyMarkdown,
} from "../../lib/landingCopyContent";
import slogansRaw from "../../../../slogans.md?raw";

const landingPageSlogans = parseLandingSlogans(slogansRaw);

export const landingPageSlogan = selectStableLandingSlogan(
  landingPageSlogans,
  STABLE_LANDING_SLOGAN_SEED,
);

export const landingPageMarkdown = buildLandingPageMarkdown(landingPageSlogan);

export { landingPageBullets, parseLandingCopyMarkdown };
export type { LandingCopyContent } from "../../lib/landingCopyContent";
