const socialCardTaglineLines = ["A dashboard", "for Alchemy"] as const;
const tagline = `${socialCardTaglineLines[0]} ${socialCardTaglineLines[1]}`;

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: "Samebase | A dashboard for Alchemy",
    description:
      "Samebase reads the state that Alchemy keeps and shows every app you deploy: its URL, the deployed commit, its checks, and the preview of each pull request.",
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
    textLines: socialCardTaglineLines,
  },
} as const;
