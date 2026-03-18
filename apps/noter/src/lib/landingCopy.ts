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

export type LandingCopyContent = {
  slogan: string;
  bullets: string[];
};

export function parseLandingCopyMarkdown(markdown: string): LandingCopyContent {
  const lines = markdown.split(/\r?\n/);
  const headingLine = lines.find((line) => line.trimStart().startsWith("## "));
  const parsedSlogan = headingLine?.replace(/^##\s+/, "").trim();
  const parsedBullets = lines
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("- ") ||
        line.startsWith("* ") ||
        /^\d+\.\s+/.test(line),
    )
    .map((line) => line.replace(/^(- |\* |\d+\.\s+)/, "").trim())
    .filter((line) => line.length > 0);

  return {
    slogan:
      parsedSlogan && parsedSlogan.length > 0
        ? parsedSlogan
        : landingPageSlogan,
    bullets: parsedBullets.length > 0 ? parsedBullets : [...landingPageBullets],
  };
}
