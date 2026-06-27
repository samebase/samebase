const tagline = "The proper way to build web apps";

export const SAMEBASE_BRAND_COPY = {
  productName: "Samebase",
  siteName: "samebase.com",
  tagline,
  homepage: {
    title: `Samebase | ${tagline}`,
    description: `${tagline}. Code & data on your own infra.`,
  },
  socialCard: {
    title: "samebase.com social card",
    accessibleDescription: `Samebase logo and the text ${tagline}.`,
    text: tagline,
  },
} as const;
