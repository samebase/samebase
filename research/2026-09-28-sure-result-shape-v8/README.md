# Sure result shape on V8: tuple or object

Question: does the `@samebase/sure` tuple result, `[true, value] | [false, error]`, perform
differently on V8 from an Evolu-style object result, `{ ok: true, value } | { ok: false, error }`?

## Method

- [`workloads.ts`](workloads.ts) has paired implementations. Each pair runs the same logic on the
  same deterministic inputs. Only the result shape and the way the caller reads it differ.
  - `tuple`: the caller destructures, `const [valid, value] = result`. This is the Sure idiom.
  - `tuple-index`: the caller reads `result[0]` and `result[1]`, with no destructuring.
  - `object`: the caller reads `result.ok`, `result.value`, and `result.error`.
  - `sure`: the real `@samebase/sure` package, as a reference for the schema workload.
- [`bench.ts`](bench.ts) runs one variant in one process: 600 ms warmup, then 25 samples of at least
  10 ms each. It reports the median time per input and the bytes allocated per input. The bytes come
  from `v8.GCProfiler`: the heap size that each collection freed, plus the heap growth that no
  collection freed.
- [`run.ts`](run.ts) starts a new process for every cell, so V8 type feedback from one variant never
  reaches another. Each repetition runs all cells in a new random order. The tables show the median
  of the process medians.
- [`size.ts`](size.ts) keeps one million results alive and measures the heap growth after full
  collections.
- Tiers are pinned with `--max-opt`: 0 is the Ignition interpreter, 1 adds the Sparkplug baseline
  compiler, 2 adds Maglev, and the default adds TurboFan. `--no-turbo-escape` turns off TurboFan
  escape analysis.
- Failure rate is the fraction of inputs that fail validation: 0%, 10%, or 50%.

Workloads:

| Workload | What one input does                                                              |
| -------- | -------------------------------------------------------------------------------- |
| `parse`  | One validator call. The caller reads the result at once.                         |
| `store`  | One validator call. The result goes into an array, and a second loop reads it.   |
| `chain`  | Three validators in sequence. The first failure stops the chain.                 |
| `schema` | A 4-field record with a string array, validated by object and array combinators. |

Run it again:

```sh
node research/2026-09-28-sure-result-shape-v8/size.ts
node research/2026-09-28-sure-result-shape-v8/run.ts 3

# Finding 3: the same cell with and without on-stack replacement
node research/2026-09-28-sure-result-shape-v8/bench.ts parse object 0
node --no-use-osr research/2026-09-28-sure-result-shape-v8/bench.ts parse object 0
```

## Results

Node 24.14.0, V8 13.6, Apple M4 Max, 3 processes per cell. All variants of a workload returned the
same checksum. Between the processes of one cell, the slowest median was at most 1.57 times the
fastest, and at most 1.11 times outside the `store` and `schema` workloads. Full tables:
[`results.md`](results.md). Raw data: [`results.json`](results.json).

### Heap size of one kept result

| Result                                   | Bytes |
| ---------------------------------------- | ----- |
| Tuple (`good`, `bad`, and Sure's `good`) | 64    |
| Object (`ok`, `err`)                     | 40    |

A tuple is 2 heap objects: a 32-byte array header and a 32-byte elements store. An object literal
with 2 fields is 1 heap object of 40 bytes. Node uses 8-byte tagged values.

### Time at 10% failures

Nanoseconds per input.

| Workload | Tier     | tuple  | tuple-index | object | sure   |
| -------- | -------- | ------ | ----------- | ------ | ------ |
| `parse`  | Ignition | 104.1  | 55.1        | 46.5   |        |
| `parse`  | Maglev   | 12.6   | 5.1         | 3.9    |        |
| `parse`  | TurboFan | 3.8    | 5.2         | 3.9    |        |
| `chain`  | Ignition | 323.2  | 158.4       | 136.8  |        |
| `chain`  | TurboFan | 27.2   | 16.5        | 16.7   |        |
| `store`  | TurboFan | 7.2    | 6.0         | 5.5    |        |
| `schema` | Ignition | 1035.9 |             | 580.5  | 1575.9 |
| `schema` | Maglev   | 190.8  |             | 135.1  | 341.1  |
| `schema` | TurboFan | 121.1  |             | 109.4  | 239.7  |

### Time relative to `object`, all workloads and failure rates

| Tier                          | tuple       | tuple-index |
| ----------------------------- | ----------- | ----------- |
| Ignition                      | 1.64 - 2.49 | 1.07 - 1.26 |
| Sparkplug                     | 1.69 - 2.70 | 1.07 - 1.30 |
| Maglev                        | 1.32 - 6.47 | 0.93 - 1.55 |
| TurboFan, 10% and 50% failure | 0.99 - 1.70 | 0.99 - 1.35 |

## Findings

1. **Destructuring costs the time, not the tuple.** `const [valid, value] = result` uses the array
   iterator protocol. Ignition, Sparkplug, and Maglev run that protocol, and each destructure
   allocates 128 more bytes (`parse`: 208 B with destructuring, 80 B with `result[0]` and
   `result[1]`). Only TurboFan removes it, and only with escape analysis: with `--no-turbo-escape`,
   the destructured tuple is 1.6 to 2.8 times slower than the object again. Without destructuring,
   `tuple-index` stays within 1.55 times of `object` in every tier.

2. **In TurboFan, time is almost equal for realistic work.** The `schema` workload differs by 3% to
   11%, which is near the noise between processes. The object still allocates 40 B where the tuple
   allocates 64 B, so with kept results (`store`) the tuple takes 1.22 to 1.30 times as long.

3. **The large tuple wins at 0% failures are an OSR effect.** In `parse` and `chain` at 0% failures,
   the destructured tuple reaches 0 B, and `object` does not (`parse`: 1.0 ns and 0 B, against 2.8
   ns and 40 B). With `--no-use-osr`, `tuple-index` and `object` in `parse` also drop to 1.0 ns. The
   difference comes from code compiled on stack replacement, where escape analysis did not remove
   the allocation. It does not come from the shape. When both outcomes occur, the two allocations
   merge in one value (a phi), escape analysis keeps them, and neither shape is removed.

4. **Idiomatic tuple chains allocate more.** Each step destructures and then wraps the error again
   with `bad(error)`. With failures, `chain` is 1.6 to 1.7 times slower than `object` in TurboFan.
   Passing the failed tuple through unchanged (`tuple-index`) matches `object`.

5. **Sure's own code costs more than its result shape.** The real Sure schema is 2.2 to 2.8 times
   slower than `object` and 1.5 to 2.5 times slower than the minimal tuple copy. Sure's `object`
   calls `Object.entries` on every validation and checks field metadata for each key.

## Conclusion

- **For Samebase, performance is not a reason to change the shape.** In the slowest tier, the
  difference is below 0.5 microseconds per validated record. A Convex function call costs much more.
- **For a library used in hot loops, the object shape is faster.** Code that is not hot stays in
  Ignition, Sparkplug, or Maglev, where the destructured tuple is 1.3 to 6.5 times slower. Each kept
  object result also uses 37% less memory. The tuple only keeps up in TurboFan.
- **The tuple's main advantage has the main cost.** Destructuring with names of your choice is the
  reason to use a tuple, and it is exactly what V8 runs slowly before TurboFan.
