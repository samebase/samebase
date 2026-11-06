import { cancelledPage, chooserPage, consentPage, errorPage } from "./html.js";

/**
 * Every state of every page the broker renders, with sample values. `html.pages.test.ts` takes a
 * screenshot of each, and `pnpm run pages` writes each to a file to open in a browser.
 */

const consent = {
  repository: "octo-org/weather-app",
  connectorLabel: "Google",
  scopes: ["openid", "email", "profile"],
  continueHref: "#continue",
  cancelHref: "#cancel",
  issuerHost: "auth.samebase.com",
};

export const pageStates: Record<string, () => Response> = {
  "consent-preview": () =>
    consentPage({
      ...consent,
      host: "pr-12.weather-app.example.com",
      loopback: false,
      deployment: { kind: "preview", stage: "pr-12" },
    }),
  "consent-laptop": () =>
    consentPage({
      ...consent,
      host: "localhost:5173",
      loopback: true,
      deployment: { kind: "development" },
    }),
  "consent-openid-only": () =>
    consentPage({
      ...consent,
      scopes: ["openid"],
      host: "pr-12.weather-app.example.com",
      loopback: false,
      deployment: { kind: "preview", stage: "pr-12" },
    }),
  // A DNS label is at most 63 characters: the longest one that a host can hold.
  "consent-long-host": () =>
    consentPage({
      ...consent,
      host: `pr-12-${"a".repeat(53)}-app.example.com`,
      loopback: false,
      deployment: { kind: "preview", stage: "pr-12" },
    }),
  cancelled: () =>
    cancelledPage({
      host: "pr-12.weather-app.example.com",
      returnHref: "#return",
    }),
  chooser: () =>
    chooserPage({
      appName: "Samebase",
      connectors: [
        { name: "google", label: "Google", href: "#google" },
        { name: "github", label: "GitHub", href: "#github" },
      ],
    }),
  error: () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403),
};
