/**
Proves every task is solvable in every design: runs each oracle against the stub, then runs the
task check on the result. Prints the shortest Samebase call path per task and design.

node selftest.ts
*/
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DESIGNS, type DesignId } from "./designs.ts";
import { dispatch, loadState, readCalls, readConfig, writeConfig } from "./runtime.ts";
import { TASKS, keyFor } from "./tasks.ts";

const designs: DesignId[] = ["P", "W", "H"];
const lengths: Record<string, Record<DesignId, number>> = {};
let failures = 0;
for (const task of TASKS) {
  lengths[task.id] = { P: 0, W: 0, H: 0 };
  for (const design of designs) {
    const runDir = mkdtempSync(path.join(tmpdir(), "catalog-selftest-"));
    writeConfig(runDir, {
      design,
      scheme: "D",
      variant: "base",
      fixture: task.fixture,
      providers: false,
    });
    const results: unknown[] = [];
    for (const step of task.oracle[design]) {
      const name = DESIGNS[design].tools.find((tool) => tool.key === step.key)?.names.D;
      if (!name) throw new Error(`${task.id}/${design}: no tool ${step.key}`);
      const outcome = dispatch(runDir, "samebase", name, step.args(results));
      if (!outcome.ok) console.log(`  ${task.id}/${design} ${name} failed: ${outcome.text}`);
      results.push(outcome.structured);
    }
    const config = readConfig(runDir);
    const calls = readCalls(runDir).map((call) => ({ ...call, key: keyFor(design, "D", call) }));
    const check = task.check({
      design,
      state: loadState(runDir, config),
      calls,
      answer: task.oracleAnswer,
    });
    lengths[task.id][design] = task.oracle[design].length;
    if (!check.success) {
      failures += 1;
      console.log(`FAIL ${task.id}/${design}: ${check.notes.join("; ")}`);
    }
    rmSync(runDir, { recursive: true, force: true });
  }
}
console.log("Shortest Samebase call path (oracle) per task:");
console.log("task                               P  W  H");
for (const [id, row] of Object.entries(lengths))
  console.log(`${id.padEnd(34)} ${row.P}  ${row.W}  ${row.H}`);
const total = (design: DesignId) =>
  Object.values(lengths).reduce((sum, row) => sum + row[design], 0);
console.log(`total                              ${total("P")} ${total("W")} ${total("H")}`);
console.log(failures === 0 ? "selftest passed" : `selftest failed: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
