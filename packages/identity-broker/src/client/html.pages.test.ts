import { expect, test } from "@playwright/test";
import { cancelledPage, chooserPage, consentPage, errorPage } from "./html.js";

// Every state of every page the broker renders, with sample values. Each becomes one screenshot per
// theme and size in `screenshots/`, so a change to a page shows as a changed image in its pull request.

const consent = {
  repository: "octo-org/weather-app",
  connectorLabel: "Google",
  scopes: ["openid", "email", "profile"],
  continueHref: "#continue",
  cancelHref: "#cancel",
  issuerHost: "auth.samebase.com",
};

const states: Record<string, () => Response> = {
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

const sizes = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
};

for (const [name, render] of Object.entries(states)) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const [size, viewport] of Object.entries(sizes)) {
      test(`${name}, ${colorScheme}, ${size}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize(viewport);
        await page.setContent(await render().text());
        await expect(page).toHaveScreenshot(`${name}-${colorScheme}-${size}.png`, {
          fullPage: true,
        });
      });
    }
  }
}
