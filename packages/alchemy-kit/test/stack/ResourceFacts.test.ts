import { expect, it } from "vite-plus/test";
import { cronInWords } from "../../src/stack/StackDiagram.ts";

it("writes simple crons in words and keeps every other cron as it is", () => {
  expect(
    ["0 3 * * *", "5 * * * *", "*/15 * * * *", "0 3 * * 1", "0 */6 * * *", "@daily"].map(
      cronInWords,
    ),
  ).toEqual([
    "Daily at 03:00 UTC",
    "Hourly at :05",
    "Every 15 minutes",
    "0 3 * * 1",
    "0 */6 * * *",
    "@daily",
  ]);
});
