/**
Sums Codex token usage (turn.completed events) under one or more directories.

node tally-tokens.ts <dir> [<dir> ...]
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Totals = { calls: number; input: number; cached: number; output: number };

function numberField(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) return 0;
  const found = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  return typeof found === "number" ? found : 0;
}

function tally(dir: string, totals: Totals): void {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      tally(file, totals);
      continue;
    }
    if (entry !== "codex-events.jsonl" && entry !== "usage.json") continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.includes('"turn.completed"')) continue;
      const event: unknown = JSON.parse(line);
      const usage =
        typeof event === "object" && event !== null
          ? Object.entries(event).find(([key]) => key === "usage")?.[1]
          : undefined;
      totals.calls += 1;
      totals.input += numberField(usage, "input_tokens");
      totals.cached += numberField(usage, "cached_input_tokens");
      totals.output += numberField(usage, "output_tokens");
    }
  }
}

for (const dir of process.argv.slice(2)) {
  const totals: Totals = { calls: 0, input: 0, cached: 0, output: 0 };
  tally(dir, totals);
  console.log(
    `${path.basename(dir)}: codex turns ${totals.calls}, input ${totals.input} (cached ${totals.cached}, uncached ${totals.input - totals.cached}), output ${totals.output}, total ${totals.input + totals.output}`,
  );
}
