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

export const landingPageSlogans = parseLandingSlogans(slogansRaw);

export function buildLandingPageMarkdown(slogan: string): string {
  return `## ${slogan}

${landingPageBullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

export function selectLandingPageMarkdown(random = Math.random): string {
  return buildLandingPageMarkdown(
    selectLandingSlogan(landingPageSlogans, DEFAULT_LANDING_SLOGAN, random),
  );
}

export const landingPageMarkdown = buildLandingPageMarkdown(DEFAULT_LANDING_SLOGAN);
