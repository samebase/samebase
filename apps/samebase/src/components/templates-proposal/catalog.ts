import basePreview from "./previews/base.svg";
import mailPreview from "./previews/mail.svg";
import samebasePreview from "./previews/samebase.png";

export const templates = {
  base: {
    repository: "samebase/base",
    description: "Shared todos with guest sign-in.",
    preview: {
      src: basePreview,
      alt: "Sample of Base's todo list with guest names, an add field, and checkboxes.",
      caption: "UI sample based on Base's todo view. Uses example tasks.",
    },
    resources: ["GitHub repository", "Convex project", "Cloudflare Worker"],
  },
  mail: {
    repository: "samebase/mail",
    description: "Email for your own domains.",
    preview: {
      src: mailPreview,
      alt: "Sample of Mail with inboxes, a message list, and an open email.",
      caption: "UI sample based on Mail's three-pane workspace. Uses example messages.",
    },
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
    preview: {
      src: samebasePreview,
      alt: "Samebase repository overview with deployments and pull requests.",
      caption: "Screenshot of Samebase's repository overview. Uses test data.",
    },
  },
} as const;

export const templateIds = ["base", "mail", "samebase"] as const;
