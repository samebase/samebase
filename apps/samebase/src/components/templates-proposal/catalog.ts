export const templates = {
  base: {
    repository: "samebase/base",
    description: "App starter with sign-in.",
    resources: ["GitHub repository", "Convex project", "Cloudflare Worker"],
  },
  mail: {
    repository: "samebase/mail",
    description: "Email for your own domains.",
    resources: [
      "GitHub repository",
      "Convex project",
      "Cloudflare Worker",
      "Private R2 bucket",
      "Email routing",
    ],
  },
  samebase: {
    repository: "samebase/samebase",
    description: "Create and manage apps.",
  },
} as const;

export const templateIds = ["base", "mail", "samebase"] as const;
