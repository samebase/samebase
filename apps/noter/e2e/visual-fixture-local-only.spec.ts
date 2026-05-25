import { expect, test } from "@playwright/test";

const DEPLOYED_HOSTNAME = "noter.md";
const deployedHostLaunchOptions = {
  args: [
    "--disable-session-crashed-bubble",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    `--host-resolver-rules=MAP ${DEPLOYED_HOSTNAME} 127.0.0.1`,
  ],
};

test.use({
  launchOptions: deployedHostLaunchOptions,
});

function buildDeployedVisualFixtureUrl() {
  const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
  return `http://${DEPLOYED_HOSTNAME}:${playwrightVitePort}/visual-fixture?mode=button`;
}

test("visual fixture route renders not found on deployed hostnames", async ({ page }) => {
  await page.goto(buildDeployedVisualFixtureUrl(), {
    waitUntil: "domcontentloaded",
  });

  const content = page.getByTestId("not-found-route-content");
  await expect(content).toBeVisible();
  await expect(content).toContainText("Page not found");
  await expect(content).toContainText("/visual-fixture");
  await expect(page.getByTestId("button-visual-fixture")).toHaveCount(0);
});
