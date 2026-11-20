import { expect, test } from "./visualFixtureTest";

test("draws Worker bindings and opens their resource inspector by pointer", async ({ page }) => {
  await page.setViewportSize({ width: 920, height: 1050 });
  await page.goto("/visual-fixture?mode=alchemy-diagram");
  const board = page.getByLabel("System diagram", { exact: true });
  await expect(board.getByText("API · Catalog", { exact: true })).toBeVisible();
  await expect(board).toHaveScreenshot("worker-bindings.png", {
    animations: "disabled",
    scale: "css",
  });
  await board.getByRole("button", { name: "Inspect Api, Worker", exact: true }).click();
  await expect(
    board
      .getByRole("complementary", { name: "Selected resource" })
      .getByRole("button", { name: "Session" }),
  ).toBeVisible();
});
