const tagline = "GitHub-backed workspace for notes, code, and AI";

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: `Samebase | ${tagline}`,
    description: `${tagline}. Keep work in a real repository, collaborate in real time, and ship small apps from the same workspace.`,
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
  },
} as const;
