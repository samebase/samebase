import { errorPage, signInPage, type Consent } from "./html.js";

/**
 * Every state of every page the broker renders, with sample values. `html.pages.test.ts` takes a
 * screenshot of each, and `pnpm run pages` serves each to open in a browser.
 */

const google = { label: "Google", provider: "google", href: "#google" };
const github = { label: "GitHub", provider: "github", href: "#github" };
const legal = { privacy: "#privacy", terms: "#terms" };
const host = {
  host: "pr-12.weather-app.example.com",
  origin: "https://pr-12.weather-app.example.com",
};

const preview: Consent = {
  loopback: false,
  deployment: { kind: "preview", stage: "pr-12" },
  repository: "octo-org/weather-app",
  scopes: ["openid", "email", "profile"],
  reviewer: "Samebase",
};

const consent = (
  to: Partial<Consent>,
  page: Partial<{ host: string; origin: string }> = {},
  connectors = [google],
) => signInPage({ ...host, ...page, consent: { ...preview, ...to }, connectors, legal });

export const pageStates: Record<string, () => Response> = {
  // An admin exemption covers the client, which offers two connectors: the picker alone.
  "sign-in": () => signInPage({ ...host, consent: null, connectors: [google, github], legal }),
  "consent-preview": () => consent({}, {}, [google, github]),
  "consent-production": () =>
    consent(
      { deployment: { kind: "production" } },
      { host: "weather-app.example.com", origin: "https://weather-app.example.com" },
    ),
  "consent-development": () =>
    consent(
      { loopback: true, deployment: { kind: "development" } },
      { host: "localhost:5173", origin: "http://localhost:5173" },
    ),
  "consent-openid-only": () => consent({ scopes: ["openid"] }),
  // A DNS label is at most 63 characters: the longest one that a host can hold.
  "consent-long-host": () => {
    const long = `pr-12-${"a".repeat(53)}-app.example.com`;
    return consent({}, { host: long, origin: `https://${long}` });
  },
  error: () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403),
};
