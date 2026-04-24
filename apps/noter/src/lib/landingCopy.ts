import { parseLandingSlogans, selectLandingSlogan } from "@/lib/landingSlogans";
import slogansRaw from "../../../../slogans.md?raw";

export const landingPageBullets = [
  "your notes and code live in a real repository",
  "collaborate in real time with your team",
  "work from desktop or mobile without context switching",
  "use Codex to ship small apps directly from your workspace",
] as const;

const landingPageSlogans = parseLandingSlogans(slogansRaw);

export const landingPageSlogan = selectLandingSlogan(landingPageSlogans);

export const landingPageMarkdown = `## ${landingPageSlogan}

${landingPageBullets.map((bullet) => `- ${bullet}`).join("\n")}`;
