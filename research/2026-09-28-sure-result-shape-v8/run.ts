/*
Runs every workload variant in its own Node process, for each V8 tier and failure rate.

  node run.ts [repetitions]

Each repetition runs all cells in a new random order, so machine drift spreads over all variants.
Writes `results.json` (one entry per process) and `results.md` (median per cell).
*/
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { workloads } from "./workloads.ts";

const repetitions = Number(process.argv[2] ?? 3);
const benchPath = new URL("bench.ts", import.meta.url).pathname;

const tiers: ReadonlyArray<{ name: string; flags: readonly string[] }> = [
  { name: "Ignition", flags: ["--max-opt=0"] },
  { name: "Sparkplug", flags: ["--max-opt=1"] },
  { name: "Maglev", flags: ["--max-opt=2"] },
  { name: "TurboFan", flags: [] },
  { name: "TurboFan, no escape analysis", flags: ["--no-turbo-escape"] },
];

/*
Escape analysis can only remove results that the caller reads at once.
*/
const escapeWorkloads = new Set(["parse", "chain"]);
const failRates = [0, 0.1, 0.5];

type Cell = { workload: string; variant: string; failRate: number; tier: string; flags: string[] };

const cells: Cell[] = [];
for (const [workload, { variants }] of Object.entries(workloads)) {
  for (const variant of Object.keys(variants)) {
    for (const failRate of failRates) {
      for (const tier of tiers) {
        if (tier.flags.includes("--no-turbo-escape") && !escapeWorkloads.has(workload)) continue;
        cells.push({ workload, variant, failRate, tier: tier.name, flags: [...tier.flags] });
      }
    }
  }
}

type Measurement = Cell & {
  nsPerInput: number;
  minNsPerInput: number;
  bytesPerInput: number;
  checksum: number;
};

const measurements: Measurement[] = [];
const total = repetitions * cells.length;

for (let repetition = 0; repetition < repetitions; repetition++) {
  const order = cells.map((cell) => ({ cell, key: Math.random() })).sort((a, b) => a.key - b.key);

  for (const { cell } of order) {
    const child = spawnSync(
      process.execPath,
      [...cell.flags, benchPath, cell.workload, cell.variant, String(cell.failRate)],
      { encoding: "utf8" },
    );
    const line = child.stdout.trim().split("\n").at(-1);
    if (child.status !== 0 || !line) throw new Error(`${JSON.stringify(cell)}\n${child.stderr}`);

    const result: Omit<Measurement, keyof Cell> = JSON.parse(line);
    measurements.push({ ...cell, ...result });
    process.stderr.write(`\r${measurements.length}/${total}`);
  }
}
process.stderr.write("\n");

writeFileSync(
  new URL("results.json", import.meta.url),
  `${JSON.stringify(
    {
      node: process.version,
      v8: process.versions.v8,
      arch: process.arch,
      repetitions,
      measurements,
    },
    null,
    2,
  )}\n`,
);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function summary(cell: Omit<Cell, "flags">) {
  const matching = measurements.filter(
    (m) =>
      m.workload === cell.workload &&
      m.variant === cell.variant &&
      m.failRate === cell.failRate &&
      m.tier === cell.tier,
  );
  return {
    ns: median(matching.map((m) => m.nsPerInput)),
    spread:
      Math.max(...matching.map((m) => m.nsPerInput)) /
      Math.min(...matching.map((m) => m.nsPerInput)),
    bytes: median(matching.map((m) => m.bytesPerInput)),
  };
}

const lines: string[] = [];
const mismatches: string[] = [];

for (const [workload, { description, variants }] of Object.entries(workloads)) {
  const names = Object.keys(variants);
  lines.push(
    `### ${workload}`,
    "",
    description,
    "",
    `| Tier | Failures | ${names.join(" | ")} | object vs tuple |`,
    `| --- | --- | ${names.map(() => "---").join(" | ")} | --- |`,
  );

  for (const failRate of failRates) {
    const checksums = new Set(
      measurements
        .filter((m) => m.workload === workload && m.failRate === failRate)
        .map((m) => m.checksum),
    );
    if (checksums.size !== 1)
      mismatches.push(`${workload} ${failRate}: ${[...checksums].join(", ")}`);

    for (const tier of tiers) {
      if (tier.flags.includes("--no-turbo-escape") && !escapeWorkloads.has(workload)) continue;

      const results = names.map((variant) =>
        summary({ workload, variant, failRate, tier: tier.name }),
      );
      const tuple = summary({ workload, variant: "tuple", failRate, tier: tier.name });
      const object = summary({ workload, variant: "object", failRate, tier: tier.name });
      const change = Math.round((object.ns / tuple.ns - 1) * 100);

      lines.push(
        `| ${tier.name} | ${failRate * 100}% | ${results
          .map((r) => `${r.ns.toFixed(1)} ns, ${Math.round(r.bytes)} B`)
          .join(" | ")} | ${change > 0 ? "+" : ""}${change}% |`,
      );
    }
  }

  const spreads = names.flatMap((variant) =>
    failRates.flatMap((failRate) =>
      tiers.map((tier) => summary({ workload, variant, failRate, tier: tier.name }).spread),
    ),
  );
  lines.push(
    "",
    `Largest max/min ratio between processes of one cell: ${Math.max(...spreads.filter(Number.isFinite)).toFixed(2)}`,
    "",
  );
}

lines.push(
  mismatches.length
    ? `Checksum mismatches: ${mismatches.join("; ")}`
    : "All variants of each workload and failure rate returned the same checksum.",
);

writeFileSync(new URL("results.md", import.meta.url), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
