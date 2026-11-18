import { TEMPLATE_BASE_ROUTE, TEMPLATE_IDENTITY_HUB_ROUTE } from "@/routeSearch/landingPreview";

/** A GitHub Actions secret or variable that a template's workflow reads. Text fields mark code with
 * backticks, as Markdown does. */
export type TemplateSetting = {
  names: readonly string[];
  kind: "secret" | "variable";
  value: string;
  optional: boolean;
  /** Where Samebase takes the value from when it creates the repository, or null. */
  samebase: string | null;
};

export type TemplateSettingGroup = {
  heading: string;
  settings: readonly TemplateSetting[];
  after: string | null;
};

type TemplateDefinition = {
  route: string;
  name: string;
  repository: string;
  summary: string;
  description: string;
  image: { src: string; alt: string; width: number; height: number };
  demo: { label: string; href: string };
  details: readonly { label: string; values: readonly string[] }[];
  /** Whether New App on samebase.com creates this template. */
  createdBySamebase: boolean;
  settingGroups: readonly TemplateSettingGroup[];
  steps: readonly { heading: string; body: string }[];
};

export const BASE_TEMPLATE = {
  route: TEMPLATE_BASE_ROUTE,
  name: "Web app",
  repository: "samebase/base",
  summary: "A Convex app with sign-in on every pull request preview, deployed by Alchemy.",
  description:
    "React, TanStack Start, and Convex, deployed by Alchemy from your GitHub Actions. Every pull request gets a preview with its own data, and Google and GitHub sign-in work on it through Samebase's public hub.",
  image: {
    src: "/templates/base.webp",
    width: 1600,
    height: 540,
    alt: "A pull request comment with the preview's URL, beside the sign-in page of that preview, which names the repository.",
  },
  demo: { label: "Live demo", href: "https://ideal-bandicoot-981.convex.site" },
  details: [
    { label: "Stack", values: ["React", "TanStack Start", "Convex", "Alchemy"] },
    { label: "Sign-in", values: ["Google", "GitHub", "Guests"] },
    { label: "Idle cost", values: ["$0/month"] },
    { label: "License", values: ["MIT"] },
  ],
  createdBySamebase: true,
  settingGroups: [
    {
      heading: "Before the first run",
      settings: [
        {
          names: ["CONVEX_ACCESS_TOKEN"],
          kind: "secret",
          value:
            "A team access token: the Convex dashboard, your team's Settings, then Access Tokens. The token names its team, so the app deploys there.",
          optional: false,
          samebase: "written for you, from your Convex connection.",
        },
      ],
      after: null,
    },
  ],
  steps: [
    { heading: "Use the template", body: "Create your repository from samebase/base on GitHub." },
    {
      heading: "Add the token",
      body: "Run `gh secret set CONVEX_ACCESS_TOKEN` in the repository.",
    },
    {
      heading: "Push to main",
      body: "Or run the `alchemy` workflow from the Actions tab. The first run creates the Convex project and deploys in about 90 seconds. The log ends with the URL.",
    },
  ],
} as const satisfies TemplateDefinition;

export const IDENTITY_HUB_TEMPLATE = {
  route: TEMPLATE_IDENTITY_HUB_ROUTE,
  name: "Identity hub",
  repository: "samebase/identity-hub",
  summary: "Your own Google and GitHub sign-in for every deployment of your apps.",
  description:
    "The hub that apps register with when they deploy, so production, every preview, and every dev checkout get sign-in from one Google client and one GitHub client. Samebase runs this repository unchanged at id.samebase.com. Run your own for your name on the page, your Google project, and your rule on who may register.",
  image: {
    src: "/templates/identity-hub.webp",
    width: 1600,
    height: 1000,
    alt: "The hub's sign-in page: Sign in to the app's address, the repository it belongs to, and Continue with GitHub or Google.",
  },
  demo: {
    label: "Live at id.samebase.com",
    href: "https://id.samebase.com/.well-known/openid-configuration",
  },
  details: [
    { label: "Stack", values: ["Convex", "@samebase/identity-broker", "Alchemy"] },
    { label: "Standards", values: ["OpenID Connect", "RFC 7591 registration"] },
    { label: "You need", values: ["A Convex team", "A Google Cloud project", "A GitHub account"] },
    { label: "License", values: ["MIT"] },
  ],
  createdBySamebase: false,
  settingGroups: [
    {
      heading: "Before the first run",
      settings: [
        {
          names: ["CONVEX_ACCESS_TOKEN"],
          kind: "secret",
          value: "A Convex team access token.",
          optional: false,
          samebase: null,
        },
        {
          names: ["HUB_OWNERS"],
          kind: "variable",
          value:
            "`any`, or the numeric ids of the GitHub accounts whose repositories may register, separated by commas.",
          optional: false,
          samebase: null,
        },
        {
          names: ["HUB_NAME"],
          kind: "variable",
          value: "The name on the sign-in page.",
          optional: false,
          samebase: null,
        },
        {
          names: ["HUB_TERMS_URL"],
          kind: "variable",
          value: "Your terms for the sign-in service.",
          optional: false,
          samebase: null,
        },
        {
          names: ["HUB_PRIVACY_URL"],
          kind: "variable",
          value: "Your privacy notice for the sign-in service.",
          optional: false,
          samebase: null,
        },
        {
          names: ["HUB_PROJECT"],
          kind: "variable",
          value: "The Convex project name. Default: the repository name.",
          optional: true,
          samebase: null,
        },
        {
          names: ["IDENTITY_HUB_MODERATION_KEY"],
          kind: "secret",
          value: "A long random key for the moderation API.",
          optional: true,
          samebase: null,
        },
      ],
      after:
        "The first run creates the Convex project and an empty deployment, and prints its URL. That URL is the issuer, unless you give the hub a custom domain and set the variable `ISSUER`.",
    },
    {
      heading: "After the first run",
      settings: [
        {
          names: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
          kind: "secret",
          value: "A Google web client with the redirect URI `<issuer>/connectors/google/callback`.",
          optional: false,
          samebase: null,
        },
        {
          names: ["AUTH_GITHUB_CLIENT_ID", "AUTH_GITHUB_CLIENT_SECRET"],
          kind: "secret",
          value: "A GitHub OAuth App with the callback URL `<issuer>/connectors/github/callback`.",
          optional: false,
          samebase: null,
        },
      ],
      after:
        "Then create the signing keys once on the deployment from a clone, and run the workflow again.",
    },
  ],
  steps: [
    { heading: "Use the template", body: "Create your repository from samebase/identity-hub." },
    { heading: "Set the settings", body: "The settings before the first run, listed above." },
    {
      heading: "Run the workflow once",
      body: "It creates the Convex project and prints the deployment's URL.",
    },
    {
      heading: "Create the two clients",
      body: "A Google web client and a GitHub OAuth App with the callbacks above, saved as secrets.",
    },
    {
      heading: "Create the keys and run again",
      body: "`pnpm run keys:init` from a clone, once. The next run pushes the hub.",
    },
  ],
} as const satisfies TemplateDefinition;

/**
 * The public template repositories, in gallery order. The gallery at /templates and each template's
 * page read them; each repository's README has every step and command.
 */
export const TEMPLATES = [BASE_TEMPLATE, IDENTITY_HUB_TEMPLATE];

export type Template = (typeof TEMPLATES)[number];
