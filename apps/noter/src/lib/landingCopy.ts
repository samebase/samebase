import { parseLandingSlogans, selectLandingSlogan } from "@/lib/landingSlogans";
import {
  buildLandingPageMarkdown,
  landingPageBullets,
  parseLandingCopyMarkdown,
} from "./landingCopyContent";
import slogansRaw from "../../../../slogans.md?raw";

const landingPageSlogans = parseLandingSlogans(slogansRaw);

export const landingPageSlogan = selectLandingSlogan(landingPageSlogans);

export const landingPageMarkdown = buildLandingPageMarkdown(landingPageSlogan);

export { landingPageBullets, parseLandingCopyMarkdown };
export type { LandingCopyContent } from "./landingCopyContent";
