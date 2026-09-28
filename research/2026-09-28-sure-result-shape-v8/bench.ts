/*
Runs one workload variant in this process and prints one JSON line.

  node [V8 flags] bench.ts <workload> <variant> <failRate>

Time is nanoseconds per input. Allocation is bytes per input, from the heap size before and after
each garbage collection during the timed samples.
*/
import { GCProfiler, getHeapStatistics } from "node:v8";
import { readSink, workloads } from "./workloads.ts";

const WARMUP_MS = 600;
const SAMPLE_MS = 10;
const SAMPLE_COUNT = 25;

const [workloadName = "", variantName = "", failRateText = ""] = process.argv.slice(2);
const workload = new Map(Object.entries(workloads)).get(workloadName);
const variant = workload && new Map(Object.entries(workload.variants)).get(variantName);

if (!workload || !variant) {
  throw new Error(`Unknown workload or variant: ${workloadName} ${variantName}`);
}

const inputs = workload.inputs(Number(failRateText));
const step = variant(inputs);

/*
The checksum of one step. `run.ts` compares it across variants to prove equal work.
*/
const checksum = step();

function elapsedNs(repetitions: number): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < repetitions; i++) step();
  return Number(process.hrtime.bigint() - start);
}

const warmupEnd = performance.now() + WARMUP_MS;
while (performance.now() < warmupEnd) step();

let repetitions = 1;
while (elapsedNs(repetitions) < SAMPLE_MS * 1e6) repetitions *= 2;

const profiler = new GCProfiler();
profiler.start();
const heapBefore = getHeapStatistics().used_heap_size;

const samples: number[] = [];
for (let i = 0; i < SAMPLE_COUNT; i++) {
  samples.push(elapsedNs(repetitions) / (repetitions * inputs.length));
}

const heapAfter = getHeapStatistics().used_heap_size;
const collections = profiler.stop().statistics;

/*
Bytes that a collection freed were allocated before it. Add the growth that no collection freed.
*/
let allocated = heapAfter - heapBefore;
for (const collection of collections) {
  allocated +=
    collection.beforeGC.heapStatistics.usedHeapSize -
    collection.afterGC.heapStatistics.usedHeapSize;
}

samples.sort((a, b) => a - b);

console.log(
  JSON.stringify({
    workload: workloadName,
    variant: variantName,
    failRate: Number(failRateText),
    flags: process.execArgv,
    nsPerInput: samples[Math.floor(samples.length / 2)],
    minNsPerInput: samples[0],
    bytesPerInput: allocated / (SAMPLE_COUNT * repetitions * inputs.length),
    collections: collections.length,
    checksum,
    sinkType: typeof readSink(),
  }),
);
