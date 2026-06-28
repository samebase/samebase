const tagline = "The correct way to build web apps";

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: `Samebase | ${tagline}`,
    description: `${tagline}. Convex + Cloudflare is all you need. You own 100% of your code and data.`,
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
  },
} as const;
