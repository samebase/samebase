import {
  parseLandingSlogans,
  selectStableLandingSlogan,
} from "@/lib/landingSlogans";
import {
  buildLandingPageMarkdown,
  landingPageBullets,
  parseLandingCopyMarkdown,
} from "../../lib/landingCopyContent";
import slogansRaw from "../../../../slogans.md?raw";

const landingPageSlogans = parseLandingSlogans(slogansRaw);
const landingPageSloganSeed = import.meta.env.VITE_APP_COMMIT ?? "landing-page";

export const landingPageSlogan = selectStableLandingSlogan(
  landingPageSlogans,
  landingPageSloganSeed,
);

export const landingPageMarkdown = buildLandingPageMarkdown(landingPageSlogan);

export { landingPageBullets, parseLandingCopyMarkdown };
export type { LandingCopyContent } from "../../lib/landingCopyContent";
