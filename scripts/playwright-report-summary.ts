#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { fail, isMainModule, runMain } from "./lib/scriptRuntime.ts";

export type PlaywrightReportSummaryTest = {
  readonly title: string;
  readonly file: string | null;
  readonly line: number | null;
  readonly projectName: string | null;
  readonly status: string;
  readonly durationMs: number;
  readonly errorMessages: readonly string[];
};

export type PlaywrightReportSummary = {
  readonly status: "passed" | "failed";
  readonly stats: {
    readonly total: number;
    readonly expected: number;
    readonly unexpected: number;
    readonly flaky: number;
    readonly skipped: number;
    readonly durationMs: number;
    readonly workers: number | null;
  };
  readonly fatalErrors: readonly string[];
  readonly failures: readonly PlaywrightReportSummaryTest[];
  readonly slowestTests: readonly PlaywrightReportSummaryTest[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNonNegativeNumber(value: unknown): number {
  const number = readNumber(value);
  return number !== null && number >= 0 ? number : 0;
}

function readFatalErrors(report: Record<string, unknown>): string[] {
  return readArray(report["errors"])
    .map((error) => {
      const record = readRecord(error);
      if (record === null) {
        return typeof error === "string" ? error : null;
      }

      return readString(record["message"]) ?? readString(record["value"]);
    })
    .filter((message): message is string => message !== null && message.length > 0);
}

function readResultErrorMessages(result: Record<string, unknown>): string[] {
  const error = readRecord(result["error"]);
  if (error === null) {
    return [];
  }

  const message = readString(error["message"]) ?? readString(error["value"]);
  return message ? [message] : [];
}

function deriveStatus(test: Record<string, unknown>, results: readonly Record<string, unknown>[]) {
  const lastStatus = results
    .map((result) => readString(result["status"]))
    .filter((status): status is string => status !== null)
    .at(-1);

  const testStatus = readString(test["status"]) ?? readString(test["outcome"]);
  if (testStatus === "expected") {
    return lastStatus ?? (readString(test["expectedStatus"]) === "skipped" ? "skipped" : "passed");
  }
  if (testStatus === "unexpected" || testStatus === "flaky" || testStatus === "skipped") {
    return testStatus;
  }
  if (testStatus) {
    return testStatus;
  }

  if (lastStatus) {
    return lastStatus;
  }

  return readString(test["expectedStatus"]) === "skipped" ? "skipped" : "unknown";
}

function buildTitle(suiteTitles: readonly string[], specTitle: string): string {
  return [...suiteTitles, specTitle].filter((title) => title.length > 0).join(" › ");
}

function collectSpecTests(
  spec: Record<string, unknown>,
  suiteTitles: readonly string[],
  tests: PlaywrightReportSummaryTest[],
): void {
  const specTitle = readString(spec["title"]) ?? "(untitled test)";
  const file = readString(spec["file"]);
  const line = readNumber(spec["line"]);

  for (const testValue of readArray(spec["tests"])) {
    const test = readRecord(testValue);
    if (test === null) {
      continue;
    }

    const results = readArray(test["results"])
      .map(readRecord)
      .filter((result) => result !== null);
    const durationMs = results.reduce(
      (sum, result) => sum + readNonNegativeNumber(result["duration"]),
      0,
    );
    const errorMessages = results.flatMap(readResultErrorMessages);

    tests.push({
      title: buildTitle(suiteTitles, specTitle),
      file,
      line,
      projectName: readString(test["projectName"]),
      status: deriveStatus(test, results),
      durationMs,
      errorMessages,
    });
  }
}

function collectSuiteTests(
  suiteValue: unknown,
  parentTitles: readonly string[],
  tests: PlaywrightReportSummaryTest[],
): void {
  const suite = readRecord(suiteValue);
  if (suite === null) {
    return;
  }

  const title = readString(suite["title"]);
  const suiteTitles = title ? [...parentTitles, title] : parentTitles;

  for (const specValue of readArray(suite["specs"])) {
    const spec = readRecord(specValue);
    if (spec !== null) {
      collectSpecTests(spec, suiteTitles, tests);
    }
  }

  for (const childSuite of readArray(suite["suites"])) {
    collectSuiteTests(childSuite, suiteTitles, tests);
  }
}

function readWorkers(report: Record<string, unknown>): number | null {
  const config = readRecord(report["config"]);
  if (config === null) {
    return null;
  }

  const metadata = readRecord(config["metadata"]);
  const actualWorkers = readNumber(metadata?.["actualWorkers"]);
  if (actualWorkers !== null) {
    return actualWorkers;
  }

  return readNumber(config["workers"]);
}

export function summarizePlaywrightJsonReport(
  reportValue: unknown,
  args: { slowestLimit: number },
): PlaywrightReportSummary {
  const report = readRecord(reportValue);
  if (report === null) {
    throw new Error("Expected Playwright JSON report to be an object.");
  }

  const statsRecord = readRecord(report["stats"]);
  const expected = readNonNegativeNumber(statsRecord?.["expected"]);
  const unexpected = readNonNegativeNumber(statsRecord?.["unexpected"]);
  const flaky = readNonNegativeNumber(statsRecord?.["flaky"]);
  const skipped = readNonNegativeNumber(statsRecord?.["skipped"]);
  const durationMs = readNonNegativeNumber(statsRecord?.["duration"]);
  const tests: PlaywrightReportSummaryTest[] = [];

  for (const suite of readArray(report["suites"])) {
    collectSuiteTests(suite, [], tests);
  }

  const failures = tests
    .filter((test) => test.status !== "passed" && test.status !== "skipped")
    .slice()
    .sort((left, right) => right.durationMs - left.durationMs);
  const slowestTests = tests
    .filter((test) => test.durationMs > 0)
    .slice()
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, args.slowestLimit);
  const fatalErrors = readFatalErrors(report);

  return {
    status: unexpected > 0 || failures.length > 0 || fatalErrors.length > 0 ? "failed" : "passed",
    stats: {
      total: expected + unexpected + flaky + skipped,
      expected,
      unexpected,
      flaky,
      skipped,
      durationMs,
      workers: readWorkers(report),
    },
    fatalErrors,
    failures,
    slowestTests,
  };
}

function printSummary(summary: PlaywrightReportSummary): void {
  const parts = [
    `${summary.stats.expected} expected`,
    `${summary.stats.unexpected} unexpected`,
    `${summary.stats.flaky} flaky`,
    `${summary.stats.skipped} skipped`,
    `${Math.round(summary.stats.durationMs / 1000)}s`,
  ];

  console.log(`Playwright JSON summary: ${summary.status} (${parts.join(", ")})`);
}

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    fail("Usage: node scripts/playwright-report-summary.ts <report.json> <summary.json>");
  }

  const report: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
  const summary = summarizePlaywrightJsonReport(report, { slowestLimit: 10 });

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  printSummary(summary);
}

if (isMainModule(import.meta.url)) {
  await runMain(main);
}
