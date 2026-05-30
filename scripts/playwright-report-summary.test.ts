import { describe, expect, it } from "vite-plus/test";

import { summarizePlaywrightJsonReport } from "./playwright-report-summary.ts";

describe("playwright-report-summary", () => {
  it("summarizes stats, failures, and slowest tests from Playwright JSON", () => {
    const summary = summarizePlaywrightJsonReport(
      {
        config: {
          workers: 4,
          metadata: {
            actualWorkers: 2,
          },
        },
        stats: {
          expected: 2,
          unexpected: 1,
          flaky: 0,
          skipped: 1,
          duration: 12345,
        },
        errors: [],
        suites: [
          {
            title: "root",
            suites: [
              {
                title: "e2e/example.spec.ts",
                specs: [
                  {
                    title: "passes",
                    file: "e2e/example.spec.ts",
                    line: 10,
                    tests: [
                      {
                        projectName: "chromium",
                        status: "expected",
                        results: [{ status: "passed", duration: 40 }],
                      },
                    ],
                  },
                  {
                    title: "fails",
                    file: "e2e/example.spec.ts",
                    line: 20,
                    tests: [
                      {
                        projectName: "chromium",
                        status: "failed",
                        results: [
                          {
                            status: "failed",
                            duration: 100,
                            error: {
                              message: "Expected visible button.",
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    title: "skipped",
                    file: "e2e/example.spec.ts",
                    line: 30,
                    tests: [
                      {
                        projectName: "chromium",
                        expectedStatus: "skipped",
                        results: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { slowestLimit: 2 },
    );

    expect(summary).toMatchObject({
      status: "failed",
      stats: {
        total: 4,
        expected: 2,
        unexpected: 1,
        flaky: 0,
        skipped: 1,
        durationMs: 12345,
        workers: 2,
      },
    });
    expect(summary.failures).toEqual([
      {
        title: "root › e2e/example.spec.ts › fails",
        file: "e2e/example.spec.ts",
        line: 20,
        projectName: "chromium",
        status: "failed",
        durationMs: 100,
        errorMessages: ["Expected visible button."],
      },
    ]);
    expect(summary.slowestTests.map((test) => test.title)).toEqual([
      "root › e2e/example.spec.ts › fails",
      "root › e2e/example.spec.ts › passes",
    ]);
  });
});
