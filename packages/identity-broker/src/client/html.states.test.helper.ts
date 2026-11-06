import { cancelledPage, errorPage, signInPage, type Consent } from "./html.js";

/**
 * Every state of every page the broker renders, with sample values. `html.pages.test.ts` takes a
 * screenshot of each, and `pnpm run pages` serves each to open in a browser.
 */

const google = [{ label: "Google", provider: "google", href: "#google" }];

const preview: Consent = {
  host: "pr-12.weather-app.example.com",
  loopback: false,
  deployment: { kind: "preview", stage: "pr-12" },
  repository: "octo-org/weather-app",
  scopes: ["openid", "email", "profile"],
  cancelHref: "#cancel",
  issuerHost: "auth.samebase.com",
};

export const pageStates: Record<string, () => Response> = {
  // One of the hub's own apps: every open connector, and no consent.
  "sign-in": () =>
    signInPage({
      to: { kind: "app", name: "Samebase" },
      connectors: [...google, { label: "GitHub", provider: "github", href: "#github" }],
    }),
  "consent-preview": () => signInPage({ to: { kind: "consent", ...preview }, connectors: google }),
  "consent-laptop": () =>
    signInPage({
      to: {
        kind: "consent",
        ...preview,
        host: "localhost:5173",
        loopback: true,
        deployment: { kind: "development" },
      },
      connectors: google,
    }),
  "consent-openid-only": () =>
    signInPage({ to: { kind: "consent", ...preview, scopes: ["openid"] }, connectors: google }),
  // A DNS label is at most 63 characters: the longest one that a host can hold.
  "consent-long-host": () =>
    signInPage({
      to: { kind: "consent", ...preview, host: `pr-12-${"a".repeat(53)}-app.example.com` },
      connectors: google,
    }),
  cancelled: () =>
    cancelledPage({
      host: "pr-12.weather-app.example.com",
      returnHref: "#return",
    }),
  error: () => errorPage("Sign-in is off", "Sign-in for this app is turned off.", 403),
};
