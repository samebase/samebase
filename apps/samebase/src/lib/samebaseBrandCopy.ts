const socialCardTaglineLines = ["The correct way", "to build web apps"] as const;
const tagline = `${socialCardTaglineLines[0]} ${socialCardTaglineLines[1]}`;

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: "Samebase | Give your coding agent a working app",
    description:
      "A repository in your GitHub, a Convex project in your team, a live URL, Google sign-in, and a preview per pull request, deployed by Alchemy from GitHub Actions. Or just use the samebase/base template without an account.",
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
    textLines: socialCardTaglineLines,
  },
} as const;
