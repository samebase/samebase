const socialCardTaglineLines = ["The correct way", "to build web apps"] as const;
const tagline = `${socialCardTaglineLines[0]} ${socialCardTaglineLines[1]}`;

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: "Samebase | Give your coding agent a working app",
    description:
      "One place to manage GitHub, Convex, and Cloudflare across all your apps. Just use the samebase/base template without creating an account.",
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
    textLines: socialCardTaglineLines,
  },
} as const;
