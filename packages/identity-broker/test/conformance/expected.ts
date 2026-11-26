// The comparison of a run with expected.json, the checked-in list of every module whose result is
// not PASSED, each with a one-line reason. A module that is not listed must pass. A FAILED module
// always fails the run: the list cannot hold FAILED. A listed module that now does better also
// fails the run, so the list stays true. For the RP plan, each module also names what the broker must
// do with the suite's answer: accept it (a code at the return address), reject it (an error
// there), or either, when the suite allows both.
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import type { BrokerOutcome } from "./plans.ts";
import type { Issue } from "./suite.ts";

const Expectation = Schema.Struct({
  result: Schema.Literals(["PASSED", "WARNING", "REVIEW", "SKIPPED", "INTERRUPTED"]),
  broker: Schema.optionalKey(Schema.Literals(["accept", "reject", "either"])),
  reason: Schema.String,
});
const Expected = Schema.Record(Schema.String, Schema.Record(Schema.String, Expectation));

export type Row = {
  readonly plan: string;
  readonly module: string;
  readonly id: string;
  readonly status: string;
  readonly result: string | undefined;
  readonly stopped: string | undefined;
  readonly issues: ReadonlyArray<Issue>;
  readonly broker: BrokerOutcome | undefined;
};

/** The module's result: the suite's, or INTERRUPTED; a logged FAILURE makes it FAILED. */
export const effectiveResult = (row: Row) =>
  row.issues.some((issue) => issue.result === "FAILURE")
    ? "FAILED"
    : row.status === "FINISHED"
      ? (row.result ?? "UNKNOWN")
      : "INTERRUPTED";

const brokerMatches = (
  expected: "accept" | "reject" | "either" | undefined,
  broker: BrokerOutcome | undefined,
) =>
  broker === undefined ||
  (expected === "accept" && broker.kind === "accepted") ||
  (expected === "reject" && broker.kind === "rejected") ||
  (expected === "either" && broker.kind !== "stuck");

const COUNTED = ["PASSED", "FAILED", "WARNING", "REVIEW", "SKIPPED", "INTERRUPTED"] as const;

/** Each row against its expectation, and every listed module that did not run (a full run only). */
export function compare(rows: ReadonlyArray<Row>, partial: boolean) {
  const expected = Schema.decodeUnknownSync(Schema.fromJsonString(Expected))(
    readFileSync(new URL("./expected.json", import.meta.url), "utf8"),
  );
  const byModule = new Map(
    Object.entries(expected).flatMap(([plan, modules]) =>
      Object.entries(modules).map(([module, expectation]) => [`${plan}/${module}`, expectation]),
    ),
  );
  const lines: string[] = [];
  let ok = true;
  for (const row of rows) {
    const expectation = byModule.get(`${row.plan}/${row.module}`);
    const result = effectiveResult(row);
    const wanted = expectation?.result ?? "PASSED";
    const good = result === wanted && brokerMatches(expectation?.broker, row.broker);
    ok &&= good;
    const broker = row.broker === undefined ? "" : `${row.broker.kind} (${row.broker.detail})`;
    const wantedText = `${wanted}${expectation?.broker === undefined ? "" : `, broker ${expectation.broker}`}`;
    lines.push(
      `| ${good ? "ok" : "**DIFFERS**"} | ${row.module} | ${result} | ${broker} | ${wantedText} |`,
    );
  }
  const plans = [...new Set(rows.map((row) => row.plan))];
  if (!partial) {
    for (const [plan, modules] of Object.entries(expected)) {
      for (const module of Object.keys(modules)) {
        if (
          plans.includes(plan) &&
          !rows.some((row) => row.plan === plan && row.module === module)
        ) {
          ok = false;
          lines.push(`| **DIFFERS** | ${module} | not run | | listed in expected.json |`);
        }
      }
    }
  }
  const counts = plans.map((plan) => {
    const results = rows.filter((row) => row.plan === plan).map(effectiveResult);
    return `| ${plan} | ${COUNTED.map((name) => results.filter((result) => result === name).length).join(" | ")} |`;
  });
  const table = `## OpenID conformance

| Plan | ${COUNTED.join(" | ")} |
|---|${COUNTED.map(() => "---:").join("|")}|
${counts.join("\n")}

| Verdict | Module | Result | Broker outcome | Expected |
|---|---|---|---|---|
${lines.join("\n")}
`;
  return { ok, table };
}
