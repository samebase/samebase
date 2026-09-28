/*
Measures the heap size of one kept result, for each result shape.

  node size.ts

Runs each case in its own process with `--expose-gc`, keeps one million results alive, and divides
the heap growth after full collections by the count.
*/
import { spawnSync } from "node:child_process";
import { getHeapStatistics } from "node:v8";
import { sizeCases } from "./workloads.ts";

const COUNT = 1_000_000;
const caseName = process.argv.at(2);

if (caseName === undefined) {
  for (const name of Object.keys(sizeCases)) {
    const child = spawnSync(
      process.execPath,
      ["--expose-gc", new URL(import.meta.url).pathname, name],
      { encoding: "utf8" },
    );
    if (child.status !== 0) throw new Error(child.stderr);
    console.log(`| ${name} | ${child.stdout.trim()} |`);
  }
} else {
  const make = new Map(Object.entries(sizeCases)).get(caseName);
  const collect = globalThis.gc;
  if (!make || !collect) throw new Error(`Run as: node --expose-gc size.ts <case>`);

  const kept: unknown[] = Array.from({ length: COUNT }, () => null);

  collect();
  collect();
  const before = getHeapStatistics().used_heap_size;

  for (let i = 0; i < COUNT; i++) kept[i] = make(i);

  collect();
  collect();
  const after = getHeapStatistics().used_heap_size;

  console.log(`${((after - before) / COUNT).toFixed(1)} B`);
  if (kept.length !== COUNT) throw new Error("The results were not kept");
}
