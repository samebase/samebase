import { errorPage, signInPage, type Consent } from "./html.js";

/**
 * Every state of every page the broker renders, with sample values. `html.pages.test.ts` takes a
 * screenshot of each, and `pnpm run pages` serves each to open in a browser.
 */

const google = [{ label: "Google", provider: "google", href: "#google" }];
const legal = { privacy: "#privacy", terms: "#terms" };

const preview: Consent = {
  host: "pr-12.weather-app.example.com",
  origin: "https://pr-12.weather-app.example.com",
  loopback: false,
  deployment: { kind: "preview", stage: "pr-12" },
  repository: "octo-org/weather-app",
  scopes: ["openid", "email", "profile"],
  reviewer: "Samebase",
};

const consent = (to: Partial<Consent>) =>
  signInPage({ to: { kind: "consent", ...preview, ...to }, connectors: google, legal });

export const pageStates: Record<string, () => Response> = {
  // One of the hub's own apps: every open connector, and no consent.
  "sign-in": () =>
    signInPage({
      to: { kind: "app", name: "Samebase" },
      connectors: [...google, { label: "GitHub", provider: "github", href: "#github" }],
      legal,
    }),
  "consent-preview": () => consent({}),
  "consent-laptop": () =>
    consent({
      host: "localhost:5173",
      origin: "http://localhost:5173",
      loopback: true,
      deployment: { kind: "development" },
    }),
  "consent-openid-only": () => consent({ scopes: ["openid"] }),
  // A DNS label is at most 63 characters: the longest one that a host can hold.
  "consent-long-host": () => {
    const host = `pr-12-${"a".repeat(53)}-app.example.com`;
    return consent({ host, origin: `https://${host}` });
  },
  error: () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403),
};
