import { samebaseBuildConfig } from "@/lib/samebaseBuildConfig";

export const landingPageBullets = [
  "your notes and code live in a real repository",
  "collaborate in real time with your team",
  "work from desktop or mobile without context switching",
  "use Codex to ship small apps directly from your workspace",
] as const;

export const landingPageSlogan = samebaseBuildConfig.landingPageSlogan;

export function buildLandingPageMarkdown(slogan: string): string {
  return `## ${slogan}

${landingPageBullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

export const landingPageMarkdown = buildLandingPageMarkdown(landingPageSlogan);
