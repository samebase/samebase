const socialCardTaglineLines = ["A dashboard", "for Alchemy"] as const;
const tagline = `${socialCardTaglineLines[0]} ${socialCardTaglineLines[1]}`;

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: "Samebase | A dashboard for Alchemy",
    description:
      "Samebase reads the Alchemy state and displays all the stacks alongside the repo, commit, and PR that deployed them.",
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
    textLines: socialCardTaglineLines,
  },
} as const;
