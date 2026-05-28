export const landingPageBullets = [
  "your notes and code live in a real repository",
  "collaborate in real time with your team",
  "work from desktop or mobile without context switching",
  "use Codex to ship small apps directly from your workspace",
] as const;

function readLandingPageSlogan(): string {
  if (typeof __LANDING_PAGE_SLOGAN__ !== "string") {
    throw new Error("Missing build-selected landing slogan.");
  }

  const slogan = __LANDING_PAGE_SLOGAN__.trim();

  if (!slogan) {
    throw new Error("Build-selected landing slogan is empty.");
  }

  return slogan;
}

export const landingPageSlogan = readLandingPageSlogan();

export function buildLandingPageMarkdown(slogan: string): string {
  return `## ${slogan}

${landingPageBullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

export const landingPageMarkdown = buildLandingPageMarkdown(landingPageSlogan);
