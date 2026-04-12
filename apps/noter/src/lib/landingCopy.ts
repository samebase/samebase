import { parseLandingSlogans, selectLandingSlogan } from "@/lib/landingSlogans";
import slogansRaw from "../../../../slogans.md?raw";

export const landingPageBullets = [
  "connect your computer once so ChatGPT can reach the same Codex setup",
  "use the same repo, tools, and machine from ChatGPT or Codex",
  "continue the work from desktop or mobile without losing context",
  "keep notes, code, and approvals in a real repository",
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
  const listMarkerPattern = /^(- |\* |\d+\.\s+)/;
  const headingLine = lines.find((line) => /^#{1,6}\s+/.test(line.trimStart()));
  const parsedSlogan = headingLine
    ?.trimStart()
    .replace(/^#{1,6}\s+/, "")
    .trim();
  const parsedBullets: string[] = [];
  let currentBullet: string | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (listMarkerPattern.test(trimmedLine)) {
      if (currentBullet !== null) {
        parsedBullets.push(currentBullet);
      }

      const nextBullet = trimmedLine.replace(listMarkerPattern, "").trim();
      currentBullet = nextBullet.length > 0 ? nextBullet : null;
      continue;
    }

    const isBulletContinuation =
      currentBullet !== null &&
      /^[ \t]+/.test(line) &&
      trimmedLine.length > 0 &&
      !listMarkerPattern.test(trimmedLine);

    if (isBulletContinuation) {
      currentBullet = `${currentBullet} ${trimmedLine}`;
      continue;
    }

    if (currentBullet !== null) {
      parsedBullets.push(currentBullet);
      currentBullet = null;
    }
  }

  if (currentBullet !== null) {
    parsedBullets.push(currentBullet);
  }

  return {
    slogan: parsedSlogan ?? "",
    bullets: parsedBullets,
  };
}
