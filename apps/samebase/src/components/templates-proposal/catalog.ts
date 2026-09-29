/** Proposed catalog content for the design study. This is not a provisioning manifest. */
export const parts = {
  mail: {
    name: "Mail",
    kind: "Convex component",
    status: "Extraction planned",
    description:
      "Extract the reusable mail backend from the Mail app. Keep the app as its tested example, with a Cloudflare adapter for email and files.",
    requirement:
      "The current app stores mail tables directly. Extract and test the component before offering installation.",
    steps: [
      "Define the component API from the existing Mail app.",
      "Move mail state into an isolated Convex component.",
      "Connect the Cloudflare email Worker and private R2 storage.",
      "Make the Mail app use the component and test incoming mail and replies.",
    ],
  },
  auth: {
    name: "Convex Auth",
    kind: "Library",
    status: "Available",
    description:
      "Sign-in with Convex Auth. Each template owns its sign-in screen and access rules.",
    requirement: "Configure the sign-in methods for your app.",
    steps: [
      "Read the template's authentication setup.",
      "Configure the sign-in provider and callback URLs.",
      "Check access rules with a signed-in and signed-out user.",
    ],
  },
  posthog: {
    name: "PostHog",
    kind: "Integration",
    status: "Proposed shared default",
    description:
      "Understand how people use your app. Keep one tested setup across maintained templates.",
    requirement: "Connect your own PostHog project to enable collection.",
    steps: [
      "Add the shared analytics setup to the app.",
      "Connect the app owner's PostHog project.",
      "Review event collection, consent, and sensitive data handling.",
      "Check that events reach the intended project.",
    ],
  },
  workflow: {
    name: "Workflow",
    kind: "Convex component",
    status: "Available",
    description: "Run durable sequences of steps, with retries and stored progress.",
    requirement: "Define the steps and the checks that prevent duplicate external writes.",
    steps: [
      "Install and register the Workflow component.",
      "Define the workflow and the actions that it calls.",
      "Test a retry after a partial failure.",
    ],
  },
} as const;

export type PartId = keyof typeof parts;

type Template = {
  name: string;
  repository: string;
  summary: string;
  description: string;
  status: string;
  parts: readonly PartId[];
  setup: string;
};

export const templates = {
  base: {
    name: "Base",
    repository: "samebase/base",
    summary: "Start with the essentials.",
    description:
      "A small app with sign-in, a Convex backend, and a deployment setup. Add your own product.",
    status: "Available today",
    parts: ["auth", "posthog"],
    setup: "GitHub, Convex, and Cloudflare",
  },
  mail: {
    name: "Mail",
    repository: "samebase/mail",
    summary: "A mail app for your own domains.",
    description:
      "A private inbox for addresses on your domains. Receive mail, read threads, and send replies. The reusable mail component is the next step.",
    status: "Proposed template",
    parts: ["mail", "auth", "posthog"],
    setup:
      "GitHub, Convex, Cloudflare Worker, private R2 storage, and email routing for your domain",
  },
  samebase: {
    name: "Samebase",
    repository: "samebase/samebase",
    summary: "Study a complete product.",
    description:
      "The Samebase app as a larger reference. A reusable release needs a source export, setup checks, and a license decision.",
    status: "Reference app",
    parts: ["workflow", "auth", "posthog"],
    setup: "Provider apps, billing, domains, and deployment",
  },
} as const satisfies Record<string, Template>;

export type TemplateId = keyof typeof templates;

export const templateIds = ["base", "mail", "samebase"] as const;
export const partIds = ["mail", "auth", "posthog", "workflow"] as const;
