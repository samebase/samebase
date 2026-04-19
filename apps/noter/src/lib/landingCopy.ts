import { DEFAULT_LANDING_SLOGAN } from "@/lib/landingSlogans";

export const landingPageBullets = [
  "your notes and code live in a real repository",
  "collaborate in real time with your team",
  "work from desktop or mobile without context switching",
  "use Codex to ship small apps directly from your workspace",
] as const;

export const landingPageSlogan =
  typeof __LANDING_PAGE_SLOGAN__ === "string" &&
  __LANDING_PAGE_SLOGAN__.trim().length > 0
    ? __LANDING_PAGE_SLOGAN__.trim()
    : DEFAULT_LANDING_SLOGAN;

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
