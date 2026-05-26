import {
  DEFAULT_LANDING_SLOGAN,
  parseLandingSlogans,
  selectLandingSlogan,
} from "@/lib/landingSlogans";
import slogansRaw from "../../../../slogans.md?raw";

export const landingPageBullets = [
  "your notes and code live in a real repository",
  "collaborate in real time with your team",
  "work from desktop or mobile without context switching",
  "use Codex to ship small apps directly from your workspace",
] as const;

const landingPageSlogans = parseLandingSlogans(slogansRaw);

// SSR and hydration need the same copy height; random rotation would make the
// landing card move when the browser evaluates this module.
export const landingPageSlogan = selectLandingSlogan(
  landingPageSlogans,
  DEFAULT_LANDING_SLOGAN,
  () => 0,
);

export const landingPageMarkdown = `## ${landingPageSlogan}

${landingPageBullets.map((bullet) => `- ${bullet}`).join("\n")}`;
